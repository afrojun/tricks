import { describe, expect, test } from 'vitest'
import { cardId } from './cards'
import { createDeck, place, strength } from './deck'

describe('the 52-card deck', () => {
  test('holds every card once, each at its place', () => {
    const deck = createDeck()
    expect(new Set(deck.map(cardId)).size).toBe(52)
    deck.forEach((card, i) => expect(place(card)).toBe(i))
    expect(place({ suit: 'spades', rank: 'BJ' })).toBe(-1)
  })

  test('the ace is high and the two low', () => {
    expect(strength({ suit: 'clubs', rank: 'A' })).toBe(13)
    expect(strength({ suit: 'clubs', rank: '2' })).toBe(1)
  })
})
