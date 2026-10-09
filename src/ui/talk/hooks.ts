/** The hooks talk's screens read: what is heard here, the mutes, and saying something within the budget. */
import { useCallback, useMemo } from 'react'
import type { Showing } from '../../client/talk'
import type { Say } from '../../kit/talk'
import type { Seat } from '../../kit/table'
import { useTalksOn } from '../prefs'
import { useSession, useTalk } from '../session'
import { budget } from './budget'
import { heard, sayKey } from './choices'
import { type Mutes, mutesFor, useMuted } from './mute'

/** This table's mutes. */
export function useMutes(): Mutes {
  return mutesFor(useSession())
}

/** What shows here now: nothing with reactions off, nothing from a muted seat. */
export function useHeard(): readonly Showing[] {
  const showing = useTalk()
  const on = useTalksOn()
  const muted = useMuted(useMutes())
  return useMemo(() => heard(showing, on, muted), [showing, on, muted])
}

/** The line or emote showing at a seat now, if any. */
export function useSaidAt(seat: Seat | null): Showing | null {
  const shown = useHeard()
  return seat === null ? null : (shown.find((s) => s.seat === seat && s.say.kind !== 'throw') ?? null)
}

/** Says something if the budget allows; false if it is still running, and nothing was sent. */
export function useSay(): (say: Say) => boolean {
  const { say } = useSession()
  return useCallback(
    (said: Say) => {
      if (!budget.spend(sayKey(said))) return false
      say(said)
      return true
    },
    [say],
  )
}
