import { Component, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import type { Seat, Team, View } from '../engine'
import type { NumberedEvent } from '../protocol'
import { Lobby } from './Lobby'
import { Celebration, type Moment, MomentOverlay, useMoments } from './Moments'
import { BALL_STAGGER_MS, type BallBurst, Table } from './Table'
import { SessionProvider, navigate, useClient, useSession } from './session'
import { playSound } from './sound'
import { SUIT_NAME, rejectionText, seatName } from './text'

const CHALLENGE_BEAT_MS = 1000
const VERDICT_BEAT_MS = 1300

interface Presentation {
  toast?: string
  moments?: Moment[]
}

/** Turns one game event into a sound and, where it helps, a toast or a moment in the middle of the table. */
function present(event: NumberedEvent, view: View, seat: Seat | null): Presentation {
  const name = (s: Seat) => (s === seat ? 'You' : seatName(view, s))
  const verb = (s: Seat, you: string, they: string) => (s === seat ? you : they)
  const call = (s: Seat, what: string, detail?: string, ms = 1500): Presentation => {
    playSound('call')
    return { moments: [{ title: what, detail: detail ?? `${name(s)} ${verb(s, 'call', 'calls')} it`, tone: 'call', ms }] }
  }
  switch (event.type) {
    case 'dealt':
      playSound('deal')
      return event.half === 2 ? { toast: 'Second half: six new cards each.' } : {}
    case 'called':
      playSound('call')
      return { toast: `${name(event.seat)} ${verb(event.seat, 'call', 'calls')} ${event.amount}.` }
    case 'trumpChosen':
      return { toast: `${name(event.seat)} ${verb(event.seat, 'have', 'has')} chosen trump${event.lastCard ? ' by last card' : ''}.` }
    case 'dealCancelled':
      return { toast: 'The counting side holds no trump. Dealing again.' }
    case 'trumpRevealed':
      return { toast: `Trump is ${SUIT_NAME[event.suit]}.` }
    case 'cardPlayed':
      playSound('cardPlay')
      return {}
    case 'trickWon':
      if (seat !== null && event.seat % 2 === seat % 2) playSound('trickWin')
      return {}
    case 'thuneeCalled':
      return call(event.seat, 'Thunee', undefined, 1700)
    case 'doubleCalled':
      return call(event.seat, 'Double')
    case 'khanaakCalled':
      return call(event.seat, 'Khanaak')
    case 'jodhiClaimed':
      return call(
        event.seat,
        `Jodhi ${event.points}`,
        `${name(event.seat)} ${verb(event.seat, 'hold', 'holds')} King and Queen${event.withJack ? ' with the Jack' : ''} of ${SUIT_NAME[event.suit]}`,
        1300,
      )
    case 'challengeResolved':
      playSound('challenge')
      return {
        moments: [{ title: 'Challenge', detail: `${name(event.challenger)} ${verb(event.challenger, 'challenge', 'challenges')} ${seatName(view, event.accused)}`, tone: 'danger', ms: CHALLENGE_BEAT_MS }],
      }
    case 'roundScored': {
      const c = event.summary.challenge
      if (!c) return {}
      const accused = seatName(view, c.accused)
      const what = c.kind === 'play' ? 'followed suit' : `held the Jodhi in ${SUIT_NAME[c.suit!]}`
      return {
        moments: [
          c.guilty
            ? { title: 'Caught', detail: `${accused} ${c.kind === 'play' ? 'did not follow suit' : 'called a false Jodhi'}`, tone: 'danger', ms: VERDICT_BEAT_MS, card: c.card }
            : { title: 'Fair play', detail: `${accused} ${what}`, tone: 'good', ms: VERDICT_BEAT_MS, card: c.card },
        ],
      }
    }
    case 'gameOver':
      playSound('gameOver')
      return {}
    default:
      return {}
  }
}

function Screen({ room }: { room: string }) {
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
