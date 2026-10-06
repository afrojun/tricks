/** Where seats sit on screen and how the lobby groups them, for any game. Pure. */
import type { Seat } from '../kit/table'

/** Which way play goes round the table, as the players see it from above. */
export type Direction = 'clockwise' | 'counterclockwise'

export type Where = 'bottom' | 'right' | 'top' | 'left'

/**
 * Where a seat sits on screen relative to the viewer, who is always at the bottom. Seats are
 * numbered in play order, so the next seat sits on the viewer's right when play goes
 * counterclockwise and on their left when it goes clockwise. For two or four seats.
 */
export function place(seat: Seat, me: Seat, playerCount: number, direction: Direction): Where {
  const offset = (seat - me + playerCount) % playerCount
  if (playerCount === 2) return offset === 0 ? 'bottom' : 'top'
  return (direction === 'counterclockwise' ? (['bottom', 'right', 'top', 'left'] as const) : (['bottom', 'left', 'top', 'right'] as const))[offset]
}

/** Roughly how far, in pixels, a card travels to or from each side of the table. */
export const TOWARD: Record<Where, { x: number; y: number }> = {
  bottom: { x: 0, y: 190 },
  top: { x: 0, y: -190 },
  left: { x: -150, y: 0 },
  right: { x: 150, y: 0 },
}

/** Each seat's team, as the game numbers it, or null for a game without teams. */
export function teamsAt(lobbyTeams: (seat: Seat, playerCount: number) => number | null, playerCount: number): (number | null)[] {
  return Array.from({ length: playerCount }, (_, seat) => lobbyTeams(seat, playerCount))
}

const partnersOf = (seat: Seat, teams: readonly (number | null)[]): Seat[] =>
  teams.flatMap((team, other) => (team !== null && team === teams[seat] ? [other] : []))

/** "Team 1" for a seat with a partner; a team of one, or no team, is "Player 1". */
export function seatLabel(seat: Seat, teams: readonly (number | null)[]): string {
  const team = teams[seat]
  return team !== null && partnersOf(seat, teams).length > 1 ? `Team ${team + 1}` : `Player ${seat + 1}`
}

/** Who plays with whom, when two teams of two share the table; null otherwise. */
export function partnersLine(teams: readonly (number | null)[]): string | null {
  const pairs = [...new Set(teams)].map((team) => partnersOf(teams.indexOf(team), teams))
  if (pairs.length !== 2 || pairs.some((pair) => pair.length !== 2)) return null
  const opposite = pairs.every(([a, b]) => b - a === teams.length / 2)
  const [[a, b], [c, d]] = pairs
  return `${opposite ? 'Partners sit opposite' : 'Partners'}: seats ${a + 1} and ${b + 1} play seats ${c + 1} and ${d + 1}.`
}

const COUNT_WORDS = ['None', 'One', 'Two', 'Three', 'Four', 'Five', 'Six']

/** "Four", for a number of players. */
export function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n)
}

/** How many can play, as the Tricks home says it: "Two or four players." */
export function tableSizes(seatCounts: readonly number[]): string {
  const words = [...seatCounts].sort((a, b) => a - b).map((n) => countWord(n).toLowerCase())
  const list = words.length > 1 ? `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}` : words[0]
  return `${list[0].toUpperCase()}${list.slice(1)} players.`
}

/** A table size as the home screen offers it: "Four, in pairs", "Two". */
export function playersLabel(teams: readonly (number | null)[]): string {
  const word = countWord(teams.length)
  return teams.every((_, seat) => partnersOf(seat, teams).length === 2) ? `${word}, in pairs` : word
}
