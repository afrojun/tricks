/** Loading saved games written by older versions. */
import { FORMAT_VERSION, type Game } from './types'

/**
 * Brings a stored game up to the current format, or returns null if it is
 * too old to use. `salt` replaces the round salt older saves did not have.
 */
export function upgradeGame(stored: unknown, salt: number): Game | null {
  if (stored === null || typeof stored !== 'object') return null
  const game = structuredClone(stored) as Game
  if (game.formatVersion === FORMAT_VERSION) return game
  if (game.formatVersion !== 1) return null
  for (const seat of game.seats) {
    seat.persona ??= 'straight'
    seat.personaHidden ??= false
  }
  game.aiSalt = salt
  const phase = game.phase
  if (phase.kind === 'playing' || phase.kind === 'trickPause') {
    for (const claim of phase.play.jodhiClaims) claim.trick ??= phase.play.tricks.length
  }
  game.formatVersion = FORMAT_VERSION
  return game
}
