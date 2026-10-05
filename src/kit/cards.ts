/** Cards every game shares. A game supplies its own ranks, their order, its deck and its card values. */
export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const
export type Suit = (typeof SUITS)[number]

export interface Card<R extends string = string> {
  suit: Suit
  rank: R
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

export function removeCard<C extends Card>(hand: readonly C[], card: Card): C[] {
  const i = hand.findIndex((c) => sameCard(c, card))
  return i === -1 ? [...hand] : [...hand.slice(0, i), ...hand.slice(i + 1)]
}

export function cardId(card: Card): string {
  return `${card.rank}-${card.suit}`
}

export const SUIT_SYMBOL: Record<Suit, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }
export const SUIT_NAME: Record<Suit, string> = { hearts: 'Hearts', diamonds: 'Diamonds', clubs: 'Clubs', spades: 'Spades' }

/** `J♥`, `10♠`. */
export function cardText(card: Card): string {
  return `${card.rank}${SUIT_SYMBOL[card.suit]}`
}
