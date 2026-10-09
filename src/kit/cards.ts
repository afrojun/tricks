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

const SUIT_LETTER: Readonly<Record<string, Suit>> = { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' }

/** Cards written short, `'Jh 10s Qc'`, in a game's ranks. For arranged deals; throws on a card the game does not have. */
export function cardsFrom<R extends string>(text: string, ranks: readonly R[]): Card<R>[] {
  return text
    .trim()
    .split(/\s+/)
    .map((word) => {
      const suit = SUIT_LETTER[word.slice(-1)]
      const rank = word.slice(0, -1) as R
      if (!suit || !ranks.includes(rank)) throw new Error(`bad card ${word}`)
      return { suit, rank }
    })
}

/**
 * Hands of `size` holding the cards given for each, the rest dealt from what is left of `deck`,
 * shuffled by `rng`. A drill names the cards that matter and leaves the others to a fixed seed.
 */
export function completeDeal<C extends Card>(given: readonly (readonly C[])[], deck: readonly C[], size: number, rng: () => number): C[][] {
  const named = given.flat()
  if (named.some((c, i) => named.findIndex((d) => sameCard(c, d)) !== i)) throw new Error('a card is given twice')
  const rest = shuffle(
    deck.filter((c) => !hasCard(named, c)),
    rng,
  )
  return given.map((hand) => {
    if (hand.length > size) throw new Error(`more than ${size} cards given`)
    return [...hand, ...rest.splice(0, size - hand.length)]
  })
}
