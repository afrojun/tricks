import { useState } from 'react'
import type { View } from '../../engine'
import { HandsSheet } from './CoachSheets'
import { useCoach } from '../../../../ui/coach/context'

/** In practice, the coach's look back at the round, under the score. */
export function CoachReview({ view }: { view: View }) {
  const coached = useCoach()
  const [hands, setHands] = useState(false)
  const notes = coached?.state.review
  if (!coached || !notes) return null
  const dealt = coached.state.dealt
  return (
    <section className="grid gap-2 border-t border-line/40 pt-3">
      <h3 className="display text-lg">Coach’s review</h3>
      <ul className="grid gap-2">
        {notes.map((n, i) => (
          <li key={`${i}-${n.title}`} className={n.tone === 'warn' ? 'text-danger' : ''}>
            <strong>{n.title}.</strong> {n.body}
          </li>
        ))}
      </ul>
      {dealt && dealt.length > 0 && (
        <button className="btn btn-small justify-self-start" onClick={() => setHands(true)}>
          See all hands
        </button>
      )}
      {hands && dealt && <HandsSheet view={view} dealt={dealt} onClose={() => setHands(false)} />}
    </section>
  )
}
