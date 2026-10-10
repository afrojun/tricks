/** Small pieces of wording Spades' coach shares. A suit's name is already its plural: "clubs". */
import { cardText } from '../../../kit/cards'
import { partnerOf } from '../../../kit/partners'
import type { Seat } from '../../../kit/table'
import type { Card, View } from '../engine'

export const card = cardText

/** "You", or the seat's name. */
export function who(view: View, seat: Seat): string {
  return seat === view.seat ? 'You' : view.seats[seat]?.name || `Seat ${seat + 1}`
}

/** "you", or the seat's name, inside a sentence. */
export function whom(view: View, seat: Seat): string {
  return seat === view.seat ? 'you' : who(view, seat)
}

/** Whether the player has a partner: with four, a side is two and "your side" means them both. */
export function partnered(view: View): boolean {
  return view.seat !== null && partnerOf(view.seat, view.playerCount) !== null
}

/** A side as a sentence's subject, from the player's view: "Your side", "You", "Asha and Chan", "Asha". `many` when its verb is plural. */
export function sideWho(view: View, seats: readonly Seat[]): { name: string; many: boolean } {
  if (view.seat !== null && seats.includes(view.seat)) return seats.length > 1 ? { name: 'Your side', many: false } : { name: 'You', many: true }
  return { name: seats.map((s) => who(view, s)).join(' and '), many: seats.length > 1 }
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth']

/** "first" for 1, up to a round of seventeen tricks. */
export function ordinal(n: number): string {
  return ORDINALS[n - 1] ?? `${n}th`
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
