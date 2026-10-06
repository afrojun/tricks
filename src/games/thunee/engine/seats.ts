import type { Seat } from '../../../kit/table'

/** Seats come from the kit, numbered in play order; Thunee pairs them into teams. */
export { type Seat, allSeats, seatsFrom } from '../../../kit/table'
/** Play runs counterclockwise; the next seat is the one to the right. */
export { nextSeat as next } from '../../../kit/table'

export type Team = 0 | 1

export function teamOf(seat: Seat): Team {
  return (seat % 2) as Team
}

export function otherTeam(team: Team): Team {
  return (1 - team) as Team
}

/** Partner in the four-player game; null in the two-player game. */
export function partnerOf(seat: Seat, playerCount: number): Seat | null {
  return playerCount === 4 ? (seat + 2) % 4 : null
}
