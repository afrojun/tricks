import { type CSSProperties, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { EMOTES, LINES, type Say, TALK_BUDGET_MS } from '../../kit/talk'
import { useTalksOn } from '../prefs'
import { useClient } from '../session'
import { useBudget } from './budget'
import { sayKey } from './choices'
import { useDialogFocus } from './dismiss'
import { useSay } from './hooks'
import { Sticker, TalkGlyph } from './Sticker'
import { LINE_TEXT, STICKER_NAME } from './words'

/** How long the tray takes to close, its exit animation (`tray-down`). */
const CLOSE_MS = 160

/**
 * The round talk button a game places at the right end of its hint row: it opens the tray. Absent
 * for a spectator and with reactions off; dimmed while the budget runs.
 */
export function TalkButton() {
  const { view } = useClient()
  const on = useTalksOn()
  const { cooling } = useBudget()
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  if (!on || !view || view.seat === null) return null
  const close = () => {
    if (closing) return
    setClosing(true)
    setTimeout(() => {
      setOpen(false)
      setClosing(false)
    }, CLOSE_MS)
  }
  return (
    <>
      <button
        type="button"
        className="talk-button"
        aria-label="Table talk"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-open={open || undefined}
        data-cooling={(cooling && !open) || undefined}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <TalkGlyph />
      </button>
      {open && createPortal(<Tray closing={closing} onClose={close} />, document.body)}
    </>
  )
}

/**
 * The lines and emotes, on a paper strip over the hand. No backdrop: the table stays in view, and a
 * tap outside only closes it. While the budget runs every button waits, the last one said stays
 * pressed, and a line along the top draws back.
 */
function Tray({ closing, onClose }: { closing: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useDialogFocus(ref, onClose)
  const say = useSay()
  const { cooling, last, until } = useBudget()
  const left = Math.max(0, until - Date.now())
  const pick = (said: Say) => {
    if (say(said)) onClose()
  }
  const held = (said: Say) => (cooling && last === sayKey(said)) || undefined
  return (
    <>
      <div className="talk-catch" onClick={onClose} />
      <div ref={ref} className="talk-tray" role="dialog" aria-label="Table talk" data-closing={closing || undefined} data-cooling={cooling || undefined}>
        {cooling && (
          <i key={until} className="talk-cool" style={{ animationDuration: `${left}ms`, '--from': left / TALK_BUDGET_MS } as CSSProperties} aria-hidden />
        )}
        <div className="talk-lines">
          <span className="talk-label">Say</span>
          {LINES.map((id) => {
            const said: Say = { kind: 'line', id }
            return (
              <button key={id} type="button" className="talk-line" disabled={cooling} data-held={held(said)} onClick={() => pick(said)}>
                {LINE_TEXT[id]}
              </button>
            )
          })}
        </div>
        <div className="talk-emotes">
          {EMOTES.map((id) => {
            const said: Say = { kind: 'emote', id }
            return (
              <button
                key={id}
                type="button"
                className="talk-sticker-button"
                aria-label={STICKER_NAME[id]}
                disabled={cooling}
                data-held={held(said)}
                onClick={() => pick(said)}
              >
                <Sticker id={id} />
              </button>
            )
          })}
        </div>
        <button type="button" className="talk-close" onClick={onClose}>
          Close
        </button>
      </div>
    </>
  )
}
