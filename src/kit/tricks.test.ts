import { describe, expect, test } from 'vitest'
import type { Card, Suit } from './cards'
import { type Excuse, legalCards } from './integrity'
import { followSuit, ledSuit, trickWinner, unbrokenLead } from './tricks'

// Thunee's cards, to pin the kit to today's behaviour.
const RANKS = ['J', '9', 'A', '10', 'K', 'Q']
const strength = (c: Card) => RANKS.length - RANKS.indexOf(c.rank)
const LETTERS: Record<string, Suit> = { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' }
const card = (text: string): Card => ({ suit: LETTERS[text.slice(-1)], rank: text.slice(0, -1) })
const cards = (text: string) => text.trim().split(/\s+/).map(card)
const plays = (text: string) => cards(text).map((c, seat) => ({ seat, card: c }))

/** Thunee's follow-suit and undercut rules written as excuses. */
function thuneeExcuses(c: Card, trick: readonly Card[], trump: Suit | null): Excuse<Card>[] {
  const led = ledSuit(trick.map((x) => ({ card: x })))
  const out = followSuit(c, led)
  if (trump !== null && led !== null && led !== trump && c.suit === trump) {
    const top = Math.max(0, ...trick.filter((x) => x.suit === trump).map(strength))
    if (top > strength(c)) out.push({ rule: 'undercut', without: (x) => x.suit !== trump })
  }
  return out
}
const isLegal = (c: Card, hand: Card[], trick: Card[], trump: Suit | null) =>
  legalCards(hand, (x) => thuneeExcuses(x, trick, trump)).some((x) => x.suit === c.suit && x.rank === c.rank)

describe('trick winner', () => {
  test('the highest card of the led suit wins when no trump is played', () => {
    expect(trickWinner(plays('10h Jh 9h Jd'), { trump: 'spades', strength })).toBe(1)
    expect(trickWinner(plays('Qh Jd Jc Js'), { trump: null, strength })).toBe(0)
  })

  test('any trump beats the led suit and the highest trump wins', () => {
    expect(trickWinner(plays('Jh Qs 9h Ks'), { trump: 'spades', strength })).toBe(3)
    expect(trickWinner(plays('Qs Js 9h 9s'), { trump: 'spades', strength })).toBe(1)
  })

  test('the game decides the order of ranks', () => {
    const aceHigh = (c: Card) => ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'].indexOf(c.rank)
    expect(trickWinner(plays('2c Ac Kd 3c'), { trump: null, strength: aceHigh })).toBe(1)
    expect(trickWinner(plays('10c Jc Ah Qc'), { trump: null, strength: aceHigh })).toBe(3)
  })

  test('seats are taken from the plays, not their order', () => {
    expect(trickWinner([{ seat: 2, card: card('Qh') }, { seat: 3, card: card('Jh') }], { trump: null, strength })).toBe(3)
  })
})

describe('following suit', () => {
  test('the led suit is the first card’s', () => {
    expect(ledSuit([])).toBeNull()
    expect(ledSuit(plays('Ah Js'))).toBe('hearts')
  })

  test('only a card off the led suit needs an excuse', () => {
    expect(followSuit(card('9c'), null)).toEqual([])
    expect(followSuit(card('9h'), 'hearts')).toEqual([])
    const [excuse] = followSuit(card('9c'), 'hearts')
    expect(excuse.rule).toBe('followSuit')
    expect(excuse.without(card('Qh'))).toBe(true)
    expect(excuse.without(card('Qs'))).toBe(false)
  })

  test('following suit is required when able', () => {
    const hand = cards('Jh 9c')
    expect(isLegal(card('9c'), hand, cards('Ah'), 'spades')).toBe(false)
    expect(isLegal(card('Jh'), hand, cards('Ah'), 'spades')).toBe(true)
    expect(isLegal(card('9c'), hand, [], 'spades')).toBe(true)
    expect(isLegal(card('9c'), cards('9c Qd'), cards('Ah'), 'spades')).toBe(true)
  })

  test('Thunee’s undercut, written as an excuse, is illegal unless the hand is all trumps', () => {
    const trick = cards('Ah Js') // hearts led, already trumped with the Jack
    expect(isLegal(card('Qs'), cards('Qs 9c'), trick, 'spades')).toBe(false)
    expect(isLegal(card('Qs'), cards('Qs Ks'), trick, 'spades')).toBe(true)
    expect(isLegal(card('9c'), cards('Qs 9c'), trick, 'spades')).toBe(true)
    // Overtrumping is always fine.
    expect(isLegal(card('Js'), cards('Js 9c'), cards('Ah Qs'), 'spades')).toBe(true)
  })
})

describe('a suit played as another', () => {
  // Spades' Jokers deck: the two of diamonds is a spade.
  const suitOf = (c: Card): Suit => (c.suit === 'diamonds' && c.rank === '2' ? 'spades' : c.suit)
  const order = (c: Card) => (c.suit === 'diamonds' && c.rank === '2' ? 20 : RANKS.length - RANKS.indexOf(c.rank))

  test('it leads, follows and wins as the suit it is played as', () => {
    expect(ledSuit([{ card: card('2d') }], suitOf)).toBe('spades')
    expect(followSuit(card('2d'), 'diamonds', suitOf)).toHaveLength(1)
    expect(followSuit(card('2d'), 'spades', suitOf)).toEqual([])
    expect(followSuit(card('Qd'), 'diamonds', suitOf)[0]?.without(card('2d')) ?? false).toBe(false)
    expect(trickWinner(plays('Jd 2d Ad Qd'), { trump: 'spades', strength: order, suitOf })).toBe(1)
    expect(trickWinner(plays('Js 2d Ad Qs'), { trump: 'spades', strength: order, suitOf })).toBe(1)
  })
})

describe('a suit led only once broken', () => {
  test('leading it unbroken needs a hand of nothing else', () => {
    expect(unbrokenLead(card('Jh'), null, 'hearts', false, 'heartsLead')).toHaveLength(1)
    const [excuse] = unbrokenLead(card('Jh'), null, 'hearts', false, 'heartsLead')
    expect(excuse.rule).toBe('heartsLead')
    expect(excuse.without(card('Qs'))).toBe(true)
    expect(excuse.without(card('Qh'))).toBe(false)
  })

  test('following with it, leading it once broken, or leading another suit needs nothing', () => {
    expect(unbrokenLead(card('Jh'), 'clubs', 'hearts', false, 'heartsLead')).toEqual([])
    expect(unbrokenLead(card('Jh'), null, 'hearts', true, 'heartsLead')).toEqual([])
    expect(unbrokenLead(card('Js'), null, 'hearts', false, 'heartsLead')).toEqual([])
  })
})
