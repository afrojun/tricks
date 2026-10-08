import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import type { Card } from '../kit/cards'
import { PlayingCard } from './Card'

/** A call, challenge, verdict or won game that deserves the middle of the screen for a moment. */
export interface Moment {
  title: string
  detail?: string
  /** A call floods the felt and spins it; danger turns it red; a win floods it with `colour`; good leaves it be. */
  tone: 'call' | 'danger' | 'good' | 'win'
  ms: number
  card?: Card
  /** For a win: the winner's colour, a theme token such as `var(--team0)`. */
  colour?: string
}

/** How long the confetti falls, from the first piece to the last. */
export const CELEBRATION_MS = 4800

/** Shows queued moments one at a time. */
export function useMoments() {
  const [queue, setQueue] = useState<(Moment & { id: number })[]>([])
  const current = queue[0] ?? null
  useEffect(() => {
    if (!current) return
    const timer = setTimeout(() => setQueue((q) => q.slice(1)), current.ms)
    return () => clearTimeout(timer)
  }, [current])
  const push = useCallback((moment: Moment) => setQueue((q) => [...q, { ...moment, id: Math.random() }]), [])
  return { current, push }
}

export function MomentOverlay({ moment }: { moment: (Moment & { id: number }) | null }) {
  // The felt reads the mood: a call floods and spins the rays, a challenge turns them red, a win colours them for the winner.
  useEffect(() => {
    const root = document.documentElement
    const tone = moment?.tone
    if (tone === 'call' || tone === 'danger' || tone === 'win') root.dataset.mood = tone
    else delete root.dataset.mood
    if (tone === 'win' && moment?.colour) root.style.setProperty('--mood-colour', moment.colour)
    else root.style.removeProperty('--mood-colour')
    return () => {
      delete root.dataset.mood
      root.style.removeProperty('--mood-colour')
    }
  }, [moment])
  return (
    <div className="moment-layer" data-active={moment !== null} aria-live="assertive">
      <AnimatePresence mode="wait">
        {moment && (
          <motion.div key={moment.id} className="moment" data-tone={moment.tone} initial={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.08 }}>
            <p className="moment-title" style={{ '--chars': moment.title.length } as React.CSSProperties}>
              {moment.title}
            </p>
            {moment.card && <PlayingCard card={moment.card} size="trick" />}
            {moment.detail && <p className="moment-detail">{moment.detail}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const PIECES = 72
/** Pieces in the first burst; the rest follow in a second. */
const FIRST_WAVE = 44
const SECOND_WAVE_MS = 900

/** A number in [0, 1) from a piece's index and a prime, the same every time, so the burst never changes under a re-render. */
function spread(i: number, prime: number): number {
  return ((i + 1) * prime) % 97 / 97
}

/**
 * Confetti for a won game, in the winner's colour (a theme token such as `var(--team0)`) with
 * yellow and paper: card-shaped pieces burst from the middle of the table where the winner's
 * name is stamped, in two waves, and fall. Hidden under reduced motion.
 */
export function Celebration({ colour }: { colour: string }) {
  return (
    <div className="celebration" style={{ color: colour }} aria-hidden>
      {Array.from({ length: PIECES }, (_, i) => {
        const wave = i < FIRST_WAVE ? 0 : SECOND_WAVE_MS
        return (
          <i
            key={i}
            style={
              {
                '--dx': `${(spread(i, 37) - 0.5) * 95}vw`,
                '--up': `${8 + spread(i, 53) * 26}vh`,
                '--spin': `${(spread(i, 71) - 0.5) * 2200}deg`,
                '--delay': `${wave + spread(i, 89) * 260}ms`,
                '--dur': `${2400 + spread(i, 61) * 1200}ms`,
              } as React.CSSProperties
            }
          />
        )
      })}
    </div>
  )
}
