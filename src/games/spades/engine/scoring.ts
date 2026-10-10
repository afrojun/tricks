import { type Seat, allSeats } from '../../../kit/table'
import type { Card } from './cards'
import {
  BAG_PENALTY,
  BAGS_PER_PENALTY,
  BLIND_NIL_POINTS,
  NIL_POINTS,
  RENEGE_TRICKS,
  type SpadesRules,
  seatsOf,
  sideCount,
} from './rules'
import type { Call, Game, GameEvent, NilResult, RoundPlay, RoundSummary, SideResult } from './types'

export type Outcome =
  | { kind: 'normal' }
  | { kind: 'challenge'; challenger: Seat; accused: Seat; guilty: boolean; rule: string | null; card: Card; setSide: number }

/** Tricks each seat has taken, as the tricks stand. */
export function takenBySeat(tricks: readonly { winner: Seat }[], playerCount: number): number[] {
  const out = allSeats(playerCount).map(() => 0)
  for (const t of tricks) out[t.winner]++
  return out
}

const isNil = (call: Call) => call.tricks === 0
const nilValue = (call: Call) => (call.blind ? BLIND_NIL_POINTS : NIL_POINTS)

/** A side's contract as the round stands: its non-Nil players' calls, and three for each penalty. */
export function contractOf(side: number, calls: readonly Call[], raised: readonly number[], playerCount: number): number {
  return seatsOf(side, playerCount).reduce((sum, s) => sum + calls[s].tricks, 0) + RENEGE_TRICKS * raised[side]
}

/** Every side's contract as the round stands. */
export function contracts(calls: readonly Call[], raised: readonly number[], playerCount: number): number[] {
  return allSides(playerCount).map((side) => contractOf(side, calls, raised, playerCount))
}

/** A side's non-Nil players' tricks: what counts toward its contract. */
export function contractTricks(side: number, calls: readonly Call[], taken: readonly number[], playerCount: number): number {
  return seatsOf(side, playerCount).reduce((sum, s) => sum + (isNil(calls[s]) ? 0 : taken[s]), 0)
}

export function allSides(playerCount: number): number[] {
  return allSeats(sideCount(playerCount))
}

/** What the bags of one round cost, after the side's count before it: 100 for each multiple of ten reached. */
export function bagPenalty(before: number, gained: number, rules: Pick<SpadesRules, 'bagPenalty'>): number {
  if (!rules.bagPenalty) return 0
  const reached = Math.floor((before + gained) / BAGS_PER_PENALTY) - Math.floor(before / BAGS_PER_PENALTY)
  return reached === 0 ? 0 : -BAG_PENALTY * reached
}

/**
 * One side's round played out, by the formula of the spec's section 2. A side with no contract (its players all
 * called Nil) has made it, for nothing.
 */
export function scoreSide(side: number, play: RoundPlay, bagsBefore: number, rules: SpadesRules, playerCount: number): SideResult {
  const taken = takenBySeat(play.tricks, playerCount)
  const contract = contractOf(side, play.calls, play.raised, playerCount)
  const tricks = contractTricks(side, play.calls, taken, playerCount)
  const nils: NilResult[] = seatsOf(side, playerCount)
    .filter((s) => isNil(play.calls[s]))
    .map((seat) => {
      const call = play.calls[seat]
      const made = taken[seat] === 0 && !play.nilFailed[seat]
      return { seat, blind: call.blind, tricks: taken[seat], failed: play.nilFailed[seat], points: made ? nilValue(call) : -nilValue(call) }
    })
  const made = tricks >= contract
  const nilTricks = nils.reduce((sum, n) => sum + n.tricks, 0)
  const bags = (made ? tricks - contract : 0) + nilTricks
  const penalty = bagPenalty(bagsBefore, bags, rules)
  const contractPoints = contract === 0 ? 0 : made ? 10 * contract : -10 * contract
  const points = contractPoints + bags + penalty + nils.reduce((sum, n) => sum + n.points, 0)
  return { contract, raised: RENEGE_TRICKS * play.raised[side], tricks, made, set: false, nils, bags, bagPenalty: penalty, points }
}

/**
 * A side's round ended by an accusation under `renege: 'set'`: the side set loses its contract and every Nil, and
 * every other side scores exactly what it called, with no bags either way.
 */
export function scoreChallenged(side: number, play: RoundPlay, setSide: number, playerCount: number): SideResult {
  const taken = takenBySeat(play.tricks, playerCount)
  const contract = contractOf(side, play.calls, play.raised, playerCount)
  const sign = side === setSide ? -1 : 1
  const nils: NilResult[] = seatsOf(side, playerCount)
    .filter((s) => isNil(play.calls[s]))
    .map((seat) => ({ seat, blind: play.calls[seat].blind, tricks: taken[seat], failed: false, points: sign * nilValue(play.calls[seat]) }))
  const points = sign * 10 * contract + nils.reduce((sum, n) => sum + n.points, 0)
  return {
    contract,
    raised: 0,
    tricks: contractTricks(side, play.calls, taken, playerCount),
    made: side !== setSide,
    set: side === setSide,
    nils,
    bags: 0,
    bagPenalty: 0,
    points,
  }
}

/** Once any side reaches the end, the single highest score wins; while the highest is shared, play goes on. */
export function gameWinner(scores: readonly number[], rules: Pick<SpadesRules, 'gameEndsAt'>): number | null {
  if (!scores.some((s) => s >= rules.gameEndsAt)) return null
  const high = Math.max(...scores)
  const highest = scores.flatMap((score, side) => (score === high ? [side] : []))
  return highest.length === 1 ? highest[0] : null
}

/** Scores the round, updates the totals, and moves to `roundResult` or `gameOver`. */
export function finishRound(game: Game, play: RoundPlay, outcome: Outcome, events: GameEvent[]): void {
  const sides = allSides(game.playerCount).map((side) =>
    outcome.kind === 'challenge'
      ? scoreChallenged(side, play, outcome.setSide, game.playerCount)
      : scoreSide(side, play, game.bags[side], game.rules, game.playerCount),
  )
  game.scores = game.scores.map((score, side) => score + sides[side].points)
  game.bags = game.bags.map((bags, side) => bags + sides[side].bags)
  const summary: RoundSummary = {
    roundNumber: game.roundNumber,
    reason: outcome.kind,
    sides,
    scoresAfter: [...game.scores],
    bagsAfter: [...game.bags],
  }
  if (outcome.kind === 'challenge') {
    const { challenger, accused, guilty, rule, card } = outcome
    summary.challenge = { challenger, accused, guilty, rule, card }
  }
  events.push({ type: 'roundScored', summary })

  const winner = gameWinner(game.scores, game.rules)
  if (winner !== null) {
    game.phase = { kind: 'gameOver', again: [], winner, summary }
    events.push({ type: 'gameOver', winner })
    return
  }
  game.phase = { kind: 'roundResult', summary }
}
