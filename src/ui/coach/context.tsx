import { createContext, useContext, useSyncExternalStore } from 'react'
import type { Coach, CoachState } from '../../practice/session'

/** Present only in a practice game; online tables never see a coach. */
export const CoachContext = createContext<Coach | null>(null)

const NO_COACH = { subscribe: () => () => {}, getState: () => null }

/** The coach and what it currently says, or null outside practice. */
export function useCoach(): { coach: Coach; state: CoachState } | null {
  const coach = useContext(CoachContext)
  const source = coach ?? NO_COACH
  const state = useSyncExternalStore(source.subscribe, source.getState)
  return coach && state ? { coach, state } : null
}
