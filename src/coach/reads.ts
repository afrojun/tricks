/** What the player can work out from cards played face up: who has run out of a suit, and the points so far. */
import { type Seat, type Suit, type View, type ViewPlaying, pointsOf, teamOf } from '../games/thunee/engine'
import { history } from '../ai/read'
import { inPlay } from '../ai/suspicion'

export interface Read {
  seat: Seat
  voidIn: Suit
}

/** Each other seat that has shown it holds none of a suit this half, by not following it. */
export function reads(view: View): Read[] {
  const phase = inPlay(view)
  if (phase === null) return []
  const out: Read[] = []
  for (const trick of history(phase)) {
    if (trick.half !== phase.half) continue
    const led = trick.plays[0].card.suit
    for (const play of trick.plays.slice(1)) {
      if (play.seat === view.seat || play.card.suit === led) continue
      if (!out.some((r) => r.seat === play.seat && r.voidIn === led)) out.push({ seat: play.seat, voidIn: led })
    }
  }
  return out
}

/** Card points in the tricks each side has won this round. */
export function runningPoints(view: View): [number, number] {
  const phase = inPlay(view)
  const out: [number, number] = [0, 0]
  if (phase === null) return out
  for (const trick of phase.tricks) out[teamOf(trick.winner)] += pointsOf(trick.plays.map((p) => p.card))
  return out
}

/** Points in the trick being played. */
export function trickPoints(phase: ViewPlaying): number {
  return pointsOf(phase.current.map((p) => p.card))
}
