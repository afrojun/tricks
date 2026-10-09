import { useEffect, useRef, useState } from 'react'
import type { Say } from '../../kit/talk'
import type { Seat } from '../../kit/table'
import type { ShellView } from '../contract'
import { useTalksOn } from '../prefs'
import { seatName } from '../text'
import { useBudget } from './budget'
import { menuChoices, sayKey } from './choices'
import { useDialogFocus } from './dismiss'
import { FLIGHT_MS, type MenuPlace, menuPlace, reducedMotion } from './flight'
import { useHeard, useMutes, useSay } from './hooks'
import { useMuted } from './mute'
import { Sticker } from './Sticker'
import { LINE_TEXT, STICKER_NAME } from './words'

interface NamePillProps {
  view: ShellView
  seat: Seat
  /** Whether the table waits on this seat: the pill turns yellow and pulses, and the seat may be nudged. */
  turn: boolean
  /** At game over the menu offers only the kind things. */
  over?: boolean
}

/**
 * A player's name on its ink pill. Another player's is a button that opens a menu hanging from it:
 * what may be thrown at them, and Mute. The viewer's own is only a name. A throw that lands on it
 * shakes it. The parent is the menu's positioned box (`.seat-head`, `.again-name`), and
 * `data-seat-name` is where throws aim.
 */
export function NamePill({ view, seat, turn, over = false }: NamePillProps) {
  const [place, setPlace] = useState<MenuPlace | null>(null)
  useHit(seat)
  const name = seatName(view, seat)
  const pill = 'seat-name truncate max-w-full text-sm'
  if (seat === view.seat)
    return (
      <span className={pill} data-turn={turn} data-seat-name={seat}>
        {name}
      </span>
    )
  return (
    <>
      <button
        type="button"
        className={pill}
        data-turn={turn}
        data-seat-name={seat}
        aria-haspopup="dialog"
        aria-expanded={place !== null}
        onClick={(e) => setPlace(place === null ? menuPlace(e.currentTarget.getBoundingClientRect(), innerWidth) : null)}
      >
        {name}
      </button>
      {place && (
        <NameMenu
          view={view}
          seat={seat}
          waitedOn={turn || view.waiting.some((w) => w.seat === seat)}
          over={over}
          place={place}
          onClose={() => setPlace(null)}
        />
      )}
    </>
  )
}

/** Shakes the name as a throw lands on it; a tomato squashes it too. Nothing moves for reduced motion. */
function useHit(seat: Seat): void {
  const hits = useHeard().filter((s) => s.say.kind === 'throw' && s.say.at === seat)
  const hit = hits[hits.length - 1]
  const key = hit?.key
  const tomato = hit?.say.kind === 'throw' && hit.say.id === 'tomato'
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(`[data-seat-name="${seat}"]`)
    if (key === undefined || !el?.animate || reducedMotion()) return
    const shake = el.animate([{ rotate: '0deg' }, { rotate: '-7deg' }, { rotate: '6deg' }, { rotate: '-4deg' }, { rotate: '2deg' }, { rotate: '0deg' }], {
      duration: 600,
      delay: FLIGHT_MS,
      easing: 'ease-out',
    })
    const squash = tomato ? el.animate([{ scale: '1' }, { scale: '1.1 0.92' }, { scale: '0.96 1.05' }, { scale: '1' }], { duration: 500, delay: FLIGHT_MS }) : null
    return () => {
      shake.cancel()
      squash?.cancel()
    }
  }, [seat, key, tomato])
}

interface NameMenuProps {
  view: ShellView
  seat: Seat
  waitedOn: boolean
  over: boolean
  place: MenuPlace
  onClose: () => void
}

/** Paper on a yellow plate, popping from the name: the throws, or with reactions off only Mute. A tap outside only closes it. */
function NameMenu({ view, seat, waitedOn, over, place, onClose }: NameMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  useDialogFocus(ref, onClose)
  const reactions = useTalksOn()
  const mutes = useMutes()
  const muted = useMuted(mutes).has(seat)
  const say = useSay()
  const { cooling, last } = useBudget()
  const name = seatName(view, seat)
  const choices = menuChoices(view.seat, seat, { reactions, waitedOn, over })
  const pick = (said: Say) => {
    if (say(said)) onClose()
  }
  return (
    <>
      <div className="talk-catch" onClick={onClose} />
      <div ref={ref} className="talk-menu" data-place={place} role="dialog" aria-label={name}>
        {choices.length > 0 && (
          <div className="talk-menu-row">
            {choices.map(({ say: said, enabled }) => {
              const props = {
                type: 'button' as const,
                disabled: cooling || !enabled,
                'data-held': (cooling && last === sayKey(said)) || undefined,
                onClick: () => pick(said),
              }
              return said.kind === 'line' ? (
                <button key={sayKey(said)} className="talk-line" {...props}>
                  {LINE_TEXT[said.id]}
                </button>
              ) : (
                <button key={sayKey(said)} className="talk-sticker-button" aria-label={STICKER_NAME[said.id]} {...props}>
                  <Sticker id={said.id} />
                </button>
              )
            })}
          </div>
        )}
        <button
          type="button"
          className="talk-mute"
          onClick={() => {
            mutes.toggle(seat)
            onClose()
          }}
        >
          {muted ? `Unmute ${name}` : `Mute ${name}`}
        </button>
      </div>
    </>
  )
}

/** A quiet tag for a player muted here, in their tag row. */
export function MutedTag({ seat }: { seat: Seat }) {
  const muted = useMuted(useMutes()).has(seat)
  return muted ? <span className="role-badge talk-muted">Muted</span> : null
}
