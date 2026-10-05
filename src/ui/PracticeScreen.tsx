import { useEffect, useState } from 'react'
import { type PracticeSession, openPracticeSession } from '../practice/session'
import { CoachContext } from './coach/context'
import { ErrorBoundary, Screen } from './GameScreen'
import { practicePath } from './routes'
import { SessionContext } from './session'

/** `/thunee/practice?players=4` starts a new game; plain `/thunee/practice` continues the saved one. */
function requestedPlayers(): 2 | 4 | null {
  const n = new URLSearchParams(location.search).get('players')
  return n === '2' ? 2 : n === '4' ? 4 : null
}

export function PracticeScreen() {
  const [session, setSession] = useState<PracticeSession | null>(null)
  useEffect(() => {
    const opened = openPracticeSession({ playerCount: requestedPlayers() })
    // A reload should continue this game, not start another.
    history.replaceState(null, '', practicePath('thunee'))
    setSession(opened)
    return () => opened.close()
  }, [])
  if (!session) return null
  return (
    <ErrorBoundary>
      <SessionContext.Provider value={session}>
        <CoachContext.Provider value={session.coach}>
          <Screen room="practice" />
        </CoachContext.Provider>
      </SessionContext.Provider>
    </ErrorBoundary>
  )
}
