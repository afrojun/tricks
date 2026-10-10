/**
 * Spades' cards: the kit's 52-card deck, spades always trump. Under the Jokers rule two jokers join it as the
 * top trumps, with the two of diamonds and the two of spades under them, and the twos of clubs and hearts leave.
 */
import { type Card as KitCard, SUITS, type Suit, sameCard } from '../../../kit/cards'
import { RANKS as DECK_RANKS, type Rank as DeckRank, createDeck as createStandardDeck, strength as deckStrength } from '../../../kit/deck'
import type { SuitOf } from '../../../kit/tricks'

/** The big and the little joker. Each is a card of the suit spades, so every card still has a suit. */
export const JOKER_RANKS = ['BJ', 'LJ'] as const
export const RANKS = [...JOKER_RANKS, ...DECK_RANKS] as const
export type Rank = (typeof RANKS)[number]

export type Card = KitCard<Rank>

export const TRUMP: Suit = 'spades'

export const BIG_JOKER: Card = { suit: 'spades', rank: 'BJ' }
export const LITTLE_JOKER: Card = { suit: 'spades', rank: 'LJ' }
export const TWO_OF_DIAMONDS: Card = { suit: 'diamonds', rank: '2' }
export const TWO_OF_SPADES: Card = { suit: 'spades', rank: '2' }
export const TWO_OF_CLUBS: Card = { suit: 'clubs', rank: '2' }
const TWO_OF_HEARTS: Card = { suit: 'hearts', rank: '2' }

export const isJoker = (card: Card): boolean => card.rank === 'BJ' || card.rank === 'LJ'

/** The 52 cards the rules play with. */
export function createDeck(jokers: boolean): Card[] {
  const deck: Card[] = createStandardDeck()
  if (!jokers) return deck
  return [...deck.filter((c) => !sameCard(c, TWO_OF_CLUBS) && !sameCard(c, TWO_OF_HEARTS)), BIG_JOKER, LITTLE_JOKER]
}

/** The suit a card is played as: the two of diamonds is a spade under the Jokers rule. */
export function suitOf(jokers: boolean): SuitOf<Card> {
  return jokers ? (card) => (card.rank === '2' && card.suit === 'diamonds' ? TRUMP : card.suit) : (card) => card.suit
}

/** Higher beats lower among cards played as one suit: with jokers the big joker, the little, the two of diamonds, the two of spades, then the ace down. */
export function strength(jokers: boolean): (card: Card) => number {
  if (!jokers) return (card) => deckStrength(card as KitCard<DeckRank>)
  return (card) => {
    if (card.rank === 'BJ') return 17
    if (card.rank === 'LJ') return 16
    if (card.rank === '2' && card.suit === 'diamonds') return 15
    if (card.rank === '2' && card.suit === 'spades') return 14
    return deckStrength(card as KitCard<DeckRank>)
  }
}

/** Each card Spades may hold, in order: the kit's 52, then the two jokers. */
const PLACES = new Map(SUITS.map((suit, s) => [suit, new Map<string, number>(DECK_RANKS.map((rank, r) => [rank, s * DECK_RANKS.length + r]))]))

/** Where a card comes among the 54 Spades may hold, or -1 for a card it never has. */
export function place(card: Card): number {
  if (card.suit === 'spades' && card.rank === 'BJ') return 52
  if (card.suit === 'spades' && card.rank === 'LJ') return 53
  return PLACES.get(card.suit)?.get(card.rank) ?? -1
}

export const PLACE_COUNT = 54
