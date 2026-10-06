import { type ReactNode, useEffect } from 'react'
import type { Seat } from '../kit/table'
import { CardBack } from './Card'
import type { ShellView } from './contract'
import { personaLabel } from './personas'
import { type Where, place } from './seats'
import { useGameClient, useSession } from './session'
import { playSound } from './sound'

/** Where a seat sits on screen relative to the viewer, who is always at the bottom; a spectator sees from seat 0. */
export function usePosition(view: ShellView): (seat: Seat) => Where {
  const { direction } = useGameClient()
  return (seat) => place(seat, view.seat ?? 0, view.playerCount, direction)
}

/** A sound and a short buzz when it becomes the player's turn. */
export function useTurnAlert(myTurn: boolean): void {
  useEffect(() => {
    if (!myTurn) return
    playSound('yourTurn')
    navigator.vibrate?.(30)
  }, [myTurn])
}

interface SeatBadgeProps {
  view: ShellView
  seat: Seat
  /** A seat at the left or right edge stacks its cards upright. */
  side?: 'left' | 'right'
  /** Whether the table is waiting on this seat. */
  turn: boolean
  /** Cards held, shown face down. */
  count: number
  /** The game's own lines for this seat, under its name. */
  children?: ReactNode
}

/** Another player at the table: name, persona, the game's lines, whether they are away, and their cards face down. */
export function SeatBadge({ view, seat, side, turn, count, children }: SeatBadgeProps) {
  const info = view.seats[seat]
  const away = info.kind === 'human' && !info.connected
  const persona = personaLabel(info, view.rules.allowCheating)
  return (
    <div className="flex flex-col items-center gap-1 max-w-24" data-side={side}>
      <p className="seat-name truncate max-w-full text-sm" data-turn={turn}>
        {info.name}
      </p>
      {persona && <p className="text-xs text-muted">{persona}</p>}
      {children}
      {(away || info.standIn) && <p className="text-xs text-muted">{info.standIn ? 'computer playing' : 'disconnected'}</p>}
      <div className={`flex ${side ? 'flex-col -space-y-7' : '-space-x-3'}`}>
        {Array.from({ length: count }, (_, i) => (
          <span key={i} className="card-in" style={{ animationDelay: `${i * 60}ms` }}>
            <CardBack />
          </span>
        ))}
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
