import { type Card, type RejectReason, type View, strength } from '../engine'
import { SUITS } from '../../../kit/cards'
import type { Seat, TableReject } from '../../../kit/table'
import { seatName } from '../../../ui/text'

/** Display order only: grouped by suit, highest first. The engine keeps deal order. */
export function sortHand(hand: readonly Card[]): Card[] {
  return [...hand].sort((a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || strength(b) - strength(a))
}

/** "You" for the viewer, otherwise the seat's name. */
export function nameFor(view: View, seat: Seat): string {
  return seat === view.seat ? 'You' : seatName(view, seat)
}

/** Hearts' own reasons for refusing an action; the shell words the table's. */
export const REJECTIONS: Record<Exclude<RejectReason, TableReject>, string> = {
  notYourTurn: "It isn't your turn.",
  cardNotInHand: "That card isn't in your hand.",
  illegalCard: "That card isn't allowed here.",
}
