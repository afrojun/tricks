import { type Card as KitCard, sameCard } from '../../../kit/cards'
import type { Rank } from '../../../kit/deck'
import type { HeartsRules } from './rules'

/** Hearts plays the kit's 52-card deck. */
export { RANKS, type Rank, createDeck, place, strength } from '../../../kit/deck'

export type Card = KitCard<Rank>

export const TWO_OF_CLUBS: Card = { suit: 'clubs', rank: '2' }
export const QUEEN_OF_SPADES: Card = { suit: 'spades', rank: 'Q' }
export const JACK_OF_DIAMONDS: Card = { suit: 'diamonds', rank: 'J' }

/** Hearts and the queen of spades: the cards that make up a round's 26 points. */
export function isPointCard(card: Card): boolean {
  return card.suit === 'hearts' || sameCard(card, QUEEN_OF_SPADES)
}

/** Hearts count 1 each and the queen of spades 13. */
export function penaltyPoints(cards: readonly Card[]): number {
  return cards.reduce((sum, c) => sum + (c.suit === 'hearts' ? 1 : sameCard(c, QUEEN_OF_SPADES) ? 13 : 0), 0)
}

/** What cards are worth to whoever takes them: penalty points, and the jack of diamonds when the rules count it. */
export function trickPoints(cards: readonly Card[], rules: Pick<HeartsRules, 'jackOfDiamonds'>): number {
  const jack = rules.jackOfDiamonds && cards.some((c) => sameCard(c, JACK_OF_DIAMONDS)) ? JACK_OF_DIAMONDS_POINTS : 0
  return penaltyPoints(cards) + jack
}

export const JACK_OF_DIAMONDS_POINTS = -10
