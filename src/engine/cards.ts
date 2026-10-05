export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const
export type Suit = (typeof SUITS)[number]

/** Ranks from highest to lowest. */
export const RANKS = ['J', '9', 'A', '10', 'K', 'Q'] as const
export type Rank = (typeof RANKS)[number]

export interface Card {
  suit: Suit
  rank: Rank
}

export const CARD_POINTS: Record<Rank, number> = { J: 30, '9': 20, A: 11, '10': 10, K: 3, Q: 2 }

/** Sum of card points in the whole deck. */
export const TOTAL_CARD_POINTS = 304

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })))
}

/** Fisher-Yates shuffle driven by the supplied rng; returns a new array. */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function sameCard(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank
}

export function hasCard(hand: readonly Card[], card: Card): boolean {
  return hand.some((c) => sameCard(c, card))
}

export function removeCard(hand: readonly Card[], card: Card): Card[] {
  const i = hand.findIndex((c) => sameCard(c, card))
  return i === -1 ? [...hand] : [...hand.slice(0, i), ...hand.slice(i + 1)]
}

/** Higher number beats lower within a suit. */
export function rankStrength(rank: Rank): number {
  return RANKS.length - RANKS.indexOf(rank)
}

export function cardId(card: Card): string {
  return `${card.rank}-${card.suit}`
}

export function pointsOf(cards: readonly Card[]): number {
  return cards.reduce((sum, c) => sum + CARD_POINTS[c.rank], 0)
}

export const SUIT_SYMBOL: Record<Suit, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }
export const SUIT_NAME: Record<Suit, string> = { hearts: 'Hearts', diamonds: 'Diamonds', clubs: 'Clubs', spades: 'Spades' }

/** `J♥`, `10♠`. */
export function cardText(card: Card): string {
  return `${card.rank}${SUIT_SYMBOL[card.suit]}`
}
