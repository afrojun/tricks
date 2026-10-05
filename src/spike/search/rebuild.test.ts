import { describe, expect, test } from 'vitest'
import {
  type Action,
  type Ctx,
  type Game,
  type Persona,
  type RoundPlay,
  type RuleOverrides,
  type Seat,
  type View,
  CLASSIC_APP_OVERRIDES,
  apply,
  availableActions,
  cardId,
  nextDeadline,
  seatsToAct,
  viewFor,
} from '../../engine'
import { Table, seededRng } from '../../engine/testing'
import { chooseAction, chooseJodhi } from '../../ai/choose'
import { chooseChallenge } from '../../ai/suspicion'
import { applyInPlace } from './applyInPlace'
import { type World, rebuild } from './rebuild'
import { knowledge, sampleWorld } from './sample'
import { checkWorld, playOut, search } from './search'

const playOf = (g: Game): RoundPlay => (g.phase as Extract<Game['phase'], { kind: 'playing' | 'trickPause' }>).play
const inPlay = (g: Game) => g.phase.kind === 'playing' || g.phase.kind === 'trickPause'

/** The world as it really is. */
function trueWorld(game: Game): World {
  const play = playOf(game)
  return { hands: play.hands, stock: play.stock, trump: play.trump }
}

/** The hidden facts the engine records about each play and claim. */
function hiddenFacts(play: RoundPlay): string {
  const record = (x: RoundPlay['current'][number]) => [x.legal, x.handBefore.map(cardId).sort()]
  return JSON.stringify([play.tricks.map((t) => t.plays.map(record)), play.current.map(record), play.jodhiClaims.map((j) => j.valid)])
}

/** Every state of card play in a few games full of cheats, bluffs, Thunee calls and challenges. */
function* states(playerCount: 2 | 4, overrides: RuleOverrides, games: number): Generator<Game> {
  const personas: Persona[] = playerCount === 4 ? ['straight', 'wild', 'sharp', 'sly'] : ['wild', 'sly']
  for (let seed = 1; seed <= games; seed++) {
    const t = new Table(playerCount, { ...overrides, ballsToWin: 6 }, seed).do(0, { type: 'start' })
    const chaos = seededRng(seed * 31 + 7)
    const mind = (s: Seat) => ({ persona: personas[s], salt: t.game.aiSalt })
    for (let guard = 0; guard < 5000 && t.game.phase.kind !== 'gameOver'; guard++) {
      if (t.game.phase.kind === 'roundResult') {
        t.do(0, { type: 'nextRound' })
        continue
      }
      if (inPlay(t.game)) {
        yield t.game
        const challenger = Math.floor(chaos() * playerCount)
        const challenge = chaos() < 0.3 ? chooseChallenge(viewFor(t.game, challenger, 'full'), mind(challenger)) : null
        if (challenge) {
          t.do(challenger, challenge)
          continue
        }
      }
      const waiting = seatsToAct(t.game)
      if (waiting.length === 0) {
        for (let s = 0; s < playerCount && t.game.phase.kind === 'trickPause'; s++) {
          const claim = chooseJodhi(viewFor(t.game, s, 'full'), mind(s))
          if (claim) t.do(s, claim)
          else if (chaos() < 0.05) {
            const open = availableActions(viewFor(t.game, s)).claimJodhi
            if (open.length > 0) t.do(s, { type: 'claimJodhi', suit: open[Math.floor(chaos() * open.length)], withJack: chaos() < 0.5 })
          }
        }
        if (t.game.phase.kind === 'trickPause') yield t.game
        t.now = nextDeadline(t.game)!
        t.do('system', { type: 'tick' })
        continue
      }
      const seat = waiting[0]
      const view = viewFor(t.game, seat, 'full')
      const can = availableActions(view)
      const phase = t.game.phase.kind
      if (phase === 'thuneeWindow' && can.callThunee && chaos() < 0.1) t.do(seat, { type: 'callThunee' })
      else if (phase === 'playing' && chaos() < 0.05) t.do(seat, { type: 'playCard', card: can.play[Math.floor(chaos() * can.play.length)] })
      else t.do(seat, chooseAction(view, mind(seat)))
    }
  }
}

const CONFIGS: [string, 2 | 4, RuleOverrides][] = [
  ['4P traditional', 4, {}],
  ['4P classic', 4, CLASSIC_APP_OVERRIDES],
  ['2P traditional', 2, {}],
  ['2P classic', 2, CLASSIC_APP_OVERRIDES],
]

describe.each(CONFIGS)('rebuild a game from a view: %s', (name, playerCount, overrides) => {
  test('the true world gives back the hidden facts; sampled worlds pass the invariants and give back the view', () => {
    let checked = 0
    let dropped = 0
    const rng = seededRng(99)
    for (const game of states(playerCount, overrides, 12)) {
      for (let seat = 0; seat < playerCount; seat++) {
        const view: View = viewFor(game, seat, 'full')
        const real = rebuild(view, trueWorld(game))
        checkWorld(view, real)
        expect(hiddenFacts(playOf(real))).toBe(hiddenFacts(playOf(game)))

        const k = knowledge(view)
        dropped += k.dropped.length
        for (let i = 0; i < 3; i++) {
          const world = sampleWorld(k, rng)
          checkWorld(view, rebuild(view, world))
          world.hands.forEach((hand, s) => {
            if (s === seat) return
            for (const c of hand) expect(k.voids[s].has(c.suit)).toBe(false)
            for (const c of k.forced[s]) expect(hand.map(cardId)).toContain(cardId(c))
          })
          checked++
        }
      }
    }
    console.log(`${name}: ${checked} sampled worlds checked, ${dropped} constraints dropped`)
    expect(checked).toBeGreaterThan(1000)
  })
})

type Step = (g: Game, actor: Seat | 'system', action: Action, ctx: Ctx) => Game
const cloning: Step = (g, actor, action, ctx) => {
  const r = apply(g, actor, action, ctx)
  if ('rejected' in r) throw new Error(r.rejected)
  return r.game
}
const inPlace: Step = (g, actor, action, ctx) => {
  const r = applyInPlace(g, actor, action, ctx)
  if (typeof r === 'string') throw new Error(r)
  return g
}

describe('the search', () => {
  test('rollouts in place and with cloning give the same results', () => {
    let compared = 0
    for (const game of states(4, {}, 3)) {
      if (game.phase.kind !== 'playing') continue
      const seat = game.phase.turn
      const view = viewFor(game, seat, 'full')
      const world = sampleWorld(knowledge(view), seededRng(compared))
      const action: Action = { type: 'playCard', card: availableActions(view).legal[0] }
      for (const policy of ['random', 'heuristic', 'randomClaims'] as const) {
        const a = cloning(rebuild(view, world), seat, action, { now: 0, rng: seededRng(1) })
        const b = inPlace(rebuild(view, world), seat, action, { now: 0, rng: seededRng(1) })
        expect(playOut(b, seat, 0, policy, seededRng(5), inPlace)).toEqual(playOut(a, seat, 0, policy, seededRng(5), cloning))
        compared++
      }
    }
    expect(compared).toBeGreaterThan(100)
  })

  test('chooses a legal card, the same one for the same seed, with or without cloning', () => {
    let n = 0
    for (const game of states(4, {}, 2)) {
      if (game.phase.kind !== 'playing' || n > 60) continue
      const view = viewFor(game, game.phase.turn, 'full')
      const legal = availableActions(view).legal
      if (legal.length < 2) continue
      const a = search(view, { worlds: 8, policy: 'random', seed: n, check: true })
      const b = search(view, { worlds: 8, policy: 'random', seed: n, cloning: true })
      expect(legal.map(cardId)).toContain(cardId(a.card))
      expect(b).toEqual(a)
      n++
    }
    expect(n).toBeGreaterThan(20)
  })
})
