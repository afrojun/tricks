/** Small pieces of wording the coach shares. */
import { type Card, type Seat, type Suit, type Team, type View, CARD_POINTS, FOUR_PLAYER_TARGET, cardText, teamOf } from '../engine'

export const card = cardText

/** "You", or the seat's name, to start a sentence. */
export function who(view: View, seat: Seat): string {
  return seat === view.seat ? 'You' : view.seats[seat]?.name || `Seat ${seat + 1}`
}

/** Lower-case "you" for the middle of a sentence. */
export function whoIn(view: View, seat: Seat): string {
  return seat === view.seat ? 'you' : who(view, seat)
}

/** "Your", or the seat's name with ’s. */
export function whose(view: View, seat: Seat): string {
  return seat === view.seat ? 'Your' : `${who(view, seat)}’s`
}

/** Third-person verb, unless the subject is "you": verb(view, seat, 'win', 'wins'). */
export function verb(view: View, seat: Seat, you: string, they: string): string {
  return seat === view.seat ? you : they
}

export function isPartner(view: View, seat: Seat): boolean {
  return view.seat !== null && seat !== view.seat && view.playerCount === 4 && teamOf(seat) === teamOf(view.seat)
}

/** "your partner Asha". */
export function partnerName(view: View, seat: Seat): string {
  return `your partner ${who(view, seat)}`
}

/**
 * Where a seat sits from the reader's: "on your right", "opposite you", "on your left". Seats are
 * numbered in play order and Thunee goes counterclockwise, so the next seat is on the reader's right.
 * Empty with two players, or for the reader.
 */
export function sits(view: View, seat: Seat): string {
  if (view.seat === null || seat === view.seat || view.playerCount !== 4) return ''
  return ['', 'on your right', 'opposite you', 'on your left'][(seat - view.seat + 4) % 4]
}

/** "Asha, on your right," for the middle of a sentence; the name alone when where they sit says nothing. */
export function named(view: View, seat: Seat): string {
  const where = sits(view, seat)
  return where ? `${whoIn(view, seat)}, ${where},` : whoIn(view, seat)
}

/**
 * A side, for the middle of a sentence: "your side" and "the other side", or with two players, where
 * a side is one player, "you" and the other player's name.
 */
export function sideOf(view: View, team: Team | number): string {
  const mine = view.seat !== null && teamOf(view.seat) === team
  if (view.playerCount === 2) return mine ? 'you' : who(view, team as Seat)
  return mine ? 'your side' : 'the other side'
}

/** A side and its verb: "your side gets", "the other side gets", but with two players "you get". */
export function sideDoes(view: View, team: Team | number, they: string, you: string): string {
  const side = sideOf(view, team)
  return `${side} ${side === 'you' ? you : they}`
}

/** The reader's own side, for the middle of a sentence. */
export function yourSide(view: View): string {
  return view.seat === null ? 'your side' : sideOf(view, teamOf(view.seat))
}

/** The other side, for the middle of a sentence. */
export function otherSide(view: View): string {
  return view.seat === null ? 'the other side' : sideOf(view, 1 - teamOf(view.seat))
}

/** "your side’s", "the other side’s", "Asha’s", "your". */
export function sidePossessive(side: string): string {
  return side === 'you' ? 'your' : `${side}’s`
}

/** The suit's name in lower case: "hearts". */
export function suitPlural(suit: Suit): string {
  return suit
}

/** One card of the suit: "heart". */
export function suitOne(suit: Suit): string {
  return suit.replace(/s$/, '')
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
