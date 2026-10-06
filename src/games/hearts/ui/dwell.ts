/** How long each of Hearts' events holds the screen before the next message is shown. For its screens. */
import type { GameEvent } from '../engine'
import { CHALLENGE_BEAT_MS, HEARTS_BROKEN_MS, VERDICT_BEAT_MS } from './present'

const DWELL_MS: Partial<Record<GameEvent['type'], number>> = {
  passChosen: 300,
  cardPlayed: 450,
  dealt: 600,
  passesExchanged: 900,
  // The events below show a moment, which is seen before the next message moves the table.
  heartsBroken: HEARTS_BROKEN_MS + 100,
  // The verdict comes in the same message, as the round's score: both beats are seen.
  challengeResolved: CHALLENGE_BEAT_MS + VERDICT_BEAT_MS,
}

export function dwell(event: GameEvent): number {
  // A moon or a verdict is announced as the round is scored; an ordinary score shows no moment.
  if (event.type === 'roundScored') return event.summary.moon !== null || event.summary.challenge ? VERDICT_BEAT_MS : 0
  return DWELL_MS[event.type] ?? 0
}
