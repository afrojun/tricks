/** Reading the round from a seat's view. Computer players get the `full` view. */
import { type Card, type Seat, type View, type ViewPlay, type ViewPlaying, pointsOf, teamOf, trickWinner } from '../engine'

export interface TrickRecord {
  index: number
  half: 1 | 2
  plays: ViewPlay[]
  /** Null for the trick still being played. */
  winner: Seat | null
}

/** Every trick of the round whose cards are visible, the current one last. */
export function history(phase: ViewPlaying): TrickRecord[] {
  const done = phase.tricks.map((t, index) => ({ index, half: t.half, plays: t.plays, winner: t.winner as Seat | null }))
  const current = { index: phase.tricks.length, half: phase.half, plays: phase.current, winner: null }
  return [...done, current].filter((t) => t.plays.length > 0)
}

export function wouldWin(phase: ViewPlaying, me: Seat, card: Card): boolean {
  return trickWinner([...phase.current, { seat: me, card }], phase.trump) === me
}

/** 1, plus a half each for being behind in balls and behind in card points this round. */
export function mood(view: View): number {
  const me = view.seat
  if (me === null) return 1
  const team = teamOf(me)
  let m = view.balls[team] < view.balls[1 - team] ? 1.5 : 1
  const phase = view.phase
  if (phase.kind === 'playing' || phase.kind === 'trickPause') {
    const points = [0, 0]
    for (const t of phase.tricks) points[teamOf(t.winner)] += pointsOf(t.plays.map((p) => p.card))
    if (points[team] < points[1 - team]) m += 0.5
  }
  return m
}
