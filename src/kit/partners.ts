/** Partnerships at a table of four: seats 0 and 2 play seats 1 and 3, partners opposite. */
import type { Seat } from './table'

export type Team = 0 | 1

export function teamOf(seat: Seat): Team {
  return (seat % 2) as Team
}

export function otherTeam(team: Team): Team {
  return (1 - team) as Team
}

/** Partner at a table of four; null at any other size, where everyone plays alone. */
export function partnerOf(seat: Seat, playerCount: number): Seat | null {
  return playerCount === 4 ? (seat + 2) % 4 : null
}
