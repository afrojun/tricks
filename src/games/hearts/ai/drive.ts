/** What happens without a person acting: deadlines, computer turns, and computers' reactions. */
import { mindFor } from '../../../kit/mind'
import type { Ask, Step } from '../../../kit/module'
import { againComplete, allSeats, isAiControlled } from '../../../kit/table'
import { seatsToAct } from '../engine/apply'
import type { Action, Game, GameEvent } from '../engine/types'
import { viewFor } from '../engine/view'
import { chooseChallenge } from './catch'
import { chooseAction, fallbackAction } from './choose'

/** A passed phase deadline, or a computer turn whose time has come. Null when nothing is due. */
export function dueStep(game: Game, now: number): Step<Action> | null {
  const phase = game.phase
  if (phase.kind === 'gameOver' && againComplete(game, phase.again)) return { actor: 'system', action: { type: 'rematch', now: true } }
  if ('deadline' in phase && phase.deadline <= now) return { actor: 'system', action: { type: 'tick' } }
  if (game.aiActAt === null || game.aiActAt > now) return null
  const seat = seatsToAct(game).find((s) => isAiControlled(game, s))
  if (seat === undefined) return null
  const view = viewFor(game, seat, 'full')
  const action = chooseAction(view, mindFor(game, seat))
  if (action === null) return null
  const fallback = fallbackAction(view)
  return fallback === null ? { actor: seat, action } : { actor: seat, action, fallback }
}

/**
 * The questions to put to computer seats after an applied action: after any
 * card, whether to accuse someone. An accusation ends the round, so later
 * seats find nothing in play.
 */
export function reactions(game: Game, events: readonly GameEvent[]): Ask<Game, Action>[] {
  if (!events.some((e) => e.type === 'cardPlayed')) return []
  return allSeats(game.playerCount).map((seat) => (now: Game) => {
    if (now.phase.kind !== 'playing' && now.phase.kind !== 'trickPause') return null
    if (!isAiControlled(now, seat)) return null
    const action = chooseChallenge(viewFor(now, seat, 'full'), mindFor(now, seat))
    return action && { actor: seat, action }
  })
}
