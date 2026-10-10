import { useState } from 'react'
import type { Card } from '../../kit/cards'
import type { ShellView } from '../contract'
import { type DealShown, HandsSheet } from './CoachSheets'
import { SuitText } from '../SuitText'
import { useCoach } from './context'

/**
 * In practice, the coach's look back at the round, folded under the score: its row counts the moments
 * worth a look. A round with nothing to point out says so.
 */
export function CoachReview<C extends Card>({ view, shown }: { view: ShellView; shown: DealShown<C> }) {
  const coached = useCoach()
  const [open, setOpen] = useState(false)
  const [hands, setHands] = useState(false)
  const notes = coached?.state.review
  if (!coached || !notes) return null
  // The deals of the game whose screens these are: the practice screen provides only that game's coach.
  const dealt = coached.state.dealt as C[][][] | null
  const moments = notes.filter((n) => n.tone !== 'info').length
  return (
    <section className="grid">
      <button className="review-row" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>Coach’s review{moments > 0 ? ` · ${moments}` : ''}</span>
        <span className="menu-chevron" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div className="review-body grid gap-2">
          {notes.length === 0 ? (
            <p>Nothing to point out this round.</p>
          ) : (
            <ul className="grid gap-2">
              {notes.map((n, i) => (
                <li key={`${i}-${n.title}`} className={n.tone === 'warn' ? 'text-danger' : ''}>
                  <strong><SuitText text={n.title} />.</strong> <SuitText text={n.body} />
                </li>
              ))}
            </ul>
          )}
          {dealt && dealt.length > 0 && (
            <button className="btn btn-small justify-self-start" onClick={() => setHands(true)}>
              See all hands
            </button>
          )}
        </div>
      )}
      {hands && dealt && <HandsSheet view={view} dealt={dealt} shown={shown} onClose={() => setHands(false)} />}
    </section>
  )
}
