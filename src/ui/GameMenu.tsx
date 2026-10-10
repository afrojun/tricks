import { type ReactNode, useEffect, useRef, useState } from 'react'
import { replaceableSeats } from '../kit/table'
import { useCoach } from './coach/context'
import type { ShellView } from './contract'
import { gamePath } from './routes'
import { navigate, useGameClient, useSession } from './session'
import { setShowsPlayable, setTalksOn, useShowsPlayable, useTalksOn } from './prefs'
import { isMuted, setMuted } from './sound'
import { seatName } from './text'
import { ThemePicker } from './ThemePicker'

/** A line of the menu that opens something or does something: "Rules in this game", "Last trick". */
export interface MenuRow {
  label: string
  onClick: () => void
}

/**
 * The menu every table has, in sections: this game (the game's own `summary` and `rows`), settings
 * (sound, reactions, the playable cards) as switches, the look as swatches, the computer standing in for anyone who is away (never in
 * practice), and the way out, which asks first.
 */
export function GameMenu({ view, summary, rows }: { view: ShellView; summary: string; rows: MenuRow[] }) {
  const { send, store } = useSession()
  const game = useGameClient()
  const [muted, setMutedState] = useState(isMuted)
  const marksPlayable = useShowsPlayable()
  const reactions = useTalksOn()
  const coached = useCoach()
  const [leaving, setLeaving] = useState<boolean | null>(null)
  const leave = useRef<HTMLButtonElement>(null)
  // Staying puts the focus back on Leave game, where it was before the question.
  useEffect(() => {
    if (leaving === false) leave.current?.focus()
  }, [leaving])
  const replaceable = coached ? [] : replaceableSeats(view, store.serverNow(Date.now()))
  return (
    <div className="grid gap-1">
      <MenuSection title="This game">
        <p className="text-on-surface-muted mb-2">{summary}</p>
        <div className="menu-group">
          {rows.map((row) => (
            <button key={row.label} className="menu-row" onClick={row.onClick}>
              {row.label}
              <span className="menu-chevron" aria-hidden>
                ›
              </span>
            </button>
          ))}
        </div>
      </MenuSection>
      <MenuSection title="Settings">
        <div className="menu-group">
          <Switch
            label="Sound"
            on={!muted}
            onChange={(on) => {
              setMuted(!on)
              setMutedState(!on)
            }}
          />
          <Switch label="Reactions" on={reactions} onChange={setTalksOn} />
          <Switch label="Highlight playable cards" on={marksPlayable} onChange={setShowsPlayable} />
        </div>
      </MenuSection>
      <MenuSection title="Look">
        <ThemePicker />
      </MenuSection>
      {replaceable.length > 0 && (
        <MenuSection title="Away">
          <p className="mb-2">Let the computer play for someone who is away. They take the seat back when they return.</p>
          <div className="menu-group">
            {replaceable.map((seat) => (
              <button key={seat} className="menu-row" onClick={() => send({ type: 'replaceWithAi', seat })}>
                Computer plays for {seatName(view, seat)}
              </button>
            ))}
          </div>
        </MenuSection>
      )}
      <hr className="menu-rule" />
      {leaving ? (
        <div className="panel panel-danger p-3 grid gap-3" role="group" aria-label="Leave this game?">
          <div>
            <b>Leave this game?</b>
            <p className="text-on-surface-muted">
              {coached
                ? 'Your practice game is saved on this device, so you can carry on later.'
                : 'Your seat is kept: open this game’s link again to sit back down. While you are away, the host can let a computer play for you.'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-danger" onClick={() => navigate(gamePath(game.id))}>
              Leave
            </button>
            <button className="btn" onClick={() => setLeaving(false)} autoFocus>
              Stay
            </button>
          </div>
        </div>
      ) : (
        <button ref={leave} className="btn btn-quiet menu-leave" onClick={() => setLeaving(true)}>
          Leave game
        </button>
      )}
    </div>
  )
}

function MenuSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid">
      <h3 className="eyebrow mt-3 mb-1.5">{title}</h3>
      {children}
    </section>
  )
}

/** A setting that is on or off, shown as a switch: the row says what it is, the switch how it is. */
function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button className="menu-row" role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      {label}
      <span className="switch" data-on={on} aria-hidden />
    </button>
  )
}
