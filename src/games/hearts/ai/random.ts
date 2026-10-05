/**
 * A computer that passes and plays at random among legal choices: the stopgap
 * until Hearts has real computer players. Its chances come from the round's
 * salt, so a decision never changes when it is asked again.
 */
import { cardId } from '../../../kit/cards'
import { type Mind, roll } from '../../../kit/mind'
import { availableActions } from '../engine/available'
import type { Action, View } from '../engine/types'

/** What this seat does now, or null when it has nothing to decide. Never a rule-breaking card. */
export function chooseAction(view: View, mind: Mind): Action | null {
  const me = view.seat
  if (me === null) return null
  const can = availableActions(view)
  if (can.pass.length > 0) {
    const order = (c: (typeof can.pass)[number]) => roll(mind.salt, me, `pass:${cardId(c)}`)
    return { type: 'choosePass', cards: [...can.pass].sort((a, b) => order(a) - order(b)).slice(0, 3) }
  }
  const phase = view.phase
  if (can.legal.length > 0 && phase.kind === 'playing') {
    const at = `play:${phase.tricks.length}:${phase.current.length}`
    return { type: 'playCard', card: can.legal[Math.floor(roll(mind.salt, me, at) * can.legal.length)] }
  }
  return null
}

/** The plainest legal action, tried if the chosen one is refused. */
export function fallbackAction(view: View): Action | null {
  const can = availableActions(view)
  if (can.pass.length > 0) return { type: 'choosePass', cards: can.pass.slice(0, 3) }
  if (can.legal.length > 0) return { type: 'playCard', card: can.legal[0] }
  return null
}
