/** How long each of Thunee's events holds the screen before the next message is shown. For its screens. */
import type { GameEvent } from '../engine'
import { WIN_BEAT_MS } from '../../../ui/contract'
import { CHALLENGE_BEAT_MS, MAX_WIN_WAIT_MS, VERDICT_BEAT_MS } from './present'

const DWELL_MS: Partial<Record<GameEvent['type'], number>> = {
  passed: 300,
  cardPlayed: 450,
  dealt: 600,
  trumpRevealed: 600,
  trumpChosen: 700,
  called: 800,
  jodhiClaimed: 2800,
  dealCancelled: 1500,
  doubleCalled: 2100,
  khanaakCalled: 2100,
  thuneeCalled: 2400,
  // The challenge, then its verdict, which comes in the same message.
  challengeResolved: CHALLENGE_BEAT_MS + VERDICT_BEAT_MS,
  // The win waits for the verdict and the balls, then holds the middle of the table.
  gameOver: MAX_WIN_WAIT_MS + WIN_BEAT_MS + 200,
}

export function dwell(event: GameEvent): number {
  return DWELL_MS[event.type] ?? 0
}
