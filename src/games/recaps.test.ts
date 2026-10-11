import { describe, expect, test } from 'vitest'
import { recap as heartsRecap } from './hearts/ui/recap'
import { recap as spadesRecap } from './spades/ui/recap'
import { recap as thuneeRecap } from './thunee/ui/recap'
import { Table as ThuneeTable } from './thunee/engine/testing'
import { viewFor as thuneeView } from './thunee/engine'
import { createGame as createHearts, viewFor as heartsView } from './hearts'
import { createGame as createSpades, viewFor as spadesView } from './spades'

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

  test('Hearts: who took the queen of spades, and nothing for an ordinary trick', () => {
    const view = named(heartsView(createHearts(), 0), NAMES)
    const lines = heartsRecap(
      [
        { type: 'cardPlayed', seat: 1, card: { suit: 'clubs', rank: '2' } },
        { type: 'trickWon', seat: 1, points: 0 },
        { type: 'cardPlayed', seat: 2, card: { suit: 'spades', rank: 'Q' } },
        { type: 'trickWon', seat: 0, points: 13 },
        { type: 'heartsBroken' },
        { type: 'gameOver', winner: 3 },
      ],
      view,
      0,
    )
    expect(lines).toEqual(['You took the queen of spades', 'Hearts were broken', 'Devi won the game'])
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
})
