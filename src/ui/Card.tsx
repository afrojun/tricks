import { type Card, JOKER_NAME, type Suit, cardName } from '../kit/cards'
import { useTheme } from './session'
import { SUIT_NAME, isRed } from './text'

type Size = 'hand' | 'trick' | 'small'

/** The suits as drawn for print, in a 100-unit square, so every phone shows the same pips. */
const PIP: Record<Suit, string> = {
  spades: '<path d="M50 6C62 26 92 42 92 62c0 13-10 21-21 21-8 0-14-4-17-10 1 9 5 17 12 22H34c7-5 11-13 12-22-3 6-9 10-17 10C18 83 8 75 8 62 8 42 38 26 50 6Z"/>',
  hearts: '<path d="M50 90C20 64 8 47 8 31 8 17 19 8 30 8c9 0 16 5 20 13 4-8 11-13 20-13 11 0 22 9 22 23 0 16-12 33-42 59Z"/>',
  diamonds: '<path d="M50 5 89 50 50 95 11 50Z"/>',
  clubs: '<circle cx="50" cy="27" r="20"/><circle cx="27" cy="58" r="20"/><circle cx="73" cy="58" r="20"/><circle cx="50" cy="52" r="12"/><path d="M50 40c0 30-4 45-15 55h30C54 85 50 70 50 40Z"/>',
}

/** A joker's star, drawn where a suit's pip would be. */
const STAR = '<path d="M50 4 62 37h35L69 58l11 35-30-21-30 21 11-35L3 37h35Z"/>'

/** A suit's pip, in the current colour. Decorative unless given a label. */
export function Pip({ suit, label, className = '' }: { suit: Suit; label?: string; className?: string }) {
  return (
    <svg
      className={`pip ${className}`}
      viewBox="0 0 100 100"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: PIP[suit] }}
    />
  )
}

/** The suit as a word and its pip, for a line such as "Trump ♣". */
export function SuitChip({ suit }: { suit: Suit }) {
  return (
    <span className="suit-chip" data-red={isRed(suit)}>
      <Pip suit={suit} label={SUIT_NAME[suit]} />
    </span>
  )
}

interface PlayingCardProps {
  card: Card
  size?: Size
  onClick?: (event?: React.MouseEvent) => void
  playable?: boolean
  dim?: boolean
  selected?: boolean
  /** A word on the card's visible edge, such as "New"; it joins the card's name for screen readers. */
  tag?: string
  className?: string
  style?: React.CSSProperties
}

const COURT = new Set(['J', 'Q', 'K'])

/** A joker's star, in the current colour. */
function Star() {
  return <svg className="pip" viewBox="0 0 100 100" aria-hidden dangerouslySetInnerHTML={{ __html: STAR }} />
}

export function PlayingCard({ card, size = 'hand', onClick, playable, dim, selected, tag, className = '', style }: PlayingCardProps) {
  // A joker has a suit to play as, but shows a star: the big one red, the little one black.
  const joker = JOKER_NAME[card.rank]
  const label = `${cardName(card)}${tag ? `, ${tag.toLowerCase()}` : ''}`
  const face = (
    <>
      <span className="ix" aria-hidden>
        <span>{joker ? 'J' : card.rank}</span>
        {joker ? <Star /> : <Pip suit={card.suit} />}
      </span>
      <span className="art" aria-hidden>
        {joker ? <Star /> : <Pip suit={card.suit} />}
      </span>
      {tag && (
        <span className="card-tag" aria-hidden>
          {tag}
        </span>
      )}
    </>
  )
  const shared = {
    className: `playing-card ${className}`,
    'data-size': size,
    'data-red': joker ? card.rank === 'BJ' : isRed(card.suit),
    'data-court': COURT.has(card.rank) ? card.rank : joker ? 'joker' : undefined,
    'data-playable': playable ?? false,
    'data-dim': dim ?? false,
    'data-selected': selected ?? false,
    style,
  }
  if (!onClick) {
    return (
      <span {...shared} role="img" aria-label={label}>
        {face}
      </span>
    )
  }
  return (
    <button {...shared} onClick={onClick} disabled={!playable} aria-label={label} aria-pressed={selected}>
      {face}
    </button>
  )
}

export function CardBack({ size = 'small' }: { size?: Size }) {
  const { cardBack } = useTheme()
  return <span className="playing-card card-back" data-size={size} data-back={cardBack} aria-hidden />
}
