import type { TableSettings } from '../kit/table'
import type { ShellView } from './contract'
import { PACES, defaultTimers, rememberSettings } from './tableSettings'
import { NotifyOffer } from './Notify'
import { NumberRule } from './Rules'
import { useGameClient, useSession } from './session'
import { plural } from './text'

/**
 * How the table is run: its pace, and the game's time limits while it plays together. The host
 * chooses, in the lobby and from the menu during play, and the device keeps the choice for their
 * next game; everyone else reads what was chosen. Not a house rule: no preset or share link holds it.
 */
export function PaceControls({ view }: { view: ShellView }) {
  const game = useGameClient()
  const { send } = useSession()
  const settings = view.settings
  const isHost = view.seat !== null && view.host === view.seat
  const chosen = PACES.find((p) => p.value === settings.pace) ?? PACES[0]
  const timed = settings.timers !== null
  const set = (next: TableSettings) => {
    send({ type: 'setSettings', settings: next })
    rememberSettings(game.id, next)
  }

  // Over days the table is played away from it: everyone seated is offered notifications.
  const offer = settings.pace === 'async' && view.seat !== null && <NotifyOffer />
  if (!isHost) {
    return (
      <div className="grid gap-1">
        <p>
          <b>{chosen.label}</b>: {chosen.text}
        </p>
        {offer}
        {game.timers.length > 0 &&
          settings.pace === 'live' &&
          (timed ? (
            game.timers.map((t) => (
              <p key={t.id} className="text-sm text-on-surface-muted">
                {t.label}: {plural(settings.timers?.[t.id] ?? t.spec.default, 'second')}
              </p>
            ))
          ) : (
            <p className="text-sm text-on-surface-muted">No time limits</p>
          ))}
      </div>
    )
  }
  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <div className="flex gap-2">
          {PACES.map((pace) => (
            <button
              key={pace.value}
              className="btn btn-small flex-1"
              aria-pressed={pace.value === settings.pace}
              onClick={() => pace.value !== settings.pace && set({ ...settings, pace: pace.value })}
            >
              {pace.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-on-surface-muted">{chosen.text}</p>
      </div>
      {offer}
      {game.timers.length > 0 &&
        (settings.pace === 'async' ? (
          <p className="text-sm text-on-surface-muted">No time limits over days.</p>
        ) : (
          <div className="grid gap-2">
            {/* A switch, as the menu's settings are. */}
            <button
              className="flex items-center justify-between gap-2 text-left"
              role="switch"
              aria-checked={timed}
              onClick={() => set({ ...settings, timers: timed ? null : defaultTimers(game.timers) })}
            >
              Time limits
              <span className="switch" data-on={timed} aria-hidden />
            </button>
            {settings.timers !== null &&
              game.timers.map((t) => (
                <div key={t.id} className="grid gap-1">
                  <span>{t.label}</span>
                  <NumberRule<Record<string, number>>
                    key={settings.timers?.[t.id]}
                    info={{ key: t.id, label: t.label, range: { min: t.spec.min, max: t.spec.max, unit: 'seconds' } }}
                    value={settings.timers?.[t.id] ?? t.spec.default}
                    onChange={(patch) => set({ ...settings, timers: { ...defaultTimers(game.timers), ...settings.timers, ...patch } as Record<string, number> })}
                  />
                </div>
              ))}
          </div>
        ))}
    </div>
  )
}
