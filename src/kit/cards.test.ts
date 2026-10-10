import { describe, expect, test } from 'vitest'
import { type Card, SUITS, cardId, cardText, cardsFrom, completeDeal, hasCard, removeCard, sameCard, shuffle } from './cards'
import { seededRng } from './testing'

const RANKS = ['J', '9', 'A', '10', 'K', 'Q'] as const
const deck = (): Card<(typeof RANKS)[number]>[] => SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })))

describe('cards', () => {
  test('shuffle is a deterministic permutation for a seeded rng', () => {
    const a = shuffle(deck(), seededRng(7))
    const b = shuffle(deck(), seededRng(7))
    const c = shuffle(deck(), seededRng(8))
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
    expect(new Set(a.map(cardId)).size).toBe(24)
  })

  test('shuffle returns a new array and leaves its input alone', () => {
    const input = Object.freeze(deck())
    const out = shuffle(input, seededRng(1))
    expect(out).not.toBe(input)
    expect(input).toEqual(deck())
  })

  test('cards are the same by suit and rank, whatever object holds them', () => {
    expect(sameCard({ suit: 'hearts', rank: 'J' }, { suit: 'hearts', rank: 'J' })).toBe(true)
    expect(sameCard({ suit: 'hearts', rank: 'J' }, { suit: 'spades', rank: 'J' })).toBe(false)
    expect(hasCard(deck(), { suit: 'clubs', rank: '10' })).toBe(true)
    expect(hasCard(deck(), { suit: 'clubs', rank: '2' })).toBe(false)
  })

  test('removing a card takes out one copy and returns a new hand', () => {
    const hand: Card[] = [{ suit: 'hearts', rank: 'J' }, { suit: 'clubs', rank: 'Q' }, { suit: 'hearts', rank: 'J' }]
    expect(removeCard(hand, { suit: 'hearts', rank: 'J' })).toEqual([{ suit: 'clubs', rank: 'Q' }, { suit: 'hearts', rank: 'J' }])
    const same = removeCard(hand, { suit: 'spades', rank: 'A' })
    expect(same).toEqual(hand)
    expect(same).not.toBe(hand)
  })

  test('ids and names', () => {
    expect(cardId({ suit: 'hearts', rank: 'J' })).toBe('J-hearts')
    expect(cardText({ suit: 'hearts', rank: 'J' })).toBe('J♥')
    expect(cardText({ suit: 'spades', rank: '10' })).toBe('10♠')
    expect(cardText({ suit: 'spades', rank: 'BJ' })).toBe('Big joker')
  })
})

describe('arranged deals', () => {
  const RANKS = ['A', 'K', 'Q', 'J', '10'] as const
  const deck = SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })))

  test('cards are read from short text, in the game’s ranks', () => {
    expect(cardsFrom('Jh 10s Ac', RANKS)).toEqual([
      { suit: 'hearts', rank: 'J' },
      { suit: 'spades', rank: '10' },
      { suit: 'clubs', rank: 'A' },
    ])
    expect(() => cardsFrom('2h', RANKS)).toThrow('bad card 2h')
    expect(() => cardsFrom('Jx', RANKS)).toThrow('bad card Jx')
  })

  test('a deal keeps the cards given, and fills each hand from the rest, the same way for the same seed', () => {
    const given = [cardsFrom('Ah Kh', RANKS), [], cardsFrom('Qs', RANKS), []]
    const a = completeDeal(given, deck, 5, seededRng(3))
    expect(a.map((h) => h.length)).toEqual([5, 5, 5, 5])
    expect(a[0].slice(0, 2)).toEqual(given[0])
    expect(a[2][0]).toEqual(given[2][0])
    expect(new Set(a.flat().map(cardId)).size).toBe(20)
    expect(completeDeal(given, deck, 5, seededRng(3))).toEqual(a)
  })

  test('a card given twice, or too many for a hand, is refused', () => {
    expect(() => completeDeal([cardsFrom('Ah', RANKS), cardsFrom('Ah', RANKS)], deck, 5, seededRng(1))).toThrow('given twice')
    expect(() => completeDeal([cardsFrom('Ah Kh Qh', RANKS)], deck, 2, seededRng(1))).toThrow('more than 2')
  })
})
