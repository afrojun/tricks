/**
 * Spades' computer players: a stand-in that plays the first legal card and calls a plain count, until the
 * hand-written player arrives. Its chances come from the round's salt, so a decision never changes when it is
 * asked again.
 */
import type { Mind } from '../../../kit/mind'
import { availableActions } from '../engine/available'
import { handSize } from '../engine/rules'
import type { Action, View } from '../engine/types'

/** What this seat does now, or null when it has nothing to decide. Never a rule-breaking card. */
export function chooseAction(view: View, _mind: Mind): Action | null {
  return fallbackAction(view)
}

/** The plainest legal action, tried if the chosen one is refused. */
export function fallbackAction(view: View): Action | null {
  const can = availableActions(view)
  if (can.draw) return { type: 'draw', keep: true }
  if (can.look) return { type: 'lookAtHand' }
  if (can.calls.length > 0) return { type: 'call', tricks: Math.max(1, Math.floor(handSize(view.playerCount) / view.playerCount) - 1) }
  if (can.give.length > 0) return { type: 'giveCards', cards: can.give.slice(0, 2) }
  if (can.legal.length > 0) return { type: 'playCard', card: can.legal[0] }
  return null
}

/** Whether to accuse anyone now: never, until the computers learn to catch. */
export function chooseChallenge(_view: View, _mind: Mind): Action | null {
  return null
}
