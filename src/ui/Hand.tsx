import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { type Card, cardId, sameCard } from '../kit/cards'
import { PlayingCard } from './Card'
import { cardText } from './text'

/** Shared between a card in the hand and the same card on the table, so it travels between them. */
export function cardLayoutId(card: Card): string {
  return `card-${cardId(card)}`
}

/** A game's own card type, so what is played comes back as the game's card. */
interface HandProps<C extends Card> {
  cards: C[]
  /** Whether it is this player's turn to play a card. */
  playable: boolean
  legal: C[]
  /** Whether a rule-breaking card may still be played, after a second tap: only while cheating is allowed. */
  anyway: boolean
  /** Where newly dealt cards come from, as an offset in pixels. */
  dealFrom: { x: number; y: number }
  onPlay: (card: C) => void
  /** Practice: the card the hint suggests, raised and ringed. */
  suggested?: C | null
  /** Practice: why a rule-breaking card is a problem, shown above "Play anyway". */
  explain?: (card: C) => string | null
}

/** A card let go this far above the hand has been put on the table. */
const DROP_ABOVE_HAND_PX = 24
const TAP_SLOP_PX = 12
/** If a dropped card has not left the hand by now, the play was refused: bring it back. */
const RETURN_AFTER_MS = 1200

export function Hand<C extends Card>({ cards, playable, legal, anyway, dealFrom, onPlay, suggested = null, explain }: HandProps<C>) {
  // An illegal card needs a second, explicit confirmation.
  const [pending, setPending] = useState<C | null>(null)
  const [shake, setShake] = useState(0)
  const handRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  useEffect(() => {
    setPending(null)
    dragging.current = false // a drag cut short by the turn ending must not block later taps
  }, [playable, cards.length])

  /** Returns whether the card was sent to the table. */
  const attempt = (card: C): boolean => {
    if (!playable) return false
    if (legal.some((c) => sameCard(c, card))) {
      setPending(null)
      onPlay(card)
      return true
    }
    if (!anyway) return false
    setPending(card)
    setShake((n) => n + 1)
    return false
  }

  // Tighter overlap as the hand grows, so six cards still fit a phone.
  const overlap = cards.length >= 6 ? -0.16 : cards.length === 5 ? -0.1 : -0.04

  return (
    <div ref={handRef} className="hand" style={{ '--overlap': overlap } as React.CSSProperties} onClick={() => !dragging.current && setPending(null)}>
      <AnimatePresence initial={false}>
        {cards.map((card, i) => (
          <HandCard
            key={cardId(card)}
            card={card}
            index={i}
            count={cards.length}
            playable={playable}
            legal={legal.some((c) => sameCard(c, card))}
            pending={pending !== null && sameCard(pending, card)}
            suggested={suggested !== null && sameCard(suggested, card)}
            explanation={pending !== null && sameCard(pending, card) ? (explain?.(card) ?? null) : null}
            shake={shake}
            dealFrom={dealFrom}
            dragging={dragging}
            handTop={() => handRef.current?.getBoundingClientRect().top ?? 0}
            onAttempt={() => attempt(card)}
            onConfirm={() => {
              setPending(null)
              onPlay(card)
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}

interface HandCardProps {
  card: Card
  index: number
  count: number
  playable: boolean
  legal: boolean
  pending: boolean
  suggested: boolean
  explanation: string | null
  shake: number
  dealFrom: { x: number; y: number }
  dragging: React.RefObject<boolean>
  handTop: () => number
  onAttempt: () => boolean
  onConfirm: () => void
}

/** One card in the hand. It can be picked up and carried anywhere, and is played by letting go over the table. */
function HandCard({ card, index, count, playable, legal, pending, suggested, explanation, shake, dealFrom, dragging, handTop, onAttempt, onConfirm }: HandCardProps) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  // A carried card swings a little with the hand that moves it.
  const swing = useTransform(x, [-160, 160], [-12, 12], { clamp: true })
  const returnTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(returnTimer.current), [])

  const goHome = () => {
    animate(x, 0)
    animate(y, 0)
  }
  const tilt = (index - (count - 1) / 2) * 4

  return (
    <motion.div
      className="hand-slot"
      layout
      layoutId={cardLayoutId(card)}
      style={{ x, y, rotate: swing, zIndex: pending ? 20 : index }}
      variants={{
        dealt: { x: dealFrom.x, y: dealFrom.y, opacity: 0 },
        held: { x: 0, y: 0, opacity: 1, transition: { delay: index * 0.07 } },
      }}
      initial="dealt"
      animate="held"
      drag={playable}
      dragMomentum={false}
      whileDrag={{ scale: 1.12, zIndex: 60 }}
      onDragStart={() => {
        dragging.current = true
        clearTimeout(returnTimer.current)
      }}
      onDragEnd={(_, info) => {
        const moved = Math.hypot(info.offset.x, info.offset.y)
        const overTable = info.point.y < handTop() - DROP_ABOVE_HAND_PX
        // A finger rarely lands perfectly still: a tiny drag is a tap.
        const played = (overTable || moved < TAP_SLOP_PX) && onAttempt()
        // A played card waits where it was dropped and travels to the trick from there.
        if (played) returnTimer.current = setTimeout(goHome, RETURN_AFTER_MS)
        else goHome()
        // The click that ends a drag must not count as a tap.
        setTimeout(() => (dragging.current = false), 0)
      }}
    >
      {pending && explanation && <p className="panel play-anyway-why">{explanation}</p>}
      {pending && (
        <button
          className="btn btn-danger btn-small play-anyway"
          onClick={(e) => {
            e.stopPropagation()
            onConfirm()
          }}
        >
          Play {cardText(card)} anyway
        </button>
      )}
      <PlayingCard
        key={pending ? shake : 0}
        card={card}
        playable={playable}
        dim={playable && !legal}
        selected={pending}
        className={`${pending ? 'shake' : ''} ${suggested ? 'suggested' : ''}`}
        onClick={(e) => {
          e?.stopPropagation()
          if (!dragging.current) onAttempt()
        }}
        style={{ '--tilt': `${tilt}deg` } as React.CSSProperties}
      />
    </motion.div>
  )
}
