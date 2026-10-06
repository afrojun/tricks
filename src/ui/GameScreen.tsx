import { Component, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import type { Team } from '../games/thunee/engine'
import { CHALLENGE_BEAT_MS, VERDICT_BEAT_MS, present } from '../games/thunee/ui/present'
import { Lobby } from './Lobby'
import { Celebration, MomentOverlay, useMoments } from './Moments'
import { BALL_STAGGER_MS, type BallBurst, Table } from '../games/thunee/ui/Table'
import { gamePath } from './routes'
import { SessionProvider, navigate, useClient, useSession } from './session'
import { playSound } from './sound'
import { rejectionText } from './text'

export function Screen({ room }: { room: string }) {
  const { store } = useSession()
  const client = useClient()
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null)
  const [burst, setBurst] = useState<BallBurst | null>(null)
  const [celebrate, setCelebrate] = useState<{ team: Team; id: number } | null>(null)
  const moments = useMoments()
  const pushMoment = moments.push

  // Delayed presentation steps, all cancelled if the screen goes away.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const later = useCallback((run: () => void, ms: number) => {
    if (ms <= 0) return run()
    timers.current.push(setTimeout(run, ms))
  }, [])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  useEffect(
    () =>
      store.onEvent((event, view, seat) => {
        const shown = present(event, view, seat)
        if (shown.toast) setToast({ text: shown.toast, id: event.n })
        shown.moments?.forEach(pushMoment)
        if (event.type === 'roundScored') {
          const { winner, balls, ballsAfter, challenge } = event.summary
          // After a challenge, the balls wait for the verdict.
          const wait = challenge ? CHALLENGE_BEAT_MS + VERDICT_BEAT_MS / 2 : 0
          later(() => setBurst({ team: winner, from: ballsAfter[winner] - balls, count: balls, id: event.n }), wait)
          for (let i = 0; i < balls; i++) later(() => playSound('pip'), wait + i * BALL_STAGGER_MS)
        }
        if (event.type === 'dealt') setBurst(null)
        if (event.type === 'gameOver') setCelebrate({ team: event.winner, id: event.n })
      }),
    [store, pushMoment, later],
  )
  useEffect(() => {
    if (!celebrate) return
    const timer = setTimeout(() => setCelebrate(null), 3200)
    return () => clearTimeout(timer)
  }, [celebrate])
  useEffect(() => {
    if (!client.rejection) return
    setToast({ text: rejectionText(client.rejection.reason), id: -client.rejection.id })
    store.clearRejection()
  }, [client.rejection, store])

  if (!client.view) {
    return (
      <main className="h-full grid place-items-center p-6 text-center">
        <p className="display text-xl turn-marker">Connecting to game {room}</p>
      </main>
    )
  }
  return (
    <>
      {client.connection !== 'open' && (
        <p className="fixed top-0 inset-x-0 z-50 bg-danger text-center py-1" style={{ color: 'var(--on-danger)' }} role="status">
          Connection lost. Reconnecting.
        </p>
      )}
      {client.error && (
        <p className="fixed bottom-0 inset-x-0 z-50 bg-danger text-center py-1" style={{ color: 'var(--on-danger)' }} role="alert">
          {client.error}
        </p>
      )}
      {client.view.phase.kind === 'lobby' ? <Lobby view={client.view} room={room} /> : <Table view={client.view} room={room} burst={burst} />}
      <MomentOverlay moment={moments.current} />
      {celebrate && <Celebration key={celebrate.id} team={celebrate.team} />}
      {toast && (
        <p key={toast.id} className="panel toast" role="status">
          {toast.text}
        </p>
      )}
    </>
  )
}

/** Replaces a blank screen with a way out if rendering ever throws. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error(error)
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="h-full grid place-items-center p-6">
        <section className="panel p-4 max-w-sm grid gap-3">
          <h1 className="display text-xl">The table stopped drawing</h1>
          <p>Your seat and cards are safe on the server. Reload to pick up where you left off.</p>
          <button className="btn btn-primary" onClick={() => location.reload()}>
            Reload
          </button>
          <button className="btn" onClick={() => navigate(gamePath('thunee'))}>
            Leave game
          </button>
        </section>
      </main>
    )
  }
}

export function GameScreen({ room }: { room: string }) {
  return (
    <ErrorBoundary>
      <SessionProvider room={room} key={room}>
        <Screen room={room} />
      </SessionProvider>
    </ErrorBoundary>
  )
}
