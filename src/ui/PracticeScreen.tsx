import { useEffect, useState } from 'react'
import type { PracticeSession } from '../practice/session'
import type { Note } from '../practice/contract'
import { CoachContext } from './coach/context'
import type { ShellView } from './contract'
import { ErrorBoundary, Screen } from './GameScreen'
import { gamePath, practicePath } from './routes'
import { SessionContext, navigate, useGameClient } from './session'

/** `/<game>/practice?players=4` starts a new game; plain `/<game>/practice` continues the saved one. */
function requestedPlayers(seatCounts: readonly number[]): number | null {
  const n = Number(new URLSearchParams(location.search).get('players'))
  return seatCounts.includes(n) ? n : null
}

export function PracticeScreen() {
  const game = useGameClient()
  const practice = game.practice
  const [session, setSession] = useState<PracticeSession<ShellView, unknown, { type: string }, Note, unknown> | null>(null)
  useEffect(() => {
    if (!practice) return
    const opened = practice.open({ playerCount: requestedPlayers(game.seatCounts) })
    // A reload should continue this game, not start another.
    history.replaceState(null, '', practicePath(game.id))
    setSession(opened)
    return () => opened.close()
  }, [game, practice])
  if (!practice) return <PracticeComing />
  if (!session) return null
  return (
    <ErrorBoundary home={gamePath(game.id)}>
      <SessionContext.Provider value={session}>
        <CoachContext.Provider value={session.coach}>
          <Screen room="practice" />
        </CoachContext.Provider>
      </SessionContext.Provider>
    </ErrorBoundary>
  )
}

/** For a game whose practice is not written yet. */
function PracticeComing() {
  const game = useGameClient()
  return (
    <main className="min-h-full flex flex-col items-center gap-5 p-4 pb-10">
      <section className="panel p-4 w-full max-w-sm grid gap-3 mt-6">
        <h1 className="display text-xl">Practice is coming</h1>
        <p>Practice games against the computer, with a coach, are coming to {game.name}. Until then, start a game of your own and add computers to the other seats.</p>
        <button className="btn btn-primary" onClick={() => navigate(gamePath(game.id))}>
          Back to {game.name}
        </button>
      </section>
    </main>
  )
}
