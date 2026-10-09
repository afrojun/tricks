import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { checkMalformed } from './contract'
import type { GameModule } from './module'
import { type Actor, type Ctx, type TableAction, type TableEvent, type TableState, type TableView, emptySeats, isAction, isActor, isTableAction, tableAction, tableActionSchemas, tableView } from './table'

/** The smallest game: a lobby, then one phase in which anyone may name a card, pick a card or a joker, or say they are ready. */
type ToyAction =
  | TableAction
  | { type: 'name'; card: { suit: string; rank: string } }
  | { type: 'pick'; choice: { suit: string; rank: string } | { joker: boolean } }
  | { type: 'ready' }

/** Ways a careless game reads what it was sent before checking it. */
interface Faults {
  /** Reads a card's rank once its suit has passed. */
  sibling?: boolean
  /** Reads an actor's seat without checking it is at the table. */
  actor?: boolean
  /** Reads the seat of whoever says they are ready, a spectator included. */
  spectator?: boolean
  /** Reads a joker's flag once it knows the choice is a joker. */
  branch?: boolean
}

const cardSchema = z.object({ suit: z.enum(['clubs', 'hearts']), rank: z.string() })
const toySchema = z.discriminatedUnion('type', [
  ...tableActionSchemas([2]),
  z.object({ type: z.literal('name'), card: cardSchema }),
  z.object({ type: z.literal('pick'), choice: z.union([cardSchema, z.object({ joker: z.boolean() })]) }),
  z.object({ type: z.literal('ready') }),
])

function toy(faults: Faults = {}, actionSchema: z.ZodType = toySchema): GameModule<TableState, ToyAction, TableEvent, TableView> {
  return {
    id: 'toy',
    formatVersion: 1,
    seatCounts: [2],
    createGame: () => ({ formatVersion: 1, playerCount: 2, seats: emptySeats(2), host: null, waiting: [], aiActAt: null, aiSalt: 0, phase: { kind: 'lobby' } }),
    apply(game: TableState, actor: Actor, action: ToyAction, ctx: Ctx) {
      if (!isAction(action)) return { rejected: 'notAllowed' }
      if (!faults.actor && !isActor(game, actor)) return { rejected: 'notSeated' }
      const draft = structuredClone(game)
      const events: TableEvent[] = []
      if (isTableAction(action)) {
        const rejected = tableAction(draft, actor, action, ctx, events, { seatCounts: [2] })
        if (rejected !== null) return { rejected }
        if (action.type === 'start') draft.phase = { kind: 'naming' }
        return { game: draft, events }
      }
      if (draft.phase.kind !== 'naming' || actor === 'system') return { rejected: 'notAllowed' }
      if (action.type === 'ready') {
        if (actor === null && !faults.spectator) return { rejected: 'notSeated' }
        draft.seats[actor as number].connected = true
        return { game: draft, events }
      }
      if (actor === null) return { rejected: 'notAllowed' }
      if (action.type === 'pick') {
        const choice = action.choice as { joker?: unknown } | null
        if (typeof choice !== 'object' || choice === null || !('joker' in choice)) return { rejected: 'notAllowed' }
        if (!faults.branch && typeof choice.joker !== 'boolean') return { rejected: 'notAllowed' }
        draft.seats[actor].name = (choice.joker as boolean).toString()
        return { game: draft, events }
      }
      if (action.type !== 'name') return { rejected: 'notAllowed' }
      const card = action.card as { suit?: unknown; rank?: unknown } | null | undefined
      if (typeof card?.suit !== 'string') return { rejected: 'notAllowed' }
      if (!faults.sibling && typeof card.rank !== 'string') return { rejected: 'notAllowed' }
      draft.seats[actor].name = `${card.suit} ${(card.rank as string).slice(0, 1)}`
      return { game: draft, events }
    },
    viewFor: (game, seat) => ({ ...tableView(game, seat), phase: game.phase }),
    seatsToAct: () => [],
    nextDeadline: () => null,
    checkInvariants: () => {},
    actionSchema: actionSchema as z.ZodType<ToyAction>,
    dueStep: () => null,
    reactions: () => [],
  }
}

describe('the malformed-action check', () => {
  test('passes a game that refuses whatever it cannot read, covering every state, action and field it reaches', () => {
    const covered = checkMalformed(toy())
    expect(covered.states).toEqual(['an empty lobby', 'a full lobby of 2', 'naming with 2'])
    expect(covered.actions).toEqual(['sit', 'leaveSeat', 'rename', 'addAi', 'setPersona', 'clearSeat', 'setPlayerCount', 'start', 'replaceWithAi', 'reclaimSeat', 'name', 'pick', 'ready'])
    expect(covered.paths).toEqual([
      'sit.seat',
      'sit.name',
      'rename.name',
      'addAi.seat',
      'addAi.persona',
      'setPersona.seat',
      'setPersona.persona',
      'clearSeat.seat',
      'setPlayerCount.playerCount',
      'replaceWithAi.seat',
      'name.card',
      'name.card.suit',
      'name.card.rank',
      // Each shape a union field may take has its own fields.
      'pick.choice',
      'pick.choice.suit',
      'pick.choice.rank',
      'pick.choice.joker',
    ])
  })

  test('finds a field read carelessly in one shape of a union field', () => {
    expect(() => checkMalformed(toy({ branch: true }))).toThrow(/^toy: \{"type":"pick","choice":\{\}\} by 0 in naming with 2 threw TypeError/)
  })

  test('finds a field read before it is checked, with its siblings valid', () => {
    expect(() => checkMalformed(toy({ sibling: true }))).toThrow(/^toy: \{"type":"name","card":\{"suit":"clubs"\}\} by 0 in naming with 2 threw TypeError/)
  })

  test('finds an actor outside the table', () => {
    expect(() => checkMalformed(toy({ actor: true }))).toThrow(/^toy: \{"type":"rename","name":"x"\} by 2 in an empty lobby threw TypeError/)
  })

  test('sends an action with no fields from every actor, a spectator included', () => {
    expect(() => checkMalformed(toy({ spectator: true }))).toThrow(/^toy: \{"type":"ready"\} by null in naming with 2 threw TypeError/)
  })

  test('refuses a schema it cannot read whole, rather than checking less', () => {
    const shaped = (option: z.ZodObject) => toy({}, z.discriminatedUnion('type', [...tableActionSchemas([2]), option]))
    expect(() => checkMalformed(shaped(z.object({ type: z.literal('when'), at: z.date() })))).toThrow(/when\.at: an unsupported schema/)
    // A union is read whole too: one shape it cannot read is refused, though another would do.
    expect(() => checkMalformed(shaped(z.object({ type: z.literal('when'), at: z.union([z.string(), z.date()]) })))).toThrow(/when\.at: an unsupported schema/)
    expect(() => checkMalformed(shaped(z.object({ type: z.literal(5) })))).toThrow(/discriminator/)
    expect(() => checkMalformed(toy({}, z.object({ type: z.string() })))).toThrow(/discriminated union/)
  })
})
