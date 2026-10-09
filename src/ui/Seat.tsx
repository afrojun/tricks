import type { ReactNode } from 'react'
import type { Seat } from '../kit/table'
import { CardBack } from './Card'
import type { ShellView } from './contract'
import { personaLabel } from './personas'
import { type Where, place } from './seats'
import { useGameClient, useSession } from './session'
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
export function SeatBadge({ view, seat, side, turn, count, tags, said = [], children }: SeatBadgeProps) {
  const info = view.seats[seat]
  const away = info.kind === 'human' && !info.connected
  const persona = personaLabel(info, view.rules.allowCheating)
  const talk = useSaidAt(seat)
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
          {persona && <span className="text-xs text-muted">{persona}</span>}
          {tags}
          <MutedTag seat={seat} />
        </div>
        {children}
        {(away || info.standIn) && <p className="text-xs text-muted">{info.standIn ? 'computer playing' : 'disconnected'}</p>}
        <div className="seat-stack">
          {Array.from({ length: count }, (_, i) => (
            <span key={i} className="card-in" style={{ animationDelay: `${i * 60}ms` }}>
              <CardBack />
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Shown while the computer stands in for this player: one tap takes the seat back. */
export function TakeOver() {
  const { send } = useSession()
  return (
    <div className="flex items-center justify-center gap-2 px-3 pb-1" role="status">
      <span>The computer is playing for you.</span>
      <button className="btn btn-primary btn-small" onClick={() => send({ type: 'reclaimSeat' })}>
        Take over
      </button>
    </div>
  )
}
