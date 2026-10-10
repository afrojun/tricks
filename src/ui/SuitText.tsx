import type { ReactNode } from 'react'
import { type Card, type Suit, SUIT_SYMBOL, cardName } from '../kit/cards'

/** A card in copy, `K♦` or `10♥`, or a suit symbol alone. */
const CARD = /(?:10|[2-9JQKA])?[♠♥♦♣]/g
const SUIT_OF = Object.fromEntries(Object.entries(SUIT_SYMBOL).map(([suit, symbol]) => [symbol, suit])) as Record<string, Suit>

/** What a screen reader says for a card in copy: "king of diamonds", or the suit alone. */
function spoken(token: string): string {
  const suit = SUIT_OF[token.slice(-1)]
  const rank = token.slice(0, -1)
  return rank ? cardName({ suit, rank } as Card) : suit
}

/**
 * Copy with every card in it in its suit's colour: hearts and diamonds red where red reads (on
 * paper and on ink), spades and clubs in the text's own colour. A card never breaks across lines.
 * A string with no suit symbol comes back as it is.
 */
export function SuitText({ text }: { text: string }): ReactNode {
  if (!/[♠♥♦♣]/.test(text)) return text
  const parts: ReactNode[] = []
  let at = 0
  for (const match of text.matchAll(CARD)) {
    if (match.index > at) parts.push(text.slice(at, match.index))
    const red = match[0].endsWith('♥') || match[0].endsWith('♦')
    parts.push(
      <span key={match.index} className="suit-text" data-red={red || undefined} role="img" aria-label={spoken(match[0])}>
        {match[0]}
      </span>,
    )
    at = match.index + match[0].length
  }
  if (at < text.length) parts.push(text.slice(at))
  return parts
}
