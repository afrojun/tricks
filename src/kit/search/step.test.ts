/**
 * Rule 1 of the search player: each engine's `step` is the in-place half of its `apply`. Every game in the list
 * that has a `step` is played through an `apply` that also runs `step` on a copy, with the same random draws,
 * and the two must agree on every state, every event and every rejection; a rejected step leaves its draft as it was.
 */
import { describe, expect, test } from 'vitest'
import { GAMES } from '../../games'
import { heartsContract } from '../../games/hearts/contract'
import { thuneeContract } from '../../games/thunee/contract'
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

/** Each game's contract fixture: its random legal player, mischief and hidden cards. */
const FIXTURES: Record<string, (playerCount: number, allowCheating: boolean) => AnyContract> = {
  thunee: (playerCount, allowCheating) => thuneeContract({ allowCheating }, playerCount as 2 | 4).contract as unknown as AnyContract,
  hearts: (_, allowCheating) => heartsContract({ allowCheating }).contract as unknown as AnyContract,
}
const SEEDS = 3

describe('step is the in-place half of apply', () => {
  const stepping = [...GAMES.values()].filter((module) => module.step !== undefined)

  test('every game that has a step is checked, Hearts among them; a game without one is left for later', () => {
    expect(stepping.map((m) => m.id)).toContain('hearts')
    expect(Object.keys(FIXTURES).sort()).toEqual([...GAMES.keys()].sort())
  })

  for (const module of stepping) {
    for (const playerCount of module.seatCounts) {
      for (const allowCheating of [true, false]) {
        test(`${module.id}, ${playerCount} players, cheating ${allowCheating ? 'on' : 'off'}: seeded whole games, refusals included`, () => {
          const tally: Tally = { applied: 0, rejected: 0 }
          const contract = FIXTURES[module.id](playerCount, allowCheating)
          for (let seed = 1; seed <= SEEDS; seed++) {
            const run = runContract({ ...contract, module: checked(module, tally, true) }, seed)
            expect(run.game.phase.kind).toBe('gameOver')
          }
          // A Thunee game with cheating on can end inside a hundred actions once a cheat is caught, so the bar is modest.
          expect(tally.applied).toBeGreaterThan(SEEDS * 50)
          expect(tally.rejected).toBeGreaterThan(SEEDS * 50)
        })
      }
    }

    test(`${module.id}: every malformed action, from anyone, in every phase reached`, () => {
      const tally: Tally = { applied: 0, rejected: 0 }
      checkMalformed(checked(module, tally))
      expect(tally.rejected).toBeGreaterThan(10_000)
      expect(tally.applied).toBeGreaterThan(100)
    })
  }

  test('the check catches a step that differs from apply, or changes a draft it refuses', () => {
    const hearts = GAMES.get('hearts')!
    const tally: Tally = { applied: 0, rejected: 0 }
    const contract = FIXTURES.hearts(4, true)
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
