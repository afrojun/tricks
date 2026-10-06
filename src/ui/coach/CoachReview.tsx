import { useState } from 'react'
import type { Card } from '../../kit/cards'
import type { ShellView } from '../contract'
import { type DealShown, HandsSheet } from './CoachSheets'
import { useCoach } from './context'

/** In practice, the coach's look back at the round, under the score. A round with nothing to point out says so. */
export function CoachReview<C extends Card>({ view, shown }: { view: ShellView; shown: DealShown<C> }) {
  const coached = useCoach()
  const [hands, setHands] = useState(false)
  const notes = coached?.state.review
  if (!coached || !notes) return null
  // The deals of the game whose screens these are: the practice screen provides only that game's coach.
  const dealt = coached.state.dealt as C[][][] | null
  return (
    <section className="grid gap-2 border-t border-line/40 pt-3">
      <h3 className="display text-lg">Coach’s review</h3>
      {notes.length === 0 ? (
        <p>Nothing to point out this round.</p>
      ) : (
        <ul className="grid gap-2">
          {notes.map((n, i) => (
            <li key={`${i}-${n.title}`} className={n.tone === 'warn' ? 'text-danger' : ''}>
              <strong>{n.title}.</strong> {n.body}
            </li>
          ))}
        </ul>
      )}
      {dealt && dealt.length > 0 && (
        <button className="btn btn-small justify-self-start" onClick={() => setHands(true)}>
          See all hands
        </button>
      )}
      {hands && dealt && <HandsSheet view={view} dealt={dealt} shown={shown} onClose={() => setHands(false)} />}
    </section>
  )
}
