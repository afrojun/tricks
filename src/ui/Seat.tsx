import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { Seat } from '../kit/table'
import { CardBack } from './Card'
import type { ShellView } from './contract'
import { personaLabel } from './personas'
import { type Where, place } from './seats'
import { useClient, useGameClient, useSession } from './session'
import { useSaidAt } from './talk/hooks'
import { MutedTag, NamePill } from './talk/NameMenu'
import { TalkSaid } from './talk/Said'

/** Where a seat sits on screen relative to the viewer, who is always at the bottom; a spectator sees from seat 0. */
export function usePosition(view: ShellView): (seat: Seat) => Where {
  const { direction } = useGameClient()
  return (seat) => place(seat, view.seat ?? 0, view.playerCount, direction)
}

interface SeatBadgeProps {
  view: ShellView
  seat: Seat
  /** A seat at the left or right edge: it stacks its cards upright, and its name holds still (see `.seat[data-side]`). */
  side?: 'left' | 'right'
  /** Whether the table is waiting on this seat. */
  turn: boolean
  /** Whether this seat is choosing a card from its hand, to play or to pass: a card it lifts rises from the fan. */
  choosing?: boolean
  /** Cards held, shown face down. */
  count: number
  /** Small tags beside the persona, such as the dealer or ready: their row is always there, so one appearing moves nothing. */
  tags?: ReactNode
  /** What this seat has called out loud, as speech bubbles hanging from the name: they take no room. Table talk shows beside them. */
  said?: readonly string[]
  /** The game's own lines for this seat, under the tags: they should keep their size through a round. */
  children?: ReactNode
}

/**
 * Another player at the table: name, persona and tags, the game's lines, whether they are away, and
 * their cards face down. Nothing that comes and goes during a round takes room above the name or
 * beside it, so the table does not jump as calls are made and cards are played. The name opens the
 * menu of what may be thrown at them.
 */
export function SeatBadge({ view, seat, side, turn, choosing = false, count, tags, said = [], children }: SeatBadgeProps) {
  const info = view.seats[seat]
  const away = info.kind === 'human' && !info.connected
  const persona = personaLabel(info, view.rules.allowCheating)
  const talk = useSaidAt(seat)
  // A computer standing in for someone who has gone still lifts its cards.
  const lifted = useLifted(view, seat, choosing && (!away || info.standIn))
  return (
    <div className="seat" data-side={side}>
      <div className="seat-head">
        <NamePill view={view} seat={seat} turn={turn} />
        {(said.length > 0 || talk) && (
          <div className="seat-said">
            {said.map((text) => (
              <p key={text} className="bubble">
                {text}
              </p>
            ))}
            {talk && <TalkSaid key={talk.key} showing={talk} />}
          </div>
        )}
      </div>
      <div className="seat-body">
        <div className="seat-tags">
          {/* A computer is named as a person is: this says what it is, with its persona when the game shows one (“Sharp computer”). */}
          {info.kind === 'ai' && <span className="text-xs text-muted">{persona ? `${persona} computer` : 'Computer'}</span>}
          {tags}
          <MutedTag seat={seat} />
        </div>
        {children}
        {/* Over days everyone is away most of the time: only a computer playing for someone is worth saying. */}
        {(info.standIn || (away && view.settings.pace !== 'async')) && <p className="text-xs text-muted">{info.standIn ? 'Computer playing' : 'Away'}</p>}
        <Fan seat={seat} count={count} turn={turn} lifted={lifted} />
      </div>
    </div>
  )
}

/**
 * The cards another player holds, face down, fanned toward the middle of the table as a hand is
 * held. It closes up as cards leave it, comes forward a little on its holder's turn, and the card
 * they lift rises out of it. Which card rises changes from trick to trick; nothing is told by it.
 */
function Fan({ seat, count, turn, lifted }: { seat: Seat; count: number; turn: boolean; lifted: boolean }) {
  const rising = lifted && count > 0 ? (seat * 5 + count * 3) % count : -1
  return (
    <div className="seat-fan" data-hand-of={seat}>
      <div className="fan" data-turn={turn} style={{ '--n': count } as React.CSSProperties}>
        {Array.from({ length: count }, (_, i) => (
          <span key={i} className="fan-card" data-lifted={i === rising} style={{ '--i': i } as React.CSSProperties}>
            <span className="card-in" style={{ animationDelay: `${i * 60}ms` }}>
              <CardBack />
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** A computer lifts a card this long after its turn starts, as if it had looked over its hand. */
const COMPUTER_LIFTS_AFTER_MS = 300
/** A person's lifted card stays up at least this long, so a quick tap is still seen. */
const SHOWN_AT_LEAST_MS = 600

/**
 * Whether a card is lifted in this seat's hand: only while it is choosing one. A person's comes
 * from what their device says; a computer, or the computer standing in for someone, lifts one a
 * moment into its turn.
 */
function useLifted(view: ShellView, seat: Seat, choosing: boolean): boolean {
  const { lifted } = useClient()
  const info = view.seats[seat]
  const computer = info.kind === 'ai' || info.standIn
  const said = !computer && lifted.includes(seat)
  const [up, setUp] = useState(false)
  const since = useRef(0)
  useEffect(() => {
    if (computer) {
      setUp(false)
      if (!choosing) return
      const timer = setTimeout(() => setUp(true), COMPUTER_LIFTS_AFTER_MS)
      return () => clearTimeout(timer)
    }
    if (said) {
      since.current = Date.now()
      setUp(true)
      return
    }
    const timer = setTimeout(() => setUp(false), Math.max(0, since.current + SHOWN_AT_LEAST_MS - Date.now()))
    return () => clearTimeout(timer)
  }, [computer, choosing, said])
  return choosing && up
}

/** Shown while the computer stands in for this player: one tap takes the seat back. */
export function TakeOver() {
  const { send } = useSession()
  return (
    <div className="flex items-center justify-center gap-2 px-3 pb-1" role="status">
      <span>The computer is playing for you.</span>
      <button className="btn btn-primary btn-small" onClick={() => send({ type: 'reclaimSeat' })}>
        Sit back down
      </button>
    </div>
  )
}
