import { describe, expect, test } from 'vitest'
import {
  type Game,
  type RuleOverrides,
  CLASSIC_APP_OVERRIDES,
  SUITS,
  actionSchema,
  availableActions,
  checkInvariants,
  nextDeadline,
  sameCard,
  seatsToAct,
  teamOf,
  viewFor,
} from '../engine'
import { Table, collectCards, seededRng } from '../engine/testing'
import { chooseAction, chooseJodhi } from './choose'
import { HONEST } from './mind'
import { chooseChallenge } from './suspicion'

/** Raise with SIM_GAMES=2000 for a soak run. */
const GAMES = Number(process.env.SIM_GAMES ?? 30)

function expectNoLeak(game: Game, seat: number | null) {
  const phase = game.phase
  const hands = 'hands' in phase ? phase.hands : 'play' in phase ? phase.play.hands : null
  if (hands === null) return
  const stock = 'stock' in phase ? phase.stock : 'play' in phase ? phase.play.stock : []
  // Cards of tricks before the last one have been turned down and must be gone from the view too.
  const forgotten = 'play' in phase ? phase.play.tricks.slice(0, -1).flatMap((t) => t.plays.map((p) => p.card)) : []
  const hidden = [...hands.filter((_, s) => s !== seat).flat(), ...stock, ...forgotten]
  const leaked = collectCards(viewFor(game, seat)).filter((c) => hidden.some((h) => sameCard(h, c)))
  if (leaked.length > 0) throw new Error(`view for ${seat} leaks ${JSON.stringify(leaked)} in ${phase.kind}`)
  const text = JSON.stringify(viewFor(game, seat))
  for (const secret of ['"handBefore":', '"broke":', '"valid":', '"stock":', '"dealt":', '"aiSalt":']) {
    if (text.includes(secret)) throw new Error(`view contains ${secret}`)
  }
  if ((phase.kind === 'playing' || phase.kind === 'trickPause') && !phase.play.trumpRevealed) {
    const v = viewFor(game, seat).phase
    const mayKnow = seat === phase.play.trumper && phase.play.thunee === null
    if ('trump' in v && v.trump !== null && !mayKnow) throw new Error('trump leaked before reveal')
  }
}

/** Plays one whole game with AI decisions plus occasional cheating, bluffing and challenging. */
function playGame(playerCount: 2 | 4, overrides: RuleOverrides, seed: number) {
  const t = new Table(playerCount, overrides, seed)
  const chaos = seededRng(seed * 7919 + 1)
  const pick = <T,>(items: readonly T[]) => items[Math.floor(chaos() * items.length)]
  const stats = { rounds: 0, reasons: new Set<string>(), actions: 0 }
  t.do(0, { type: 'start' })

  const step = (seat: number | null, action: Parameters<Table['do']>[1], mustSucceed: boolean) => {
    if (seat !== null) expect(actionSchema.safeParse(action).success).toBe(true)
    const rejected = t.try(seat ?? 'system', action)
    if (mustSucceed && rejected !== null) {
      throw new Error(`seed ${seed}: ${JSON.stringify(action)} by ${seat} rejected (${rejected}) in ${t.game.phase.kind}`)
    }
    if (rejected === null) {
      stats.actions++
      checkInvariants(t.game)
      expectNoLeak(t.game, pick([0, 1, null]))
    }
  }

  for (let guard = 0; guard < 20_000; guard++) {
    const phase = t.game.phase
    if (phase.kind === 'gameOver') {
      expect(Math.max(...t.game.balls)).toBeGreaterThanOrEqual(viewFor(t.game, 0).ballsTarget)
      expect(t.game.balls[phase.winner]).toBeGreaterThan(t.game.balls[1 - phase.winner])
      return stats
    }
    if (phase.kind === 'roundResult') {
      const s = phase.summary
      stats.rounds++
      stats.reasons.add(s.reason)
      if (s.reason === 'normal') expect(s.cardPoints[0] + s.cardPoints[1]).toBe(304)
      expect(s.ballsAfter).toEqual(t.game.balls)
      step(0, { type: 'nextRound' }, true)
      continue
    }

    // Jodhi: honest claims from the AI, plus the odd bluff.
    if (phase.kind === 'playing' || phase.kind === 'trickPause') {
      for (let seat = 0; seat < playerCount; seat++) {
        const honest = chooseJodhi(viewFor(t.game, seat, 'full'), HONEST)
        if (honest) step(seat, honest, true)
        else if (chaos() < 0.02 && availableActions(viewFor(t.game, seat)).claimJodhi.length > 0) {
          step(seat, { type: 'claimJodhi', suit: pick(SUITS), withJack: chaos() < 0.5 }, false)
        }
      }
      if (t.game.phase !== phase && t.game.phase.kind !== phase.kind) continue
      // The occasional challenge, right or wrong.
      if (chaos() < 0.01) {
        const seat = Math.floor(chaos() * playerCount)
        const can = availableActions(viewFor(t.game, seat))
        if (can.challengeJodhi.length > 0 && chaos() < 0.5) {
          step(seat, { type: 'challengeJodhi', claim: pick(can.challengeJodhi) }, true)
          continue
        }
        if (can.challengePlay.length > 0) {
          step(seat, { type: 'challengePlay', seat: pick(can.challengePlay) }, true)
          continue
        }
      }
    }

    const current = t.game.phase
    const waiting = seatsToAct(t.game)
    // Sometimes let a window run out instead of having everyone answer.
    const letTimerRun = 'deadline' in current && (waiting.length === 0 || chaos() < 0.15)
    if (letTimerRun) {
      t.now = nextDeadline(t.game)!
      step(null, { type: 'tick' }, true)
      continue
    }
    const seat = pick(waiting)
    const view = viewFor(t.game, seat, 'full')
    expect(availableActions(view)).toEqual(availableActions(viewFor(t.game, seat)))
    if (current.kind === 'playing' && chaos() < 0.03) {
      step(seat, { type: 'playCard', card: pick(availableActions(view).play) }, true) // possibly a cheat
    } else if (current.kind === 'playing' && chaos() < 0.05 && availableActions(view).callKhanaak) {
      step(seat, { type: 'callKhanaak' }, true)
    } else if (current.kind === 'playing' && chaos() < 0.3 && availableActions(view).callDouble) {
      step(seat, { type: 'callDouble' }, true)
    } else if (current.kind === 'thuneeWindow' && chaos() < 0.03 && availableActions(view).callThunee) {
      step(seat, { type: 'callThunee' }, true)
    } else if (current.kind === 'calling' && chaos() < 0.2 && availableActions(view).calls.length > 0) {
      step(seat, { type: 'call', amount: availableActions(view).calls[0] }, true)
    } else {
      step(seat, chooseAction(view, HONEST), true) // AI actions must never be rejected
    }
  }
  throw new Error(`seed ${seed}: game did not finish`)
}

describe('simulation', () => {
  const configs: [string, 2 | 4, RuleOverrides][] = [
    ['4P traditional', 4, {}],
    ['4P classic', 4, CLASSIC_APP_OVERRIDES],
    ['2P traditional', 2, {}],
    ['2P classic', 2, CLASSIC_APP_OVERRIDES],
    ['4P two to clear, short game', 4, { twoToClear: true, ballsToWin: 5, thuneeWindowSeconds: 0 }],
  ]
  for (const [name, playerCount, overrides] of configs) {
    test(`${GAMES} seeded games finish with every invariant intact: ${name}`, () => {
      const reasons = new Set<string>()
      let actions = 0
      for (let seed = 1; seed <= GAMES; seed++) {
        const stats = playGame(playerCount, overrides, seed)
        stats.reasons.forEach((r) => reasons.add(r))
        actions += stats.actions
      }
      expect(actions).toBeGreaterThan(GAMES * 50)
      // The chaos must actually reach the unusual endings, or this test proves little.
      console.log(`${name}: ${actions} actions, endings: ${[...reasons].sort().join(', ')}`)
      expect([...reasons]).toEqual(expect.arrayContaining(['normal', 'challenge']))
    }, 120_000)
  }

  test('Straight and Sharp on their own never cheat, never bluff, and Straight never sees a proof that is not there', () => {
    const personas = ['straight', 'sharp', 'straight', 'sharp'] as const
    for (let seed = 1; seed <= 20; seed++) {
      const t = new Table(4, {}, seed).do(0, { type: 'start' })
      const mind = (seat: number) => ({ persona: personas[seat], salt: t.game.aiSalt })
      for (let guard = 0; guard < 5000 && t.game.phase.kind !== 'gameOver'; guard++) {
        const phase = t.game.phase
        if (phase.kind === 'roundResult') t.do(0, { type: 'nextRound' })
        else if (seatsToAct(t.game).length === 0) {
          for (let seat = 0; seat < 4; seat++) {
            const claim = chooseJodhi(viewFor(t.game, seat, 'full'), mind(seat))
            if (claim) t.do(seat, claim)
          }
          t.now = nextDeadline(t.game)!
          t.do('system', { type: 'tick' })
        } else {
          const seat = seatsToAct(t.game)[0]
          t.do(seat, chooseAction(viewFor(t.game, seat, 'full'), mind(seat)))
        }
        const p = t.game.phase
        if (p.kind === 'playing' || p.kind === 'trickPause') {
          expect(p.play.current.every((r) => r.broke.length === 0)).toBe(true)
          expect(p.play.jodhiClaims.every((j) => j.valid)).toBe(true)
          for (const seat of [0, 2]) expect(chooseChallenge(viewFor(t.game, seat, 'full'), mind(seat))).toBeNull()
        }
      }
      expect(t.game.phase.kind).toBe('gameOver')
      expect(teamOf(0)).toBe(0)
    }
  })
})
