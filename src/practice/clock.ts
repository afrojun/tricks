import type { Seat } from '../kit/table'

/**
 * Whether something is waiting on the player, so the practice clock must not run:
 * a decision of theirs, a pause they have not yet continued past, or an open sheet.
 * `pause` identifies the pause showing, if any; `continued` the one they continued past.
 */
export function waitingOnPlayer(pause: string | null, toAct: readonly Seat[], you: Seat, sheetOpen: boolean, continued: string | null): boolean {
  if (sheetOpen) return true
  if (pause !== null) return pause !== continued
  return toAct.includes(you)
}
