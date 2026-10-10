import { type Card as KitCard, SUITS, sameCard } from '../../../kit/cards'
import type { HeartsRules } from './rules'

/** Ranks from highest to lowest: in each suit the ace is high and the two is low. */
export const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'] as const
export type Rank = (typeof RANKS)[number]

export type Card = KitCard<Rank>

export const TWO_OF_CLUBS: Card = { suit: 'clubs', rank: '2' }
export const QUEEN_OF_SPADES: Card = { suit: 'spades', rank: 'Q' }
export const JACK_OF_DIAMONDS: Card = { suit: 'diamonds', rank: 'J' }

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })))
}

/** Each card's place in `createDeck`'s order, by suit and then rank. */
const PLACES = new Map(SUITS.map((suit, s) => [suit, new Map(RANKS.map((rank, r) => [rank, s * RANKS.length + r]))]))

/**
 * Where a card comes in `createDeck`'s order, 0 to 51, or -1 for a card Hearts does not have: cards are
 * counted and marked by their place rather than by a string each.
 */
export function place(card: Card): number {
  return PLACES.get(card.suit)?.get(card.rank) ?? -1
}

const STRENGTH = Object.fromEntries(RANKS.map((rank, i) => [rank, RANKS.length - i])) as Record<Rank, number>

/** Higher number beats lower within a suit: the two is 1 and the ace 13. */
export function strength(card: Card): number {
  return STRENGTH[card.rank]
}

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
