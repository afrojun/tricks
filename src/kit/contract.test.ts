import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { checkMalformed } from './contract'
import type { GameModule } from './module'
import { type Actor, type Ctx, type TableAction, type TableEvent, type TableState, type TableView, emptySeats, isAction, isActor, isTableAction, tableAction, tableActionSchemas, tableView } from './table'

/** The smallest game: a lobby, then one phase in which anyone may name a suit. */
type ToyAction = TableAction | { type: 'name'; card: { suit: string } }

function toy(careful: { fields: boolean; actors: boolean }): GameModule<TableState, ToyAction, TableEvent, TableView> {
  return {
    id: 'toy',
    formatVersion: 1,
    seatCounts: [2],
    createGame: () => ({ formatVersion: 1, playerCount: 2, seats: emptySeats(2), host: null, waiting: [], aiActAt: null, aiSalt: 0, phase: { kind: 'lobby' } }),
    apply(game: TableState, actor: Actor, action: ToyAction, ctx: Ctx) {
      if (!isAction(action)) return { rejected: 'notAllowed' }
      if (careful.actors && !isActor(game, actor)) return { rejected: 'notSeated' }
      const draft = structuredClone(game)
      const events: TableEvent[] = []
      if (isTableAction(action)) {
        const rejected = tableAction(draft, actor, action, ctx, events, { seatCounts: [2] })
        if (rejected !== null) return { rejected }
        if (action.type === 'start') draft.phase = { kind: 'naming' }
        return { game: draft, events }
      }
      if (action.type !== 'name' || typeof actor !== 'number' || game.phase.kind !== 'naming') return { rejected: 'notAllowed' }
      if (careful.fields && typeof action.card?.suit !== 'string') return { rejected: 'notAllowed' }
      // A careless game reads the seat and the field before checking either.
      draft.seats[actor].name = action.card.suit.slice(0, 3)
      return { game: draft, events }
    },
    viewFor: (game, seat) => ({ ...tableView(game, seat), phase: game.phase }),
    seatsToAct: () => [],
    nextDeadline: () => null,
    checkInvariants: () => {},
    actionSchema: z.discriminatedUnion('type', [...tableActionSchemas([2]), z.object({ type: z.literal('name'), card: z.object({ suit: z.string() }) })]),
    dueStep: () => null,
    reactions: () => [],
  }
}

describe('the malformed-action check', () => {
  test('passes a game that refuses whatever it cannot read, and covers every state it reaches', () => {
    expect(checkMalformed(toy({ fields: true, actors: true }))).toEqual(['an empty lobby', 'a full lobby of 2', 'naming with 2'])
  })

  test('finds a field read before it is checked', () => {
    expect(() => checkMalformed(toy({ fields: false, actors: true }))).toThrow(/^toy: \{"type":"name"\} by 0 in naming with 2 threw TypeError/)
  })

  test('finds an actor outside the table', () => {
    expect(() => checkMalformed(toy({ fields: true, actors: false }))).toThrow(/^toy: \{"type":"rename","name":"x"\} by 2 in an empty lobby threw TypeError/)
  })
})
