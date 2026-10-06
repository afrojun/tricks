/** How long each of Hearts' events holds the screen before the next message is shown. For its screens. */
import type { GameEvent } from '../engine'

const DWELL_MS: Partial<Record<GameEvent['type'], number>> = {
  passChosen: 300,
  cardPlayed: 450,
  dealt: 600,
  passesExchanged: 900,
  // Its moment is seen before the next card lands.
  heartsBroken: 1200,
  challengeResolved: 2200,
}

export function dwell(event: GameEvent): number {
  return DWELL_MS[event.type] ?? 0
}
