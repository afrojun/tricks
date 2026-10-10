import { describe, expect, test } from 'vitest'
import { thunee } from '..'
import { thuneeContract } from '../contract'
import { checkMalformed, runContract } from '../../../kit/contract'
import type { GameModule } from '../../../kit/module'
import type { Ctx } from '../../../kit/table'
import { clone, deepFreeze, same } from '../../../kit/testing'
import { type Action, type Game, type GameEvent, type View, apply, step } from '.'

/** How often the two halves were compared, to show both paths were exercised. */
interface Tally {
  applied: number
  rejected: number
}

/**
 * Thunee, with every `apply` also run through `step` on the same randomness and the two compared:
 * the same game and events, or the same rejection. A refusal is stepped on the frozen game itself,
 * so a refusal that changed anything first would throw.
 */
function twin(tally: Tally): GameModule<Game, Action, GameEvent, View> {
  return {
    ...thunee,
    apply(game, actor, action, ctx) {
      deepFreeze(game)
      const drawn: number[] = []
      // The clock is read only when apply reads it, so that checkMalformed sees a refusal that read nothing.
      const viaApply = apply(game, actor, action, {
        get now() {
          return ctx.now
        },
        rng: () => drawn[drawn.push(ctx.rng()) - 1],
      })
      const what = () => `${JSON.stringify(action)} by ${actor} in ${game.phase.kind}`
      let next = 0
      const replay: Ctx = {
        get now() {
          return ctx.now
        },
        rng: () => {
          if (next >= drawn.length) throw new Error(`step drew more randomness than apply for ${what()}`)
          return drawn[next++]
        },
      }
      if ('rejected' in viaApply) {
        let viaStep: ReturnType<typeof step>
        try {
          viaStep = step(game, actor, action, replay)
        } catch (error) {
          throw new Error(`step changed the draft while refusing ${what()}: ${error}`)
        }
        if (!('rejected' in viaStep) || viaStep.rejected !== viaApply.rejected) throw new Error(`apply refused ${what()} as ${viaApply.rejected}; step gave ${JSON.stringify(viaStep)}`)
        tally.rejected++
      } else {
        const draft = clone(game)
        const viaStep = step(draft, actor, action, replay)
        if ('rejected' in viaStep) throw new Error(`apply took ${what()}; step refused it as ${viaStep.rejected}`)
        if (!same(viaStep.events, viaApply.events)) throw new Error(`the events differ for ${what()}`)
        if (!same(draft, viaApply.game)) throw new Error(`the games differ after ${what()}`)
        tally.applied++
      }
      if (next !== drawn.length) throw new Error(`step drew less randomness than apply for ${what()}`)
      return viaApply
    },
  }
}

describe('the in-place step', () => {
  for (const playerCount of [2, 4] as const) {
    for (const allowCheating of [true, false]) {
      test(`agrees with apply on seeded whole games, ${playerCount} players, cheating ${allowCheating ? 'on' : 'off'}`, () => {
        const tally: Tally = { applied: 0, rejected: 0 }
        for (const seed of [1, 2, 3]) {
          const { contract } = thuneeContract({ allowCheating }, playerCount)
          runContract({ ...contract, module: twin(tally) }, seed)
        }
        expect(tally.applied).toBeGreaterThan(200)
        // With cheating off, mischief is refused; with it on, accusations end rounds before much is refused.
        if (!allowCheating) expect(tally.rejected).toBeGreaterThan(5)
      })
    }
  }

  test('agrees with apply on every malformed action, from anyone, in every phase', () => {
    const tally: Tally = { applied: 0, rejected: 0 }
    checkMalformed(twin(tally))
    expect(tally.rejected).toBeGreaterThan(10_000)
    expect(tally.applied).toBeGreaterThan(100)
  })

  test('apply is a clone, then the step', () => {
    const game = thunee.createGame()
    const ctx: Ctx = { now: 0, rng: () => 0.5 }
    const draft = structuredClone(game)
    const result = step(draft, null, { type: 'sit', seat: 1, name: 'Asha' }, ctx)
    expect(result).toEqual({ events: [{ type: 'seatChanged' }] })
    expect(draft.seats[1]).toMatchObject({ name: 'Asha', kind: 'human' })
    expect(game.seats[1].kind).toBe('empty')
    expect(apply(game, null, { type: 'sit', seat: 1, name: 'Asha' }, ctx)).toEqual({ game: draft, events: [{ type: 'seatChanged' }] })
  })
})
