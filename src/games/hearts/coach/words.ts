/** Small pieces of wording Hearts' coach shares. A suit's name is already its plural: "clubs". */
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
  const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
  return `${words[n] ?? n} ${n === 1 ? one : many}`
}

export function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Points as a count: "no points", "1 point", "−10 points". */
export function points(n: number): string {
  if (n === 0) return 'no points'
  const number = n < 0 ? `−${-n}` : `${n}`
  return `${number} point${n === 1 ? '' : 's'}`
}
