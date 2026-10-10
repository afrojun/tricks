/** How long each of Spades' events holds the screen before the next message is shown. For its screens. */
import { WIN_BEAT_MS } from '../../../ui/contract'
import type { GameEvent } from '../engine'
import { BAGS_MS, CHALLENGE_BEAT_MS, NIL_BROKEN_MS, NIL_CALL_MS, SET_MS, SPADES_BROKEN_MS, VERDICT_BEAT_MS } from './present'

/**
 * A message holds the screen for its longest event's dwell while its moments show one after another, so an event
 * that can share a message with others covers all of theirs. The card that completes a trick can break spades and
 * a Nil together; the last card of a round brings its score, and the last round the win.
 */
const TRICK_MOMENTS_MS = SPADES_BROKEN_MS + NIL_BROKEN_MS
/** The most a round's score shows: a challenge and its verdict, or a side set and a side's bags. */
const ROUND_MOMENTS_MS = Math.max(CHALLENGE_BEAT_MS + VERDICT_BEAT_MS, SET_MS + BAGS_MS)

const DWELL_MS: Partial<Record<GameEvent['type'], number>> = {
  drew: 300,
  cardsGiven: 300,
  cardPlayed: 450,
  dealt: 600,
  cardsExchanged: 900,
  spadesBroken: SPADES_BROKEN_MS + 100,
  nilBroken: TRICK_MOMENTS_MS + 100,
  challengeResolved: CHALLENGE_BEAT_MS + VERDICT_BEAT_MS + 100,
  gameOver: TRICK_MOMENTS_MS + ROUND_MOMENTS_MS + WIN_BEAT_MS + 100,
}

export function dwell(event: GameEvent): number {
  if (event.type === 'called') return event.call.tricks === 0 ? NIL_CALL_MS + 100 : 600
  if (event.type === 'roundScored') {
    if (event.summary.challenge) return 0
    const set = event.summary.sides.some((s) => s.contract > 0 && !s.made)
    const bags = event.summary.sides.some((s) => s.bagPenalty < 0)
    return TRICK_MOMENTS_MS + (set ? SET_MS : 0) + (bags ? BAGS_MS : 0)
  }
  return DWELL_MS[event.type] ?? 0
}
