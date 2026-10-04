import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { type Card, cardId, sameCard } from '../engine'
import { PlayingCard } from './Card'
import { cardText } from './text'

/** Shared between a card in the hand and the same card on the table, so it travels between them. */
export function cardLayoutId(card: Card): string {
  return `card-${cardId(card)}`
}

interface HandProps {
  cards: Card[]
  /** Whether it is this player's turn to play a card. */
  playable: boolean
  legal: Card[]
  /** Where newly dealt cards come from, as an offset in pixels. */
  dealFrom: { x: number; y: number }
  onPlay: (card: Card) => void
}

const DRAG_TO_PLAY_PX = 70

export function Hand({ cards, playable, legal, dealFrom, onPlay }: HandProps) {
  // An illegal card needs a second, explicit confirmation.
  const [pending, setPending] = useState<Card | null>(null)
  const [shake, setShake] = useState(0)
  const dragged = useRef(false)
  useEffect(() => setPending(null), [playable, cards.length])

  const attempt = (card: Card) => {
    if (!playable) return
    if (legal.some((c) => sameCard(c, card))) {
      setPending(null)
      onPlay(card)
    } else {
      setPending(card)
      setShake((n) => n + 1)
    }
  }

  // Tighter overlap as the hand grows, so six cards still fit a phone.
  const overlap = cards.length >= 6 ? -0.16 : cards.length === 5 ? -0.1 : -0.04

  return (
    <div className="hand" style={{ '--overlap': overlap } as React.CSSProperties} onClick={() => setPending(null)}>
      <AnimatePresence initial={false}>
        {cards.map((card, i) => {
          const isLegal = legal.some((c) => sameCard(c, card))
          const isPending = pending !== null && sameCard(pending, card)
          const tilt = (i - (cards.length - 1) / 2) * 4
          return (
            <motion.div
              key={cardId(card)}
              className="hand-slot"
              layout
              layoutId={cardLayoutId(card)}
              style={{ zIndex: isPending ? 20 : i }}
              variants={{
                dealt: { x: dealFrom.x, y: dealFrom.y, opacity: 0 },
                held: { x: 0, y: 0, opacity: 1, transition: { delay: i * 0.07 } },
              }}
              initial="dealt"
              animate="held"
              drag={playable ? 'y' : false}
              dragConstraints={{ top: -180, bottom: 0 }}
              dragElastic={0.15}
              dragSnapToOrigin
              onDragStart={() => (dragged.current = true)}
              onDragEnd={(_, info) => {
                if (info.offset.y < -DRAG_TO_PLAY_PX) attempt(card)
                // The click that ends a drag must not count as a tap.
                setTimeout(() => (dragged.current = false), 0)
              }}
            >
              {isPending && (
                <button
                  className="btn btn-danger btn-small play-anyway"
                  onClick={(e) => {
                    e.stopPropagation()
                    setPending(null)
                    onPlay(card)
                  }}
                >
                  Play {cardText(card)} anyway
                </button>
              )}
              <PlayingCard
                key={isPending ? shake : 0}
                card={card}
                playable={playable}
                dim={playable && !isLegal}
                selected={isPending}
                className={isPending ? 'shake' : ''}
                onClick={(e) => {
                  e?.stopPropagation()
                  if (!dragged.current) attempt(card)
                }}
                style={{ '--tilt': `${tilt}deg` } as React.CSSProperties}
              />
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
