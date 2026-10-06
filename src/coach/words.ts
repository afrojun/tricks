/** Small pieces of wording the coach shares. */
import { type Card, type Seat, type Suit, type View, CARD_POINTS, FOUR_PLAYER_TARGET, SUIT_NAME, cardText, teamOf } from '../games/thunee/engine'

export const card = cardText

/** "You", or the seat's name. */
export function who(view: View, seat: Seat): string {
  return seat === view.seat ? 'You' : view.seats[seat]?.name || `Seat ${seat + 1}`
}

/** Lower-case "you" for the middle of a sentence. */
export function whoIn(view: View, seat: Seat): string {
  return seat === view.seat ? 'you' : who(view, seat)
}

/** Third-person verb, unless the subject is "you": verb(view, seat, 'win', 'wins'). */
export function verb(view: View, seat: Seat, you: string, they: string): string {
  return seat === view.seat ? you : they
}

export function isPartner(view: View, seat: Seat): boolean {
  return view.seat !== null && seat !== view.seat && view.playerCount === 4 && teamOf(seat) === teamOf(view.seat)
}

/** "Partner" is already a name in practice; elsewhere "your partner Asha". */
export function partnerName(view: View, seat: Seat): string {
  const name = who(view, seat)
  return name === 'Partner' ? 'Partner' : `your partner ${name}`
}

export function suitPlural(suit: Suit): string {
  return SUIT_NAME[suit].toLowerCase()
}

export function points(cards: readonly Card[]): number {
  return cards.reduce((sum, c) => sum + CARD_POINTS[c.rank], 0)
}

export function list(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

export function count(n: number, one: string, many = `${one}s`): string {
  const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six']
  return `${words[n] ?? n} ${n === 1 ? one : many}`
}

export function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** "trick 3"; in the two-player game, "trick 1 of the second half". `index` counts from 0 within the half. */
export function trickLabel(playerCount: number, half: 1 | 2, index: number): string {
  return playerCount === 2 ? `trick ${index + 1} of the ${half === 1 ? 'first' : 'second'} half` : `trick ${index + 1}`
}

/** What the counting side needs: 105, or 125 with two players. */
export function target(view: View): number {
  return view.playerCount === 2 ? view.rules.twoPlayerTarget : FOUR_PLAYER_TARGET
}
