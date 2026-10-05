/** How a computer catches a cheat: only from a proof, with the same cards a person at the table has seen. */
import { type Mind } from '../../../kit/mind'
import { noticed, playProofs } from '../../../kit/integrity'
import { availableActions } from '../engine/available'
import { seenPlays } from '../engine/excuses'
import type { Action, View } from '../engine/types'

/**
 * The accusation this computer makes now, if any. Each proof gets one look:
 * the roll for it never changes, so a proof missed once stays missed. Needs a
 * `full` view.
 */
export function chooseChallenge(view: View, mind: Mind): Action | null {
  const me = view.seat
  if (me === null) return null
  const can = availableActions(view)
  if (can.challengePlay.length === 0) return null
  const proof = noticed(playProofs(seenPlays(view), (s) => s !== me), mind, me)
  return proof !== null && can.challengePlay.includes(proof.accused) ? { type: 'challengePlay', seat: proof.accused } : null
}
