/** Winning a trick and following suit. The game supplies the order of its ranks. */
import type { Card, Suit } from './cards'
import type { Excuse } from './integrity'
import type { Seat } from './table'

export interface TrickOrder<C> {
  trump: Suit | null
  /** Higher beats lower within a suit. */
  strength: (card: C) => number
}

/** The highest trump wins; with no trump played, the highest card of the led suit. */
export function trickWinner<C extends Card>(plays: readonly { seat: Seat; card: C }[], { trump, strength }: TrickOrder<C>): Seat {
  const led = plays[0].card.suit
  let best = plays[0]
  for (const play of plays.slice(1)) {
    const bestIsTrump = best.card.suit === trump
    const isTrump = play.card.suit === trump
    if (isTrump && !bestIsTrump) best = play
    else if (isTrump === bestIsTrump && play.card.suit === best.card.suit) {
      if ((isTrump || play.card.suit === led) && strength(play.card) > strength(best.card)) best = play
    }
  }
  return best.seat
}

/** The suit of the first card played to a trick, or null before it. */
export function ledSuit(plays: readonly { card: Card }[]): Suit | null {
  return plays.length > 0 ? plays[0].card.suit : null
}

/** Following suit as an excuse: a card off the led suit is legal only if the hand held none of it. */
export function followSuit<C extends Card>(card: C, led: Suit | null): Excuse<C>[] {
  if (led === null || card.suit === led) return []
  return [{ rule: 'followSuit', without: (c) => c.suit === led }]
}
