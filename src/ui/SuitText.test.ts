import { type ReactElement, isValidElement } from 'react'
import { describe, expect, test } from 'vitest'
import { SuitText } from './SuitText'

type Span = ReactElement<{ className: string; 'data-red'?: boolean; children: string }>

/** The pieces SuitText returns, a card as `[K♦ red]` or `[A♣]`. */
function pieces(text: string): string[] {
  const out = SuitText({ text })
  if (typeof out === 'string') return [out]
  return (out as (string | Span)[]).map((p) => (isValidElement(p) ? `[${(p as Span).props.children}${(p as Span).props['data-red'] ? ' red' : ''}]` : (p as string)))
}

describe('suit text', () => {
  test('copy with no suit symbol comes back as it is', () => {
    expect(SuitText({ text: 'Lead high' })).toBe('Lead high')
    expect(SuitText({ text: '' })).toBe('')
  })

  test('each card is one piece, red for hearts and diamonds', () => {
    expect(pieces('Lead high, K♦')).toEqual(['Lead high, ', '[K♦ red]'])
    expect(pieces('10♥ beats 9♥, and 4♠ beats the A♣.')).toEqual(['[10♥ red]', ' beats ', '[9♥ red]', ', and ', '[4♠]', ' beats the ', '[A♣]', '.'])
    expect(pieces('Trump is ♦')).toEqual(['Trump is ', '[♦ red]'])
  })
})
