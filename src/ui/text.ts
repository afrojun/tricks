import type { Suit } from '../kit/cards'
import type { Seat, TableReject, TableView } from '../kit/table'

export { SUIT_NAME, SUIT_SYMBOL, cardText } from '../kit/cards'

export function isRed(suit: Suit): boolean {
  return suit === 'hearts' || suit === 'diamonds'
}

export function seatName(view: TableView, seat: Seat): string {
  return view.seats[seat]?.name || `Seat ${seat + 1}`
}

/** The table's reasons, which every game shares, and the room's own for a message it could not read. */
const TABLE_REJECTIONS: Record<TableReject | 'malformed', string> = {
  notAllowed: "You can't do that right now.",
  wrongPhase: 'The game has moved on.',
  notHost: 'Only the host can do that.',
  seatTaken: 'That seat is taken.',
  alreadySeated: 'You already have a seat.',
  notSeated: 'Take a seat first.',
  badName: 'Enter a name to sit down.',
  badSeat: "That seat isn't available.",
  seatsNotFilled: 'Fill every seat before starting.',
  badChoice: "You can't choose that.",
  malformed: "The server didn't understand that. Reload and try again.",
}

/** The room sends the game's own reason, or `malformed`; the game words its own, and anything else reads as a plain refusal. */
export function rejectionText(reason: string, own: Readonly<Record<string, string>>): string {
  if (Object.hasOwn(own, reason)) return own[reason]
  return Object.hasOwn(TABLE_REJECTIONS, reason) ? TABLE_REJECTIONS[reason as keyof typeof TABLE_REJECTIONS] : TABLE_REJECTIONS.notAllowed
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** Copies to the clipboard, falling back to showing the text where the clipboard is unavailable. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    window.prompt('Copy this link', text)
    return false
  }
}
