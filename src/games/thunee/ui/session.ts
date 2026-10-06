/** The table and the coach, as Thunee's screens read them. */
import type { Note } from '../coach/note'
import type { Action, Card, GameEvent, View } from '../engine'
import { coachHooks } from '../../../ui/coach/context'
import { sessionHooks } from '../../../ui/session'

export const { useSession } = sessionHooks<View, Action, GameEvent>()

/** Present only in a practice game; each round keeps both halves' deals. */
export const { useCoach } = coachHooks<Action, Note, Card[][]>()
