import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import type { Card, Team } from '../engine'
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
  return (
    <div className="moment-layer" data-active={moment !== null} aria-live="assertive">
      <AnimatePresence mode="wait">
        {moment && (
          <motion.div
            key={moment.id}
            className="panel moment"
            data-tone={moment.tone}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.08 }}
          >
            {moment.card && <PlayingCard card={moment.card} size="trick" />}
            <div>
              <p className="display text-2xl">{moment.title}</p>
              {moment.detail && <p className="mt-1">{moment.detail}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** A single burst in the winning side's colour when the game is won. */
export function Celebration({ team }: { team: Team }) {
  return (
    <div className="celebration" style={{ color: team === 0 ? 'var(--team0)' : 'var(--team1)' }} aria-hidden>
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
