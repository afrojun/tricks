import { Component, type ReactNode, useEffect, useState } from 'react'
import type { Seat, View } from '../engine'
import type { NumberedEvent } from '../protocol'
import { Lobby } from './Lobby'
import { Table } from './Table'
import { SessionProvider, navigate, useClient, useSession } from './session'
import { playSound } from './sound'
import { SUIT_NAME, rejectionText, seatName } from './text'

/** Turns one game event into a sound and, where it helps, a line of text. */
function present(event: NumberedEvent, view: View, seat: Seat | null): string | null {
  const name = (s: Seat) => (s === seat ? 'You' : seatName(view, s))
  const verb = (s: Seat, you: string, they: string) => (s === seat ? you : they)
  switch (event.type) {
    case 'dealt':
      playSound('deal')
      return event.half === 2 ? 'Second half: six new cards each.' : null
    case 'called':
      playSound('call')
      return `${name(event.seat)} ${verb(event.seat, 'call', 'calls')} ${event.amount}.`
    case 'trumpChosen':
      return `${name(event.seat)} ${verb(event.seat, 'have', 'has')} chosen trump${event.lastCard ? ' by last card' : ''}.`
    case 'dealCancelled':
      return 'The counting side holds no trump. Dealing again.'
    case 'thuneeCalled':
      playSound('call')
      return `${name(event.seat)} ${verb(event.seat, 'call', 'calls')} Thunee.`
    case 'trumpRevealed':
      return `Trump is ${SUIT_NAME[event.suit]}.`
    case 'cardPlayed':
      playSound('cardPlay')
      return null
    case 'trickWon':
      if (seat !== null && event.seat % 2 === seat % 2) playSound('trickWin')
      return null
    case 'jodhiClaimed':
      playSound('call')
      return `${name(event.seat)} ${verb(event.seat, 'call', 'calls')} Jodhi, ${event.points}.`
    case 'doubleCalled':
      playSound('call')
      return `${name(event.seat)} ${verb(event.seat, 'call', 'calls')} Double.`
    case 'khanaakCalled':
      playSound('call')
      return `${name(event.seat)} ${verb(event.seat, 'call', 'calls')} Khanaak.`
    case 'challengeResolved':
      playSound('challenge')
      return `${name(event.challenger)} ${verb(event.challenger, 'challenge', 'challenges')} ${seatName(view, event.accused)}.`
    case 'roundScored':
      playSound('ball')
      return null
    case 'gameOver':
      playSound('gameOver')
      return null
    default:
      return null
  }
}

function Screen({ room }: { room: string }) {
  const { store } = useSession()
  const client = useClient()
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null)

  useEffect(
    () =>
      store.onEvent((event, view, seat) => {
        const text = present(event, view, seat)
        if (text) setToast({ text, id: event.n })
      }),
    [store],
  )
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
      {client.view.phase.kind === 'lobby' ? <Lobby view={client.view} room={room} /> : <Table view={client.view} room={room} />}
      {toast && (
        <p key={toast.id} className="panel toast" role="status">
          {toast.text}
        </p>
      )}
    </>
  )
}

/** Replaces a blank screen with a way out if rendering ever throws. */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
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
          <button className="btn" onClick={() => navigate('/')}>
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
