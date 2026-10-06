import { type Card as KitCard, SUITS } from '../../../kit/cards'

/** Suits, card identity and shuffling come from the kit; Thunee supplies its ranks and their values. */
export { type Suit, SUITS, SUIT_NAME, SUIT_SYMBOL, cardId, cardText, hasCard, removeCard, sameCard, shuffle } from '../../../kit/cards'

/** Ranks from highest to lowest. */
export const RANKS = ['J', '9', 'A', '10', 'K', 'Q'] as const
export type Rank = (typeof RANKS)[number]

export type Card = KitCard<Rank>

export const CARD_POINTS: Record<Rank, number> = { J: 30, '9': 20, A: 11, '10': 10, K: 3, Q: 2 }

/** Sum of card points in the whole deck. */
export const TOTAL_CARD_POINTS = 304

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })))
}

/** Higher number beats lower within a suit. */
export function rankStrength(rank: Rank): number {
  return RANKS.length - RANKS.indexOf(rank)
}

/** A card's strength within its suit, as the kit's trick winner wants it. */
export function strength(card: Card): number {
  return rankStrength(card.rank)
}

export function pointsOf(cards: readonly Card[]): number {
  return cards.reduce((sum, c) => sum + CARD_POINTS[c.rank], 0)
}
