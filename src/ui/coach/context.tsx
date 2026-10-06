import { createContext, useContext, useSyncExternalStore } from 'react'
import type { Note } from '../../coach/note'
import type { Action, Card } from '../../games/thunee/engine'
import type { Coach, CoachState } from '../../practice/session'

/** Thunee's coach, as practice runs it: notes in Thunee's words, and each round's two deals. */
export type ThuneeCoach = Coach<Action, Note, Card[][]>
type ThuneeCoachState = CoachState<Action, Note, Card[][]>

/** Present only in a practice game; online tables never see a coach. */
export const CoachContext = createContext<ThuneeCoach | null>(null)

const NO_COACH = { subscribe: () => () => {}, getState: () => null }

/** The coach and what it currently says, or null outside practice. */
export function useCoach(): { coach: ThuneeCoach; state: ThuneeCoachState } | null {
  const coach = useContext(CoachContext)
  const source = coach ?? NO_COACH
  const state = useSyncExternalStore(source.subscribe, source.getState)
  return coach && state ? { coach, state } : null
}
