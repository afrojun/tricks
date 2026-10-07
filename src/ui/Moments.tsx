import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import type { Card } from '../kit/cards'
import { PlayingCard } from './Card'

/** A call, challenge or verdict that deserves the middle of the screen for a moment. */
export interface Moment {
  title: string
  detail?: string
  tone: 'call' | 'danger' | 'good'
  ms: number
  card?: Card
}

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
  // The felt reads the mood: a call floods and spins the rays, a challenge turns them red.
  useEffect(() => {
    const tone = moment?.tone
    if (tone === 'call' || tone === 'danger') document.documentElement.dataset.mood = tone
    else delete document.documentElement.dataset.mood
    return () => {
      delete document.documentElement.dataset.mood
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

/** A single burst in the winner's colour when the game is won: a theme token such as `var(--team0)`. */
export function Celebration({ colour }: { colour: string }) {
  return (
    <div className="celebration" style={{ color: colour }} aria-hidden>
      {Array.from({ length: 28 }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            animationDelay: `${(i % 7) * 90}ms`,
            animationDuration: `${1500 + ((i * 53) % 900)}ms`,
          }}
        />
      ))}
    </div>
  )
}
