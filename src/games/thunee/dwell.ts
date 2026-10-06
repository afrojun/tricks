/** How long each of Thunee's events holds the screen before the next message is shown. For its screens. */
import type { GameEvent } from './engine'

const DWELL_MS: Partial<Record<GameEvent['type'], number>> = {
  passed: 300,
  cardPlayed: 450,
  dealt: 600,
  trumpRevealed: 600,
  trumpChosen: 700,
  called: 800,
  jodhiClaimed: 2800,
  dealCancelled: 1500,
  doubleCalled: 1600,
  khanaakCalled: 1600,
  thuneeCalled: 1800,
  challengeResolved: 2200,
}

export function dwell(event: GameEvent): number {
  return DWELL_MS[event.type] ?? 0
}
