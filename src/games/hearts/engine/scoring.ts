import { type Seat, allSeats } from '../../../kit/table'
import { type Card, penaltyPoints, trickPoints } from './cards'
import { CHALLENGE_POINTS, type HeartsRules, MOON_POINTS, PLAYERS } from './rules'
import type { Game, GameEvent, RoundPlay, RoundSummary } from './types'

export type Outcome =
  | { kind: 'normal' }
  | { kind: 'challenge'; challenger: Seat; accused: Seat; guilty: boolean; rule: string | null; card: Card }

type Tricks = readonly { plays: readonly { card: Card }[]; winner: Seat }[]

/** Points each seat has taken this round, as the tricks stand; the jack of diamonds counts when the rules say so. */
export function takenBySeat(tricks: Tricks, rules: Pick<HeartsRules, 'jackOfDiamonds'>): number[] {
  const out = allSeats(PLAYERS).map(() => 0)
  for (const t of tricks) out[t.winner] += trickPoints(t.plays.map((p) => p.card), rules)
  return out
}

/**
 * A finished round's points by seat. A seat that took all 26 shoots the moon.
 * The jack of diamonds counts for whoever took it, whatever else happens.
 */
export function roundPoints(tricks: Tricks, rules: HeartsRules): { points: number[]; moon: Seat | null } {
  const penalty = allSeats(PLAYERS).map(() => 0)
  for (const t of tricks) penalty[t.winner] += penaltyPoints(t.plays.map((p) => p.card))
  const taken = takenBySeat(tricks, rules)
  const jack = taken.map((points, seat) => points - penalty[seat])
  const shooter = penalty.findIndex((p) => p === MOON_POINTS)
  if (shooter === -1) return { points: taken, moon: null }
  const moon = (seat: Seat) => {
    if (rules.moon === 'othersAdd') return seat === shooter ? 0 : MOON_POINTS
    return seat === shooter ? -MOON_POINTS : 0
  }
  return { points: allSeats(PLAYERS).map((seat) => moon(seat) + jack[seat]), moon: shooter }
}

/** Once any score reaches the end, the single lowest score wins; while the lowest is shared, play goes on. */
export function gameWinner(scores: readonly number[], rules: Pick<HeartsRules, 'gameEndsAt'>): Seat | null {
  if (!scores.some((s) => s >= rules.gameEndsAt)) return null
  const low = Math.min(...scores)
  const lowest = allSeats(PLAYERS).filter((seat) => scores[seat] === low)
  return lowest.length === 1 ? lowest[0] : null
}

/** Scores the round, updates the totals, and moves to `roundResult` or `gameOver`. */
export function finishRound(game: Game, play: RoundPlay, outcome: Outcome, events: GameEvent[]): void {
  let summary: RoundSummary
  if (outcome.kind === 'challenge') {
    // Tricks taken this round do not count, and nobody shoots the moon.
    const loser = outcome.guilty ? outcome.accused : outcome.challenger
    const points = allSeats(PLAYERS).map((seat) => (seat === loser ? CHALLENGE_POINTS : 0))
    const { challenger, accused, guilty, rule, card } = outcome
    summary = { roundNumber: game.roundNumber, reason: 'challenge', points, scoresAfter: [], moon: null, challenge: { challenger, accused, guilty, rule, card } }
  } else {
    const { points, moon } = roundPoints(play.tricks, game.rules)
    summary = { roundNumber: game.roundNumber, reason: moon === null ? 'normal' : 'moon', points, scoresAfter: [], moon }
  }
  game.scores = game.scores.map((score, seat) => score + summary.points[seat])
  summary.scoresAfter = [...game.scores]
  events.push({ type: 'roundScored', summary })

  const winner = gameWinner(game.scores, game.rules)
  if (winner !== null) {
    game.phase = { kind: 'gameOver', winner, summary }
    events.push({ type: 'gameOver', winner })
    return
  }
  game.phase = { kind: 'roundResult', summary }
}
