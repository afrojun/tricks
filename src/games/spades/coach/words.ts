/** Small pieces of wording Spades' coach shares. A suit's name is already its plural: "clubs". */
import { cardText } from '../../../kit/cards'
import type { Seat } from '../../../kit/table'
import type { Card, View } from '../engine'

export const card = cardText

/** "You", or the seat's name. */
export function who(view: View, seat: Seat): string {
  return seat === view.seat ? 'You' : view.seats[seat]?.name || `Seat ${seat + 1}`
}

/** "2♣", "2♣ and 3♣", "2♣, 3♣ and 4♣". */
export function list(cards: readonly Card[]): string {
  const items = cards.map(card)
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

export function count(n: number, one: string, many = `${one}s`): string {
  const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen']
  return `${words[n] ?? n} ${n === 1 ? one : many}`
}

export function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** A count of tricks with halves: "3", "2½". */
export function half(n: number): string {
  const whole = Math.floor(n)
  return n - whole >= 0.5 ? `${whole === 0 ? '' : whole}½` : String(whole)
}
