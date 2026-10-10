import type { ReactNode } from 'react'

/** A card in copy, `K♦` or `10♥`, or a suit symbol alone. */
const CARD = /(?:10|[2-9JQKA])?[♠♥♦♣]/g

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
      <span key={match.index} className="suit-text" data-red={red || undefined}>
        {match[0]}
      </span>,
    )
    at = match.index + match[0].length
  }
  if (at < text.length) parts.push(text.slice(at))
  return parts
}
