import { type Card, type RejectReason, type Seat, type Team, type View, SUITS, rankStrength, teamOf } from '../engine'
import type { TableReject } from '../../../kit/table'
import { seatName } from '../../../ui/text'

/** "Asha & Chan" for a team; pass the viewer's seat to get "You & Chan". */
export function teamName(view: View, team: Team, you: Seat | null = null): string {
  return view.seats
    .map((_, seat) => seat)
    .filter((seat) => teamOf(seat) === team)
    .sort((a, b) => Number(b === you) - Number(a === you))
    .map((seat) => (seat === you ? 'You' : seatName(view, seat)))
    .join(' & ')
}

/** Display order only: grouped by suit, strongest first. The engine keeps deal order. */
export function sortHand(hand: readonly Card[]): Card[] {
  return [...hand].sort(
    (a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || rankStrength(b.rank) - rankStrength(a.rank),
  )
}

/** Thunee's own reasons for refusing an action; the shell words the table's. */
export const REJECTIONS: Record<Exclude<RejectReason, TableReject>, string> = {
  notYourTurn: "It isn't your turn.",
  badAmount: 'Call the next amount up.',
  cardNotInHand: "That card isn't in your hand.",
  illegalCard: 'That card breaks the rules, and cheating is off.',
  falseClaim: 'Cheating is off, so you can only call a Jodhi you have.',
}
