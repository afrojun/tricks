/** Winning a trick and following suit. The game supplies the order of its ranks. */
import type { Card, Suit } from './cards'
import type { Excuse } from './integrity'
import type { Seat } from './table'

/** The suit a card is played as. Most games play every card as its printed suit; Spades' Jokers deck does not. */
export type SuitOf<C> = (card: C) => Suit

const printed = (card: Card): Suit => card.suit

export interface TrickOrder<C> {
  trump: Suit | null
  /** Higher beats lower within a suit. */
  strength: (card: C) => number
  /** The suit each card is played as; its printed suit unless given. */
  suitOf?: SuitOf<C>
}

/** The highest trump wins; with no trump played, the highest card of the led suit. */
export function trickWinner<C extends Card>(plays: readonly { seat: Seat; card: C }[], { trump, strength, suitOf = printed }: TrickOrder<C>): Seat {
  const led = suitOf(plays[0].card)
  let best = plays[0]
  for (const play of plays.slice(1)) {
    const bestSuit = suitOf(best.card)
    const suit = suitOf(play.card)
    const bestIsTrump = bestSuit === trump
    const isTrump = suit === trump
    if (isTrump && !bestIsTrump) best = play
    else if (isTrump === bestIsTrump && suit === bestSuit) {
      if ((isTrump || suit === led) && strength(play.card) > strength(best.card)) best = play
    }
  }
  return best.seat
}

/** The suit of the first card played to a trick, or null before it. */
export function ledSuit<C extends Card>(plays: readonly { card: C }[], suitOf: SuitOf<C> = printed): Suit | null {
  return plays.length > 0 ? suitOf(plays[0].card) : null
}

/** Following suit as an excuse: a card off the led suit is legal only if the hand held none of it. */
export function followSuit<C extends Card>(card: C, led: Suit | null, suitOf: SuitOf<C> = printed): Excuse<C>[] {
  if (led === null || suitOf(card) === led) return []
  return [{ rule: 'followSuit', without: (c) => suitOf(c) === led }]
}

/**
 * A suit that may not be led until it is broken, as an excuse: leading it unbroken is legal only if the hand
 * held nothing else. Hearts' hearts and Spades' spades, each under its own rule name.
 */
export function unbrokenLead<C extends Card>(card: C, led: Suit | null, suit: Suit, broken: boolean, rule: string, suitOf: SuitOf<C> = printed): Excuse<C>[] {
  if (led !== null || broken || suitOf(card) !== suit) return []
  return [{ rule, without: (c) => suitOf(c) !== suit }]
}
