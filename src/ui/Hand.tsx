import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { type Card, cardId, hasCard, sameCard } from '../kit/cards'
import { PlayingCard } from './Card'
import { fanTilt } from './hands'
import { useShowsPlayable } from './prefs'
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
  /**
   * The most cards this hand holds, when more than six (Hearts' thirteen): smaller cards, spaced so
   * that many fit one row with every index showing.
   */
  most?: number
  /**
   * Choosing several cards at once, such as a pass: a tap picks a card or puts it back, and nothing
   * is played. `onPick` is null once the choice is made.
   */
  choose?: { picked: C[]; onPick: ((card: C) => void) | null }
  /** Cards to mark as new, such as those just passed to the player. */
  marked?: C[]
}

/** A card let go this far above the hand has been put on the table. */
const DROP_ABOVE_HAND_PX = 24
const TAP_SLOP_PX = 12
/** If a dropped card has not left the hand by now, the play was refused: bring it back. */
const RETURN_AFTER_MS = 1200

export function Hand<C extends Card>({ cards, playable, legal, anyway, dealFrom, onPlay, suggested = null, explain, most, choose, marked = [] }: HandProps<C>) {
  // An illegal card needs a second, explicit confirmation.
  const [pending, setPending] = useState<C | null>(null)
  const [shake, setShake] = useState(0)
  // The player may turn off the marking of cards they may not play (the menu's switch).
  const marksPlayable = useShowsPlayable()
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
    // Unmarked, a card the table will refuse is still offered to it, so the refusal says why.
    if (!anyway) {
      if (!marksPlayable) onPlay(card)
      return false
    }
    setPending(card)
    setShake((n) => n + 1)
    return false
  }

  // Smaller cards for a hand of many (see `.hand[data-many]`).
  const many = most !== undefined && most > 6
  const confirm = (card: C) => {
    setPending(null)
    onPlay(card)
  }
  /** Returns whether the card was sent to the table; while choosing, a tap only picks. */
  const tap = (card: C): boolean => {
    if (!choose) return attempt(card)
    choose.onPick?.(card)
    return false
  }

  return (
    <div
      ref={handRef}
      className="hand"
      data-many={many || undefined}
      // The row closes up as far as this many cards need (see `.hand-slot`).
      style={{ '--count': Math.max(2, cards.length) } as React.CSSProperties}
      onClick={() => !dragging.current && setPending(null)}
    >
      {/* Over a long row, a card's own "Play anyway" could run off the screen: it sits above the middle of the row. */}
      {many && pending && <PlayAnyway card={pending} explanation={explain?.(pending) ?? null} onConfirm={() => confirm(pending)} />}
      <AnimatePresence initial={false}>
        {cards.map((card, i) => (
          <HandCard
            key={cardId(card)}
            card={card}
            index={i}
            count={cards.length}
            playable={choose ? choose.onPick !== null : playable}
            choosing={choose !== undefined}
            legal={choose !== undefined || !marksPlayable || legal.some((c) => sameCard(c, card))}
            pending={pending !== null && sameCard(pending, card)}
            picked={choose !== undefined && hasCard(choose.picked, card)}
            marked={hasCard(marked, card)}
            suggested={suggested !== null && sameCard(suggested, card)}
            explanation={pending !== null && sameCard(pending, card) ? (explain?.(card) ?? null) : null}
            ownAnyway={!many}
            shake={shake}
            dealFrom={dealFrom}
            dragging={dragging}
            handTop={() => handRef.current?.getBoundingClientRect().top ?? 0}
            onAttempt={() => tap(card)}
            onConfirm={() => confirm(card)}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}

/** The second tap for a rule-breaking card, and in practice why it is a problem. */
function PlayAnyway({ card, explanation, onConfirm }: { card: Card; explanation: string | null; onConfirm: () => void }) {
  return (
    <>
      {explanation && <p className="panel play-anyway-why">{explanation}</p>}
      <button
        className="btn btn-danger btn-small play-anyway"
        onClick={(e) => {
          e.stopPropagation()
          onConfirm()
        }}
      >
        Play {cardText(card)} anyway
      </button>
    </>
  )
}

interface HandCardProps {
  card: Card
  index: number
  count: number
  playable: boolean
  /** Picking cards rather than playing one: no carrying, and no second tap. */
  choosing: boolean
  legal: boolean
  pending: boolean
  picked: boolean
  marked: boolean
  suggested: boolean
  explanation: string | null
  /** Whether "Play anyway" sits over this card, rather than over the row. */
  ownAnyway: boolean
  shake: number
  dealFrom: { x: number; y: number }
  dragging: React.RefObject<boolean>
  handTop: () => number
  onAttempt: () => boolean
  onConfirm: () => void
}

/** One card in the hand. It can be picked up and carried anywhere, and is played by letting go over the table. */
function HandCard(props: HandCardProps) {
  const { card, index, count, playable, choosing, legal, pending, picked, marked, suggested, explanation, ownAnyway, shake, dealFrom, dragging, handTop, onAttempt, onConfirm } = props
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
  const tilt = fanTilt(index, count)

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
      drag={playable && !choosing}
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
      {pending && ownAnyway && <PlayAnyway card={card} explanation={explanation} onConfirm={onConfirm} />}
      <PlayingCard
        key={pending ? shake : 0}
        card={card}
        playable={playable}
        dim={playable && !legal}
        selected={pending || picked}
        tag={marked ? 'New' : undefined}
        className={`${pending ? 'shake' : ''} ${suggested ? 'suggested' : ''}${picked ? ' picked' : ''}`}
        onClick={(e) => {
          e?.stopPropagation()
          if (!dragging.current) onAttempt()
        }}
        style={{ '--tilt': `${tilt}deg` } as React.CSSProperties}
      />
    </motion.div>
  )
}
