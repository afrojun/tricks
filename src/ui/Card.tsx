import type { Card } from '../games/thunee/engine'
import { useTheme } from './session'
import { SUIT_NAME, SUIT_SYMBOL, isRed } from './text'

type Size = 'hand' | 'trick' | 'small'

interface PlayingCardProps {
  card: Card
  size?: Size
  onClick?: (event?: React.MouseEvent) => void
  playable?: boolean
  dim?: boolean
  selected?: boolean
  className?: string
  style?: React.CSSProperties
}

export function PlayingCard({ card, size = 'hand', onClick, playable, dim, selected, className = '', style }: PlayingCardProps) {
  const label = `${card.rank} of ${SUIT_NAME[card.suit]}`
  const face = (
    <>
      <span className="corner">
        <span>{card.rank}</span>
        <span className="pip">{SUIT_SYMBOL[card.suit]}</span>
      </span>
      <span className="centre" aria-hidden>
        {SUIT_SYMBOL[card.suit]}
      </span>
    </>
  )
  const shared = {
    className: `playing-card ${className}`,
    'data-size': size,
    'data-red': isRed(card.suit),
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
