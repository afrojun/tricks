import { type ReactNode, useState } from 'react'
import { replaceableSeats } from '../kit/table'
import { useCoach } from './coach/context'
import type { ShellView } from './contract'
import { gamePath } from './routes'
import { navigate, useGameClient, useSession } from './session'
import { isMuted, setMuted } from './sound'
import { seatName } from './text'
import { ThemePicker } from './ThemePicker'

/**
 * The menu every table has. The game's own lines come first and its buttons share a row with
 * the sound; then the look, the computer standing in for anyone who is away (never in practice),
 * and the way out.
 */
export function GameMenu({ view, intro, actions }: { view: ShellView; intro: ReactNode; actions: ReactNode }) {
  const { send, store } = useSession()
  const game = useGameClient()
  const [muted, setMutedState] = useState(isMuted)
  const coached = useCoach()
  const replaceable = coached ? [] : replaceableSeats(view, store.serverNow(Date.now()))
  return (
    <div className="grid gap-4">
      {intro}
      <div className="flex flex-wrap gap-2">
        {actions}
        <button
          className="btn btn-small"
          aria-pressed={!muted}
          onClick={() => {
            setMuted(!muted)
            setMutedState(!muted)
          }}
        >
          Sound {muted ? 'off' : 'on'}
        </button>
      </div>
      <ThemePicker />
      {replaceable.length > 0 && (
        <div className="grid gap-2">
          <p>Let the computer play for someone who is away. They take the seat back when they return.</p>
          {replaceable.map((seat) => (
            <button key={seat} className="btn btn-small" onClick={() => send({ type: 'replaceWithAi', seat })}>
              Computer plays for {seatName(view, seat)}
            </button>
          ))}
        </div>
      )}
      <button className="btn btn-danger" onClick={() => navigate(gamePath(game.id))}>
        Leave game
      </button>
    </div>
  )
}
