/** The 52-card deck that Hearts and Spades share: in each suit the ace is high and the two is low. */
import { type Card, SUITS } from './cards'

/** Ranks from highest to lowest. */
export const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'] as const
export type Rank = (typeof RANKS)[number]

export function createDeck(): Card<Rank>[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })))
}

/** Each card's place in `createDeck`'s order, by suit and then rank. */
const PLACES = new Map(SUITS.map((suit, s) => [suit, new Map<string, number>(RANKS.map((rank, r) => [rank, s * RANKS.length + r]))]))

/**
 * Where a card comes in `createDeck`'s order, 0 to 51, or -1 for a card the deck does not have: cards are
 * counted and marked by their place rather than by a string each.
 */
export function place(card: Card): number {
  return PLACES.get(card.suit)?.get(card.rank) ?? -1
}

const STRENGTH: Record<string, number> = Object.fromEntries(RANKS.map((rank, i) => [rank, RANKS.length - i]))

/** Higher number beats lower within a suit: the two is 1 and the ace 13. */
export function strength(card: Card<Rank>): number {
  return STRENGTH[card.rank]
}
