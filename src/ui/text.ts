import type { RejectReason, Seat, Suit, View } from '../games/thunee/engine'

export { SUIT_NAME, SUIT_SYMBOL, cardText } from '../games/thunee/engine'

export function isRed(suit: Suit): boolean {
  return suit === 'hearts' || suit === 'diamonds'
}

export function seatName(view: View, seat: Seat): string {
  return view.seats[seat]?.name || `Seat ${seat + 1}`
}

const REJECTIONS: Record<RejectReason | 'malformed', string> = {
  notAllowed: "You can't do that right now.",
  wrongPhase: 'The game has moved on.',
  notYourTurn: "It isn't your turn.",
  notHost: 'Only the host can do that.',
  seatTaken: 'That seat is taken.',
  alreadySeated: 'You already have a seat.',
  notSeated: 'Take a seat first.',
  badName: 'Enter a name to sit down.',
  badSeat: "That seat isn't available.",
  seatsNotFilled: 'Fill every seat before starting.',
  badAmount: 'Call higher than the current call.',
  cardNotInHand: "That card isn't in your hand.",
  illegalCard: 'That card breaks the rules, and cheating is off.',
  falseClaim: 'Cheating is off, so you can only call a Jodhi you have.',
  badChoice: "You can't choose that.",
  malformed: "The server didn't understand that. Reload and try again.",
}

/** The room sends the game's own reason, or `malformed`; anything else reads as a plain refusal. */
export function rejectionText(reason: string): string {
  return Object.hasOwn(REJECTIONS, reason) ? REJECTIONS[reason as keyof typeof REJECTIONS] : REJECTIONS.notAllowed
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
