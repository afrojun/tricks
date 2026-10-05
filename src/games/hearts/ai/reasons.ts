/** Why a computer chose what it did, as data. The words live in the coach. */
import type { Seat } from '../../../kit/table'
import type { Card } from '../engine/cards'
import type { Action } from '../engine/types'

/** Why a card was passed. */
export type PassWhy =
  /** The queen of spades, with too few spades to hide her. */
  | 'queenOfSpades'
  /** The ace or king of spades, which can catch the queen, with too few spades to duck under her. */
  | 'highSpade'
  /** The ace, king or queen of hearts. */
  | 'highHeart'
  /** Empties a short club or diamond suit. */
  | 'shortSuit'
  /** The highest card left. */
  | 'highCard'

export type Reason =
  | { code: 'pass'; picks: { card: Card; why: PassWhy }[] }
  /** The two of clubs must lead the first trick. */
  | { code: 'openingLead'; card: Card }
  | { code: 'onlyCard'; card: Card }
  /** The highest club to the first trick, where no points can fall. */
  | { code: 'firstTrickHigh'; card: Card }
  /** A spade below the queen, to draw her out while she is unseen. */
  | { code: 'fishForQueen'; card: Card }
  /** A low card unlikely to win: `higher` cards of its suit are still out. */
  | { code: 'leadLow'; card: Card; higher: number }
  /** Nothing safe to lead: a sure heart before the queen. */
  | { code: 'leadLeastBad'; card: Card }
  /** The highest card that stays under the one winning the trick. */
  | { code: 'duck'; card: Card; under: Card }
  /** Last to a trick with no points, and every card wins: the highest, while it is safe to. */
  | { code: 'winClean'; card: Card }
  /** Every card would win as the trick stands: the lowest. */
  | { code: 'playLow'; card: Card }
  /** Takes a cheap trick with points, so `shooter` cannot take them all. */
  | { code: 'stopMoon'; card: Card; shooter: Seat }
  /** Wins the jack of diamonds, worth -10. */
  | { code: 'takeJack'; card: Card }
  /** Void in the suit led: the queen of spades. */
  | { code: 'dumpQueen'; card: Card }
  /** Void: the ace or king of spades, while the queen is unseen. */
  | { code: 'dumpHighSpade'; card: Card }
  /** Void: the highest heart. */
  | { code: 'dumpHeart'; card: Card }
  /** Void: the highest card. */
  | { code: 'dumpHigh'; card: Card }
  /** A cheat: off suit while holding the suit led, so as not to take the `dodges` points `honest` would. */
  | { code: 'renege'; card: Card; honest: Card; dodges: number }

export interface Decision {
  action: Action
  reason: Reason
}
