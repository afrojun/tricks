/** What Spades' computers say about the game: the moments that matter, for the kit's banter. */
import { type Moment, type Said, banterFor } from '../../../kit/talk'
import type { Seat } from '../../../kit/table'
import { isJoker } from '../engine/cards'
import { seatsOf, sideOf } from '../engine/rules'
import type { Game, GameEvent } from '../engine/types'

function moments(game: Game, events: readonly GameEvent[]): Moment[] {
  const seatsOfSide = (side: number): Seat[] => seatsOf(side, game.playerCount)
  return events.flatMap((e): Moment[] => {
    switch (e.type) {
      case 'cardPlayed':
        return isJoker(e.card) || (e.card.suit === 'spades' && e.card.rank === 'A') ? [{ kind: 'slam', seat: e.seat }] : []
      case 'nilBroken':
        return [{ kind: 'stung', seat: e.seat }]
      case 'contractMade':
        return [{ kind: 'bigTrick', seat: seatsOfSide(e.side)[0] }]
      case 'challengeResolved':
        return [e.guilty ? { kind: 'caught', challenger: e.challenger, accused: e.accused } : { kind: 'wrongChallenge', challenger: e.challenger }]
      case 'roundScored': {
        const points = e.summary.sides.map((s) => s.points)
        const best = Math.max(...points)
        const worst = Math.min(...points)
        const sides = points.map((_, side) => side)
        return [
          {
            kind: 'scored',
            up: sides.filter((s) => points[s] === best).flatMap(seatsOfSide),
            down: worst < best ? sides.filter((s) => points[s] === worst).flatMap(seatsOfSide) : [],
          },
        ]
      }
      case 'gameOver':
        return [{ kind: 'gameWon', winners: seatsOfSide(e.winner) }]
      default:
        return []
    }
  })
}

export function banter(game: Game, events: readonly GameEvent[], rng: () => number): Said[] {
  const behind = (seat: Seat) => {
    const mine = game.scores[sideOf(seat, game.playerCount)]
    return game.scores.some((s) => s > mine)
  }
  return banterFor(game, moments(game, events), rng, behind)
}

