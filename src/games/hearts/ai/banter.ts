/** What Hearts' computers say about the game: the moments that matter, for the kit's banter. */
import { type Moment, type Said, banterFor } from '../../../kit/talk'
import { allSeats } from '../../../kit/table'
import type { Game, GameEvent } from '../engine/types'

function moments(game: Game, events: readonly GameEvent[]): Moment[] {
  return events.flatMap((e): Moment[] => {
    switch (e.type) {
      case 'cardPlayed':
        return e.card.suit === 'spades' && e.card.rank === 'Q' ? [{ kind: 'slam', seat: e.seat }] : []
      case 'trickWon':
        return e.points >= 13 ? [{ kind: 'stung', seat: e.seat }] : []
      case 'challengeResolved':
        return [e.guilty ? { kind: 'caught', challenger: e.challenger, accused: e.accused } : { kind: 'wrongChallenge', challenger: e.challenger }]
      case 'roundScored': {
        const points = e.summary.points
        const least = Math.min(...points)
        const most = Math.max(...points)
        const seats = allSeats(game.playerCount)
        return [{ kind: 'scored', up: seats.filter((s) => points[s] === least), down: most > least ? seats.filter((s) => points[s] === most) : [] }]
      }
      case 'gameOver':
        return [{ kind: 'gameWon', winners: [e.winner] }]
      default:
        return []
    }
  })
}

export function banter(game: Game, events: readonly GameEvent[], rng: () => number): Said[] {
  const behind = (seat: number) => game.scores[seat] > Math.min(...game.scores)
  return banterFor(game, moments(game, events), rng, behind)
}
