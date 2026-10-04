export type Seat = number
export type Team = 0 | 1

/** Play runs counterclockwise; the next seat is the one to the right. */
export function next(seat: Seat, playerCount: number): Seat {
  return (seat + 1) % playerCount
}

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

export function allSeats(playerCount: number): Seat[] {
  return Array.from({ length: playerCount }, (_, i) => i)
}

/** Seats in play order starting from `first`. */
export function seatsFrom(first: Seat, playerCount: number): Seat[] {
  return allSeats(playerCount).map((i) => (first + i) % playerCount)
}
