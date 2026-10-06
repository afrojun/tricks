import { createContext, useContext, useSyncExternalStore } from 'react'
import type { Note } from '../../practice/contract'
import type { Coach, CoachState } from '../../practice/session'

/** Any game's coach, as the practice screen provides it. */
export type ShellCoach = Coach<unknown, Note, unknown>

/** Present only in a practice game; online tables never see a coach. */
export const CoachContext = createContext<ShellCoach | null>(null)

const NO_COACH = { subscribe: () => () => {}, getState: () => null }

/**
 * The coach hooks for a game's screens, typed by its actions, notes and deals. Sound because the
 * practice screen provides only the coach of the game whose screens it draws.
 */
export function coachHooks<A, N extends Note, D>() {
  /** The coach and what it currently says, or null outside practice. */
  function useCoach(): { coach: Coach<A, N, D>; state: CoachState<A, N, D> } | null {
    const coach = useContext(CoachContext) as unknown as Coach<A, N, D> | null
    const source = coach ?? NO_COACH
    const state = useSyncExternalStore(source.subscribe, source.getState)
    return coach && state ? { coach, state } : null
  }
  return { useCoach }
}

/** The shell's own: whether a coach is present, and whether the table waits on the player. */
export const { useCoach } = coachHooks<unknown, Note, unknown>()
