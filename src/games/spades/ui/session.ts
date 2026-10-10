/** The table and the coach, as Spades' screens read them. */
import type { Action, Card, GameEvent, View } from '../engine'
import type { Note } from '../../../practice/contract'
import { coachHooks } from '../../../ui/coach/context'
import { sessionHooks } from '../../../ui/session'

export const { useSession } = sessionHooks<View, Action, GameEvent>()

/** Present only in a practice game; each round keeps its deal, the hands as dealt or drawn. */
export const { useCoach } = coachHooks<Action, Note, Card[][]>()
