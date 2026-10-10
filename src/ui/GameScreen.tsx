import { Component, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { HeldPresentations } from './held'
import { LeaveQuestion, useBackGuard } from './Leave'
import { Lobby } from './Lobby'
import { CELEBRATION_MS, Celebration, MomentOverlay, useMoments } from './Moments'
import { gamePath } from './routes'
import { SessionProvider, navigate, useClient, useGameClient, useSession } from './session'
import { TalkLayer } from './talk/TalkLayer'
import { Sheet } from './Sheet'
import { SuitText } from './SuitText'
import { rejectionText } from './text'

/** Why the room closed this table, for the two closes that wait for the player, and how to come back. */
const CLOSED = {
  replaced: { text: 'This table is open somewhere else on this device.', retry: 'Play here' },
  full: { text: 'Too many people are watching this table.', retry: 'Try again' },
} as const

/** The frame around any game's table: the connection, the lobby or the game's own table, what its events show, and the table's talk. */
export function Screen({ room }: { room: string }) {
  const game = useGameClient()
  const { store, reconnect } = useSession()
  const client = useClient()
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null)
  const [celebrate, setCelebrate] = useState<{ colour: string; id: number } | null>(null)
  const moments = useMoments()
  const pushMoment = moments.push

  // A presentation with `after` waits, unless the table moves on (a quick rematch) or the screen goes away first.
  const lastEvent = useRef(0)
  const held = useMemo(
    () =>
      new HeldPresentations((shown) => {
        if (shown.toast) setToast({ text: shown.toast, id: lastEvent.current })
        shown.moments?.forEach(pushMoment)
        if (shown.celebrate) setCelebrate({ colour: shown.celebrate, id: lastEvent.current })
      }),
    [pushMoment],
  )
  useEffect(() => {
    const stop = store.onEvent((event, view, seat) => {
      lastEvent.current = event.n
      held.take(game.present(event, view, seat), view.phase.kind)
    })
    return () => {
      stop()
      held.clear()
    }
  }, [store, held, game])
  // A reconnect can land in a new phase with no event to say so.
  const phase = client.view?.phase.kind
  useEffect(() => {
    if (phase) held.moved(phase)
  }, [held, phase])
  useEffect(() => {
    if (!celebrate) return
    const timer = setTimeout(() => setCelebrate(null), CELEBRATION_MS)
    return () => clearTimeout(timer)
  }, [celebrate])
  // At the table, in play and seated, back asks before leaving, as the menu's Leave game does.
  const [askLeave, setAskLeave] = useState(false)
  const seated = client.view?.seat != null
  useBackGuard(seated && phase !== undefined && phase !== 'lobby' && phase !== 'gameOver', () => setAskLeave(true))
  useEffect(() => {
    if (!client.rejection) return
    setToast({ text: rejectionText(client.rejection.reason, game.rejections), id: -client.rejection.id })
    store.clearRejection()
  }, [client.rejection, store, game])

  const closed = client.connection === 'replaced' || client.connection === 'full' ? CLOSED[client.connection] : null
  if (!client.view) {
    return (
      <main className="h-full flex flex-col items-center p-4">
        <header className="w-full max-w-sm mt-2">
          <button className="btn btn-quiet btn-small" onClick={() => navigate(gamePath(game.id))}>
            Leave
          </button>
        </header>
        {closed ? (
          <div className="my-auto flex flex-col items-center gap-4 text-center">
            <p>{closed.text}</p>
            <button className="btn" onClick={reconnect}>
              {closed.retry}
            </button>
          </div>
        ) : (
          <p className="display text-xl turn-marker my-auto text-center">Connecting to game {room}</p>
        )}
      </main>
    )
  }
  return (
    <>
      {client.connection !== 'open' && (
        <p
          className="fixed top-[var(--update-h,0px)] inset-x-0 z-50 bg-danger flex items-center justify-center gap-3 text-center py-1 px-2"
          style={{ color: 'var(--on-danger)' }}
          role="status"
        >
          {closed ? closed.text : 'Connection lost: reconnecting'}
          {closed && (
            <button className="btn btn-small shrink-0 whitespace-nowrap" onClick={reconnect}>
              {closed.retry}
            </button>
          )}
        </p>
      )}
      {client.error && (
        <p className="fixed bottom-0 inset-x-0 z-50 bg-danger text-center py-1" style={{ color: 'var(--on-danger)' }} role="alert">
          <SuitText text={client.error} />
        </p>
      )}
      {client.view.phase.kind === 'lobby' ? <Lobby view={client.view} room={room} /> : <game.Table view={client.view} room={room} />}
      <TalkLayer seat={client.view.seat} />
      {askLeave && (
        <Sheet title="Leave this game?" onClose={() => setAskLeave(false)}>
          <LeaveQuestion onStay={() => setAskLeave(false)} />
        </Sheet>
      )}
      <MomentOverlay moment={moments.current} />
      {celebrate && <Celebration key={celebrate.id} colour={celebrate.colour} />}
      {toast && (
        <p key={toast.id} className="panel toast" role="status">
          <SuitText text={toast.text} />
        </p>
      )}
    </>
  )
}

interface BoundaryProps {
  /** Where "Leave" goes. */
  home: string
  title?: string
  body?: string
  leave?: string
  children: ReactNode
}

/** Replaces a blank screen with a way out if rendering, or loading a game, ever throws. */
export class ErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error(error)
  }
  render() {
    if (!this.state.failed) return this.props.children
    const {
      home,
      title = 'The table has stopped',
      body = 'Your seat and cards are safe. Reload to pick up where you left off.',
      leave = 'Leave game',
    } = this.props
    return (
      <main className="h-full grid place-items-center p-6">
        <section className="panel p-4 max-w-sm grid gap-3">
          <h1 className="display text-xl">{title}</h1>
          <p>{body}</p>
          <button className="btn btn-primary" onClick={() => location.reload()}>
            Reload
          </button>
          <button className="btn" onClick={() => navigate(home)}>
            {leave}
          </button>
        </section>
      </main>
    )
  }
}

/** A room of the game whose address this is. */
export function GameScreen({ room }: { room: string }) {
  const game = useGameClient()
  return (
    <ErrorBoundary home={gamePath(game.id)}>
      <SessionProvider room={room} key={room}>
        <Screen room={room} />
      </SessionProvider>
    </ErrorBoundary>
  )
}
