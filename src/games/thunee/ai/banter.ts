/** What Thunee's computers say about the game: the moments that matter, for the kit's banter. */
import { type Moment, type Said, banterFor } from '../../../kit/talk'
import { allSeats } from '../../../kit/table'
import type { Game, GameEvent } from '../engine'
import { teamOf } from '../engine/seats'

function moments(game: Game, events: readonly GameEvent[]): Moment[] {
  const team = (t: number) => allSeats(game.playerCount).filter((s) => teamOf(s) === t)
  return events.flatMap((e): Moment[] => {
    switch (e.type) {
      case 'cardPlayed':
        return e.card.rank === 'J' ? [{ kind: 'slam', seat: e.seat }] : []
      case 'trickWon':
        return e.points >= 40 ? [{ kind: 'bigTrick', seat: e.seat }] : []
      case 'challengeResolved':
        return [e.guilty ? { kind: 'caught', challenger: e.challenger, accused: e.accused } : { kind: 'wrongChallenge', challenger: e.challenger }]
      case 'roundScored':
        return e.summary.balls > 0 ? [{ kind: 'scored', up: team(e.summary.winner), down: team(1 - e.summary.winner) }] : []
      case 'gameOver':
        return [{ kind: 'gameWon', winners: team(e.winner) }]
      default:
        return []
    }
  })
}

export function banter(game: Game, events: readonly GameEvent[], rng: () => number): Said[] {
  const behind = (seat: number) => game.balls[teamOf(seat)] < game.balls[1 - teamOf(seat)]
  return banterFor(game, moments(game, events), rng, behind)
}
