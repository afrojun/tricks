import { type Game, type Seat, seatsToAct } from '../engine'

/** Identifies one trick pause, so continuing it is remembered across a reload. */
export function pauseId(game: Game): string | null {
  const phase = game.phase
  return phase.kind === 'trickPause' ? `${game.roundNumber}:${phase.play.tricks.length}` : null
}

/**
 * Whether something is waiting on the player, so the practice clock must not run:
 * a decision of theirs, a trick they have not yet continued past, or an open sheet.
 */
export function waitingOnPlayer(game: Game, you: Seat, sheetOpen: boolean, continued: string | null): boolean {
  if (sheetOpen) return true
  const pause = pauseId(game)
  if (pause !== null) return pause !== continued
  return seatsToAct(game).includes(you)
}
