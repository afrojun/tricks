import { describe, expect, test } from 'vitest'
import { type Contract, runContract } from '../kit/contract'
import type { TableState, TableView } from '../kit/table'
import { heartsContract } from './hearts/contract'
import { contractRules, spadesContract } from './spades/contract'
import { thuneeContract } from './thunee/contract'
import { recap as heartsRecap } from './hearts/ui/recap'
import { recap as spadesRecap } from './spades/ui/recap'
import { recap as thuneeRecap } from './thunee/ui/recap'
import { Table as ThuneeTable } from './thunee/engine/testing'
import { viewFor as thuneeView } from './thunee/engine'
import { createGame as createHearts, viewFor as heartsView } from './hearts'
import { createGame as createSpades, spades, viewFor as spadesView } from './spades'

/** A view with these names at the table; the recaps read only names and seats from it. */
function named<V extends { seats: { name: string }[] }>(view: V, names: string[]): V {
  return { ...view, seats: view.seats.map((s, i) => ({ ...s, name: names[i], kind: 'human' as const })) }
}
const NAMES = ['You', 'Asha', 'Chan', 'Devi']

describe('while you were away', () => {
  test('Thunee: the calls, a challenge, and the game, from where the player sits', () => {
    const view = named(thuneeView(new ThuneeTable(4).game, 0), NAMES)
    const lines = thuneeRecap(
      [
        { type: 'called', seat: 1, amount: 40 },
        { type: 'trumpChosen', seat: 2, lastCard: true },
        { type: 'thuneeCalled', seat: 0 },
        { type: 'jodhiClaimed', seat: 3, withJack: false, points: 20 },
        { type: 'challengeResolved', challenger: 1, accused: 0, guilty: false },
        { type: 'cardPlayed', seat: 1, card: { suit: 'hearts', rank: 'J' } },
        { type: 'gameOver', winner: 1 },
      ],
      view,
      0,
    )
    expect(lines).toEqual(['Asha called 40', 'Chan chose trump by last card', 'You called Thunee', 'Devi called Jodhi 20', 'Asha challenged you', 'Asha and Devi won the game'])
  })

  test('Hearts: who took the queen of spades, from the trick alone, and nothing for an ordinary trick', () => {
    const view = named(heartsView(createHearts(), 0), NAMES)
    const lines = heartsRecap(
      [
        { type: 'trickWon', seat: 1, points: 0, queen: false },
        // Played before the player left, taken while they were away: the trick says so.
        { type: 'trickWon', seat: 0, points: 13, queen: true },
        { type: 'heartsBroken' },
        { type: 'gameOver', winner: 3 },
      ],
      view,
      0,
    )
    expect(lines).toEqual(['You took the queen of spades', 'Hearts were broken', 'Devi won the game'])
  })

  test('Spades: a challenge is recapped without its card, since play may go on after it', () => {
    const event = { type: 'challengeResolved', challenger: 1, accused: 2, guilty: true, penalty: 'plusThree', effect: 'raised', rule: 'renege', card: { suit: 'diamonds', rank: '9' } } as const
    expect(spades.recapOf(event as never)).toEqual({ type: 'challengeResolved', challenger: 1, accused: 2, guilty: true })
    expect(spades.recapOf({ type: 'cardPlayed', seat: 1, card: { suit: 'diamonds', rank: '9' } } as never)).toBeNull()
  })

  test('Spades: the calls and a Nil broken', () => {
    const view = named(spadesView(createSpades(), 0), NAMES)
    const lines = spadesRecap(
      [
        { type: 'called', seat: 1, call: { tricks: 3, blind: false } },
        { type: 'called', seat: 0, call: { tricks: 0, blind: false } },
        { type: 'nilBroken', seat: 0 },
        { type: 'nilBroken', seat: 2 },
      ],
      view,
      0,
    )
    expect(lines).toEqual(['Asha called 3', 'You called Nil', 'Your Nil was broken', 'Chan’s Nil was broken'])
  })

  /**
   * A whole seeded game: the recap from only the events the room may send says all that the recap from every
   * event says. So the module's list never leaves out what its client's recap reads.
   */
  test.each([
    ['thunee', thuneeContract({ allowCheating: true }, 4).contract, thuneeRecap],
    ['hearts', heartsContract({ allowCheating: true }).contract, heartsRecap],
    ['spades', spadesContract({ ...contractRules(4), allowCheating: true }, 4).contract, spadesRecap],
  ] as const)('%s: the events a recap may carry are all its recap reads', (_, contract, recap) => {
    const events: { type: string }[] = []
    const watched = { ...contract, check: (...args: Parameters<NonNullable<typeof contract.check>>) => {
      contract.check?.(...(args as [never, never, never, never]))
      events.push(...(args[1] as { type: string }[]))
    } } as unknown as Contract<TableState, unknown, unknown, TableView>
    const { game } = runContract(watched, 7)
    const view = contract.module.viewFor(game as never, 0)
    const told = events.flatMap((e) => (contract.module.recapOf as (e: unknown) => { type: string } | null)(e) ?? [])
    const say = recap as (e: readonly unknown[], v: unknown, s: number) => string[]
    const all = say(events, view, 0)
    expect(all.length).toBeGreaterThan(0)
    expect(say(told, view, 0)).toEqual(all)
    // No card in play reaches a recap: none played, none challenged. A round's summary names only cards of a round that is over.
    expect(told.some((e) => e.type === 'cardPlayed')).toBe(false)
    expect(told.filter((e) => e.type !== 'roundScored' && e.type !== 'gameOver').some((e) => JSON.stringify(e).includes('"rank"'))).toBe(false)
  })
})
