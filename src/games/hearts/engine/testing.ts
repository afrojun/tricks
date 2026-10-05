/** Helpers for tests and simulations. Not used by the app. */
import type { Suit } from '../../../kit/cards'
import { RANKS, type Card, type Rank } from './cards'

const SUIT_LETTERS: Record<string, Suit> = { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' }

/** `card('Qs')`, `card('10h')`, `card('2c')`. */
export function card(text: string): Card {
  const suit = SUIT_LETTERS[text.slice(-1)]
  const rank = text.slice(0, -1) as Rank
  if (!suit || !RANKS.includes(rank)) throw new Error(`bad card ${text}`)
  return { suit, rank }
}

export function cards(text: string): Card[] {
  return text.trim().split(/\s+/).map(card)
}
