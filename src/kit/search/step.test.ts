/**
 * Rule 1 of the search player: each engine's `step` is the in-place half of its `apply`. Every game in the list
 * is played through an `apply` that also runs `step` on a copy, with the same random draws, and the two must
 * agree on every state, every event and every rejection; a rejected step leaves its draft as it was.
 *
 * These are the list's seeded contract games and its malformed-action check, played here alone: each game is
 * checked against the contract and its step at once, rather than played again for each.
 */
import { describe, expect, test } from 'vitest'
import { GAMES } from '../../games'
import { STANDARD } from '../../games/hearts'
import { heartsContract } from '../../games/hearts/contract'
import { contractRules, spadesContract } from '../../games/spades/contract'
import { blindNilStates } from '../../games/spades/engine/testing'
import { thuneeContract } from '../../games/thunee/contract'
import { STANDARD as SPADES_STANDARD } from '../../games/spades/engine/rules'
import { TRADITIONAL } from '../../games/thunee/engine'
import { type Contract, checkMalformed, runContract } from '../contract'
import type { AnyGameModule } from '../module'
import type { Actor, Ctx, TableState, TableView } from '../table'
import { clone, deepFreeze, same, seededRng } from '../testing'

interface Tally {
  applied: number
  rejected: number
}

const shown = (value: unknown) => (typeof value === 'symbol' || typeof value === 'function' ? String(value) : (JSON.stringify(value) ?? String(value)))

/** Applies an action both ways, with the same random draws, and throws unless they agree. Returns `apply`'s result. */
function compare(module: AnyGameModule, game: TableState, actor: Actor, action: unknown, ctx: Ctx, tally: Tally) {
  const step = module.step
  if (step === undefined) throw new Error(`${module.id} has no step`)
  const draws: number[] = []
  // Both contexts read `ctx` only when asked: `checkMalformed` watches what a refusal reads, and a read here would count.
  const applied = module.apply(game, actor, action, {
    get now() {
      return ctx.now
    },
    rng: () => {
      const x = ctx.rng()
      draws.push(x)
      return x
    },
  })
  const fail = (what: string): never => {
    throw new Error(`${module.id}, ${game.phase.kind}: ${shown(action)} by ${actor}: ${what}`)
  }
  // A refusal is stepped on the game itself, frozen: any change to the draft throws.
  const draft = 'rejected' in applied ? deepFreeze(game) : clone(game)
  let used = 0
  let stepped: ReturnType<NonNullable<AnyGameModule['step']>>
  try {
    stepped = step(draft, actor, action, {
      get now() {
        return ctx.now
      },
      rng: () => {
        if (used === draws.length) throw new Error(`step drew more randomness than apply`)
        return draws[used++]
      },
    })
  } catch (error) {
    return fail('rejected' in applied && error instanceof TypeError ? `a refused step changed its draft: ${error.message}` : String(error))
  }
  if (used !== draws.length) fail(`step drew ${used} numbers, apply ${draws.length}`)
  if ('rejected' in applied) {
    tally.rejected++
    if (!('rejected' in stepped) || stepped.rejected !== applied.rejected) fail(`apply refused (${applied.rejected}), step gave ${JSON.stringify(stepped)}`)
  } else {
    tally.applied++
    if ('rejected' in stepped) fail(`apply accepted, step refused (${stepped.rejected})`)
    else if (!same(stepped.events, applied.events)) fail('the events differ')
    if (!same(draft, applied.game)) fail('the states differ')
  }
  return applied
}

/**
 * The module with an `apply` that checks `step` against itself on every call. With `probes`, each call is
 * also tried, apart from the run, from another seat and from a spectator, which the engine mostly refuses.
 */
function checked(module: AnyGameModule, tally: Tally, probes = false): AnyGameModule {
  return {
    ...module,
    apply(game, actor, action, ctx) {
      if (probes) {
        const aside = { now: ctx.now, rng: seededRng(7) }
        const other = typeof actor === 'number' ? (actor + 1) % game.playerCount : 0
        for (const someone of [other, null]) compare(module, game, someone, action, aside, tally)
      }
      return compare(module, game, actor, action, ctx, tally)
    },
  }
}

type AnyContract = Contract<TableState, unknown, { type: string }, TableView>

/** A game's contract fixture under one setting, and what its mischief reached. */
interface Fixture {
  contract: AnyContract
  tally: { cheats: number; accusations: number }
}

/** Each game's contract fixture: its random legal player, mischief and hidden cards, at a seat count and with cheating on or off. */
const FIXTURES: Record<string, (playerCount: number, allowCheating: boolean) => Fixture> = {
  thunee: (playerCount, allowCheating) => fixture(thuneeContract({ allowCheating }, playerCount as 2 | 4)),
  hearts: (_, allowCheating) => fixture(heartsContract({ allowCheating })),
  spades: (playerCount, allowCheating) => fixture(spadesContract({ ...contractRules(playerCount), allowCheating }, playerCount as 2 | 3 | 4)),
}

/** A game's fixture, its contract widened to any game's and its tally still checked. */
function fixture<G extends TableState, A, E, V extends TableView>({ contract, tally }: { contract: Contract<G, A, E, V>; tally: Fixture['tally'] }): Fixture {
  return { contract: contract as unknown as AnyContract, tally }
}
/** Seeded whole games per game, seat count and setting. The games' own simulations play many more. */
const SEEDS = 3

const TABLE_ACTIONS = ['sit', 'leaveSeat', 'rename', 'addAi', 'setPersona', 'clearSeat', 'setPlayerCount', 'start', 'replaceWithAi', 'reclaimSeat', 'setSettings']
const TABLE_PATHS = ['sit.seat', 'sit.name', 'rename.name', 'addAi.seat', 'addAi.persona', 'setPersona.seat', 'setPersona.persona', 'clearSeat.seat', 'setPlayerCount.playerCount', 'replaceWithAi.seat', 'setSettings.settings', 'setSettings.settings.pace', 'setSettings.settings.timers']
const overrides = (rules: object) => ['setRules.overrides', ...Object.keys(rules).map((key) => `setRules.overrides.${key}`)]
const card = (at: string) => [at, `${at}.suit`, `${at}.rank`]

/**
 * What the malformed-action check must reach in each game: the phases of a first round (by table size, where they
 * differ), every action a client may send, and every field, and any states the game hands it beyond those. A union's shapes with fields of their own would add those fields here; neither game has one
 * yet (Thunee's trump choice is a suit or `lastCard`), so the exact lists below fail the day one appears unlisted.
 */
const COVERAGE: Record<string, { phases: string[] | Record<number, string[]>; actions: string[]; paths: string[]; also?: () => { label: string; game: TableState }[] }> = {
  thunee: {
    phases: ['calling', 'trumpSelection', 'thuneeWindow', 'playing', 'trickPause', 'roundResult'],
    actions: [
      ...TABLE_ACTIONS,
      ...['setRules', 'call', 'pass', 'preselectTrump', 'chooseTrump', 'callThunee', 'playCard', 'claimJodhi', 'callDouble', 'callKhanaak'],
      ...['challengePlay', 'challengeJodhi', 'challengeThunee', 'nextRound', 'rematch'],
    ],
    paths: [
      ...TABLE_PATHS,
      ...['setSettings.settings.timers.call', 'setSettings.settings.timers.thunee'],
      ...overrides(TRADITIONAL),
      ...['call.amount', 'preselectTrump.choice', 'chooseTrump.choice', ...card('playCard.card'), 'claimJodhi.suit', 'claimJodhi.withJack'],
      ...['challengePlay.seat', 'challengeJodhi.claim', 'rematch.now'],
    ],
  },
  hearts: {
    phases: ['passing', 'playing', 'trickPause', 'roundResult'],
    actions: [...TABLE_ACTIONS, 'setRules', 'choosePass', 'playCard', 'challengePlay', 'nextRound', 'rematch'],
    paths: [
      ...TABLE_PATHS,
      ...overrides(STANDARD),
      ...['choosePass.cards', ...card('choosePass.cards.0'), ...card('choosePass.cards.1'), ...card('choosePass.cards.2')],
      ...[...card('playCard.card'), 'challengePlay.seat', 'rematch.now'],
    ],
  },
  spades: {
    phases: {
      2: ['drawing', 'calling', 'playing', 'trickPause', 'roundResult'],
      3: ['calling', 'playing', 'trickPause', 'roundResult'],
      4: ['calling', 'playing', 'trickPause', 'roundResult'],
    },
    actions: [...TABLE_ACTIONS, 'setRules', 'draw', 'lookAtHand', 'call', 'callBlindNil', 'giveCards', 'playCard', 'challengePlay', 'nextRound', 'rematch'],
    paths: [
      ...TABLE_PATHS,
      ...overrides(SPADES_STANDARD),
      ...['draw.keep', 'call.tricks', 'giveCards.cards', ...card('giveCards.cards.0'), ...card('giveCards.cards.1')],
      ...[...card('playCard.card'), 'challengePlay.seat', 'rematch.now'],
    ],
    // A Blind nil needs a side 100 behind, which a new game never is: its exchange, before and after the first gift.
    also: blindNilStates,
  },
}

describe('step is the in-place half of apply', () => {
  test('every game in the list has a step, a contract fixture, and what the malformed-action check must reach in it', () => {
    for (const [id, module] of GAMES) expect(module.step, id).toBeDefined()
    expect(Object.keys(FIXTURES).sort()).toEqual([...GAMES.keys()].sort())
    expect(Object.keys(COVERAGE).sort()).toEqual([...GAMES.keys()].sort())
  })

  for (const module of GAMES.values()) {
    for (const playerCount of module.seatCounts) {
      for (const allowCheating of [true, false]) {
        test(`${module.id}, ${playerCount} players, cheating ${allowCheating ? 'on' : 'off'}: seeded whole games keep the contract, refusals included`, () => {
          const tally: Tally = { applied: 0, rejected: 0 }
          const fixture = FIXTURES[module.id](playerCount, allowCheating)
          // The fixture plays the listed module itself, not a copy of its parts; here its apply checks its step.
          expect(fixture.contract.module).toBe(module)
          let actions = 0
          let refused = 0
          for (let seed = 1; seed <= SEEDS; seed++) {
            const run = runContract({ ...fixture.contract, module: checked(module, tally, true) }, seed)
            expect(run.game.phase.kind).toBe('gameOver')
            expect(run.game.playerCount).toBe(playerCount)
            actions += run.actions
            refused += run.refused
          }
          expect(actions).toBeGreaterThan(SEEDS * 50)
          // The mischief must reach the corners it is meant to, or this proves little.
          if (allowCheating) expect(fixture.tally.cheats).toBeGreaterThan(0)
          else {
            expect(fixture.tally).toMatchObject({ cheats: 0, accusations: 0 })
            expect(refused).toBeGreaterThan(0)
          }
          // A Thunee game with cheating on can end inside a hundred actions once a cheat is caught, so the bar is modest.
          expect(tally.applied).toBeGreaterThan(SEEDS * 50)
          expect(tally.rejected).toBeGreaterThan(SEEDS * 50)
        })
      }
    }

    test(`${module.id}: every malformed action, from anyone, in every phase reached`, () => {
      const tally: Tally = { applied: 0, rejected: 0 }
      const coverage = COVERAGE[module.id]
      const also = coverage.also?.() ?? []
      const covered = checkMalformed(checked(module, tally), 1, also)
      expect(covered.states[0]).toBe('an empty lobby')
      for (const count of module.seatCounts) {
        expect(covered.states).toContain(`a full lobby of ${count}`)
        const phases = Array.isArray(coverage.phases) ? coverage.phases : coverage.phases[count]
        for (const phase of phases) expect(covered.states).toContain(`${phase} with ${count}`)
      }
      for (const { label } of also) expect(covered.states).toContain(label)
      expect([...covered.actions].sort()).toEqual([...COVERAGE[module.id].actions].sort())
      expect([...covered.paths].sort()).toEqual([...COVERAGE[module.id].paths].sort())
      expect(tally.rejected).toBeGreaterThan(10_000)
      expect(tally.applied).toBeGreaterThan(100)
    })
  }

  test('the check catches a step that differs from apply, or changes a draft it refuses', () => {
    const hearts = GAMES.get('hearts')!
    const tally: Tally = { applied: 0, rejected: 0 }
    const { contract } = FIXTURES.hearts(4, true)
    const extraEvent: AnyGameModule = {
      ...hearts,
      step(draft, actor, action, ctx) {
        const result = hearts.step!(draft, actor, action, ctx)
        return 'events' in result ? { events: [...result.events, { type: 'seatChanged' }] } : result
      },
    }
    expect(() => runContract({ ...contract, module: checked(extraEvent, tally, true) }, 1)).toThrow(/the events differ/)
    const scribbles: AnyGameModule = {
      ...hearts,
      step(draft, actor, action, ctx) {
        const result = hearts.step!(draft, actor, action, ctx)
        if ('rejected' in result) draft.aiSalt++
        return result
      },
    }
    expect(() => runContract({ ...contract, module: checked(scribbles, tally, true) }, 1)).toThrow(/a refused step changed its draft/)
  })
})
