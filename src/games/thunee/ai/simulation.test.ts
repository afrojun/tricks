import { describe, expect, test } from 'vitest'
import {
  type Game,
  TUSCANS_OVERRIDES,
  SUITS,
  actionSchema,
  availableActions,
  checkInvariants,
  hasCard,
  nextDeadline,
  seatsToAct,
  teamOf,
  viewFor,
} from '../engine'
import { ALTERNATIVES, Table, type TableOptions, seededRng } from '../engine/testing'
import { hiddenFrom } from '../contract'
import { exposed, same } from '../../../kit/testing'
import { chooseAction, chooseJodhi } from './choose'
import { HONEST } from '../../../kit/mind'
import { chooseChallenge } from './suspicion'

/** Raise with SIM_GAMES=2000 for a soak run. */
const GAMES = Number(process.env.SIM_GAMES ?? 30)

const SECRETS = ['handBefore', 'broke', 'valid', 'stock', 'dealt', 'aiSalt']

function expectNoLeak(game: Game, seat: number | null) {
  const phase = game.phase
  if (!('hands' in phase || 'play' in phase)) return
  const view = viewFor(game, seat)
  const shown = exposed(view, hiddenFrom(game, seat), SECRETS)
  if (shown.cards.length > 0) throw new Error(`view for ${seat} leaks ${JSON.stringify(shown.cards)} in ${phase.kind}`)
  for (const secret of SECRETS) if (shown.keys.has(secret)) throw new Error(`view contains "${secret}":`)
  if ((phase.kind === 'playing' || phase.kind === 'trickPause') && !phase.play.trumpRevealed) {
    const v = view.phase
    const mayKnow = seat === phase.play.trumper && phase.play.thunee === null
    if ('trump' in v && v.trump !== null && !mayKnow) throw new Error('trump leaked before reveal')
  }
}

/** Plays one whole game with AI decisions plus occasional cheating, bluffing and challenging. */
function playGame(playerCount: 2 | 4, overrides: TableOptions, seed: number) {
  const t = new Table(playerCount, overrides, seed)
  const chaos = seededRng(seed * 7919 + 1)
  const pick = <T,>(items: readonly T[]) => items[Math.floor(chaos() * items.length)]
  const stats = { rounds: 0, reasons: new Set<string>(), actions: 0, refused: 0 }
  t.do(0, { type: 'start' })

  const step = (seat: number | null, action: Parameters<Table['do']>[1], mustSucceed: boolean) => {
    // Checked after every action, so without expect's cost.
    if (seat !== null && !actionSchema.safeParse(action).success) throw new Error(`seed ${seed}: ${JSON.stringify(action)} is not a valid message`)
    const rejected = t.try(seat ?? 'system', action)
    if (mustSucceed && rejected !== null) {
      throw new Error(`seed ${seed}: ${JSON.stringify(action)} by ${seat} rejected (${rejected}) in ${t.game.phase.kind}`)
    }
    if (rejected !== null) stats.refused++
    else {
      stats.actions++
      checkInvariants(t.game)
      expectNoLeak(t.game, pick([0, 1, null]))
    }
    return rejected
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
      // Checked after every round, so without expect's cost.
      if (s.reason === 'normal' && s.cardPoints[0] + s.cardPoints[1] !== 304) throw new Error(`seed ${seed}: a normal round counted ${s.cardPoints}`)
      if (!same(s.ballsAfter, t.game.balls)) throw new Error(`seed ${seed}: balls ${t.game.balls} after a summary of ${s.ballsAfter}`)
      step(0, { type: 'nextRound' }, true)
      continue
    }

    // Jodhi: honest claims from the AI, plus the odd bluff.
    if (phase.kind === 'playing' || phase.kind === 'trickPause') {
      for (let seat = 0; seat < playerCount; seat++) {
        const honest = chooseJodhi(viewFor(t.game, seat, 'full'), HONEST)
        if (honest) step(seat, honest, true)
        else if (chaos() < 0.02 && t.can(seat).claimJodhi.length > 0) {
          step(seat, { type: 'claimJodhi', suit: pick(SUITS), withJack: chaos() < 0.5 }, false)
        }
      }
      if (t.game.phase !== phase && t.game.phase.kind !== phase.kind) continue
      // The occasional challenge, right or wrong.
      if (chaos() < 0.01) {
        const seat = Math.floor(chaos() * playerCount)
        const can = t.can(seat)
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
    const can = availableActions(view)
    if (!same(can, t.can(seat))) throw new Error(`seed ${seed}: what seat ${seat} may do depends on memory in ${current.kind}`)
    if (current.kind === 'playing' && chaos() < 0.03) {
      // Possibly a cheat, accepted only while cheating is allowed; the invariants check nothing breaks a rule otherwise.
      const card = pick(current.play.hands[seat])
      const accepted = hasCard(can.play, card)
      const rejected = step(seat, { type: 'playCard', card }, accepted)
      if (!accepted && rejected !== 'illegalCard') throw new Error(`seed ${seed}: a card seat ${seat} may not play gave ${rejected}, not illegalCard`)
    } else if (current.kind === 'playing' && chaos() < 0.05 && can.callKhanaak) {
      step(seat, { type: 'callKhanaak' }, true)
    } else if (current.kind === 'playing' && chaos() < 0.3 && can.callDouble) {
      step(seat, { type: 'callDouble' }, true)
    } else if (current.kind === 'thuneeWindow' && chaos() < 0.03 && can.callThunee) {
      step(seat, { type: 'callThunee' }, true)
    } else if (current.kind === 'calling' && chaos() < 0.2 && can.calls.length > 0) {
      step(seat, { type: 'call', amount: can.calls[0] }, true)
    } else {
      step(seat, chooseAction(view, HONEST), true) // AI actions must never be rejected
    }
  }
  throw new Error(`seed ${seed}: game did not finish`)
}

describe('simulation', () => {
  const configs: [string, 2 | 4, TableOptions][] = [
    ['4P traditional', 4, {}],
    ['4P alternatives', 4, ALTERNATIVES],
    ['4P Tuscans', 4, TUSCANS_OVERRIDES],
    ['2P traditional', 2, {}],
    ['2P alternatives', 2, ALTERNATIVES],
    ['4P two to clear, short game', 4, { twoToClear: true, ballsToWin: 5, thuneeWindowSeconds: 0 }],
    ['4P traditional, cheating off', 4, { allowCheating: false }],
    ['2P alternatives, cheating off', 2, { ...ALTERNATIVES, allowCheating: false }],
  ]
  for (const [name, playerCount, overrides] of configs) {
    test(`${GAMES} seeded games finish with every invariant intact: ${name}`, () => {
      const reasons = new Set<string>()
      let actions = 0
      let refused = 0
      for (let seed = 1; seed <= GAMES; seed++) {
        const stats = playGame(playerCount, overrides, seed)
        stats.reasons.forEach((r) => reasons.add(r))
        actions += stats.actions
        refused += stats.refused
      }
      expect(actions).toBeGreaterThan(GAMES * 50)
      // The chaos must actually reach the unusual endings, or this test proves little.
      console.log(`${name}: ${actions} actions, ${refused} refused, endings: ${[...reasons].sort().join(', ')}`)
      if (overrides.allowCheating === false) {
        // Nobody may accuse, and the chaos's rule-breaking cards and false claims were all refused.
        expect([...reasons]).toContain('normal')
        expect([...reasons]).not.toContain('challenge')
        expect(refused).toBeGreaterThan(0)
      } else expect([...reasons]).toEqual(expect.arrayContaining(['normal', 'challenge']))
    }, Math.max(120_000, GAMES * 2_000))
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
        // Checked after every action, so without expect's cost.
        if (p.kind === 'playing' || p.kind === 'trickPause') {
          if (p.play.current.some((r) => r.broke.length > 0)) throw new Error(`seed ${seed}: a card broke a rule`)
          if (p.play.jodhiClaims.some((j) => !j.valid)) throw new Error(`seed ${seed}: a Jodhi was bluffed`)
          for (const seat of [0, 2]) {
            if (chooseChallenge(viewFor(t.game, seat, 'full'), mind(seat)) !== null) throw new Error(`seed ${seed}: seat ${seat} challenges without a proof`)
          }
        }
      }
      expect(t.game.phase.kind).toBe('gameOver')
      expect(teamOf(0)).toBe(0)
    }
  })
})
