import { type Card, type RejectReason, type Seat, type Suit, type Team, type View, SUITS, rankStrength, teamOf } from '../engine'

export const SUIT_SYMBOL: Record<Suit, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }
export const SUIT_NAME: Record<Suit, string> = { hearts: 'Hearts', diamonds: 'Diamonds', clubs: 'Clubs', spades: 'Spades' }

export function isRed(suit: Suit): boolean {
  return suit === 'hearts' || suit === 'diamonds'
}

export function cardText(card: Card): string {
  return `${card.rank}${SUIT_SYMBOL[card.suit]}`
}

export function seatName(view: View, seat: Seat): string {
  return view.seats[seat]?.name || `Seat ${seat + 1}`
}

/** "Asha & Chan" for a team; pass the viewer's seat to get "You & Chan". */
export function teamName(view: View, team: Team, you: Seat | null = null): string {
  return view.seats
    .map((_, seat) => seat)
    .filter((seat) => teamOf(seat) === team)
    .sort((a, b) => Number(b === you) - Number(a === you))
    .map((seat) => (seat === you ? 'You' : seatName(view, seat)))
    .join(' & ')
}

/** Display order only: grouped by suit, strongest first. The engine keeps deal order. */
export function sortHand(hand: readonly Card[]): Card[] {
  return [...hand].sort(
    (a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || rankStrength(b.rank) - rankStrength(a.rank),
  )
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
  badChoice: "You can't choose that.",
  malformed: "The server didn't understand that. Reload and try again.",
}

export function rejectionText(reason: RejectReason | 'malformed'): string {
  return REJECTIONS[reason]
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
