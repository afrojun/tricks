import { type Card, HAND_SIZE, type RejectReason, type RoundSummary, type View, type ViewPhase, type ViewPlaying, passTarget, strength, trickPoints } from '../engine'
import { type Suit, cardText } from '../../../kit/cards'
import type { Seat, TableReject } from '../../../kit/table'
import { seatName } from '../../../ui/text'

type PassWay = Exclude<View['direction'], 'none'>
type ViewPassing = Extract<ViewPhase, { kind: 'passing' }>

/** Black and red in turn, so neighbouring suits are told apart in a long row. */
const HAND_ORDER: readonly Suit[] = ['clubs', 'diamonds', 'spades', 'hearts']

/** Display order only: grouped by suit with the colours alternating, highest first. The engine keeps deal order. */
export function sortHand(hand: readonly Card[]): Card[] {
  return [...hand].sort((a, b) => HAND_ORDER.indexOf(a.suit) - HAND_ORDER.indexOf(b.suit) || strength(b) - strength(a))
}

/** "You" for the viewer, otherwise the seat's name. */
export function nameFor(view: View, seat: Seat): string {
  return seat === view.seat ? 'You' : seatName(view, seat)
}

/** "Asha, you and Devi": names in seat order, the viewer as "you". */
export function listNames(view: View, seats: readonly Seat[]): string {
  const names = seats.map((seat) => (seat === view.seat ? 'you' : seatName(view, seat)))
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? '')
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** A number of points, with a true minus sign: the jack of diamonds can take a score below nothing. */
export function points(n: number): string {
  return n < 0 ? `−${-n}` : String(n)
}

/** "3 points", "1 point", "−10 points". */
export function pointsWord(n: number): string {
  return `${points(n)} point${Math.abs(n) === 1 ? '' : 's'}`
}

/** The one button that gives the three cards away. */
export function passButton(direction: PassWay): string {
  return `Pass ${direction}`
}

/** Which way cards went this round, for the middle of the table. */
export function passedWay(direction: View['direction']): string {
  return direction === 'none' ? 'No passing' : `Passed ${direction}`
}

/** Seats still choosing what to pass, the viewer included, in seat order. */
export function stillChoosing(view: View, phase: ViewPassing): Seat[] {
  return view.seats.map((_, seat) => seat).filter((seat) => !phase.chosen.includes(seat))
}

/** The cards just passed to the viewer, marked until the viewer plays a card. */
export function newCards(phase: ViewPlaying): Card[] {
  return phase.hand.length === HAND_SIZE ? phase.received : []
}

/** The line over the hand: what to do now, or whom the table is waiting on. `mine` when it is the viewer's move. */
export function hint(view: View, picked: number): { text: string; mine: boolean } | null {
  const phase = view.phase
  const me = view.seat
  if (phase.kind === 'passing') {
    if (me !== null && phase.choice === null && view.direction !== 'none') {
      const to = seatName(view, passTarget(me, view.direction))
      if (picked === 0) return { text: `Pick three for ${to}`, mine: true }
      if (picked < 3) return { text: `${3 - picked} more for ${to}`, mine: true }
      return { text: `Ready for ${to}`, mine: true }
    }
    return { text: `Waiting for ${listNames(view, stillChoosing(view, phase))} to choose`, mine: false }
  }
  if (phase.kind === 'playing') {
    if (phase.turn !== me) return { text: `${seatName(view, phase.turn!)} to play`, mine: false }
    if (phase.tricks.length === 0 && phase.current.length === 0) return { text: 'Your lead: the two of clubs', mine: true }
    return { text: phase.current.length === 0 ? 'Your lead' : 'Your turn', mine: true }
  }
  if (phase.kind === 'roundResult') return { text: `Round ${view.roundNumber} is over`, mine: false }
  return null
}

/** Under a finished trick: who takes it, and what it is worth to them. */
export function trickTaken(view: View, winner: Seat, cards: readonly Card[]): string {
  const worth = trickPoints(cards, view.rules)
  const who = nameFor(view, winner)
  const takes = winner === view.seat ? 'take' : 'takes'
  return worth === 0 ? `${who} ${takes} it` : `${who} ${takes} ${pointsWord(worth)}`
}

/** What a guilty play was caught doing, by the rule it broke. */
const CAUGHT: Record<string, string> = {
  followSuit: 'not following suit',
  heartsLead: 'leading a heart before hearts were broken',
  firstTrickPoints: 'playing points on the first trick',
}

/** What a guilty verdict says was done, by the rule broken. */
export const BROKE: Record<string, string> = {
  followSuit: 'did not follow suit',
  heartsLead: 'led a heart before hearts were broken',
  firstTrickPoints: 'played points on the first trick',
}

/** One or two sentences saying how the round ended: the accusation or the moon, or who leads. */
export function headline(view: View, s: RoundSummary): string {
  const name = (seat: Seat) => nameFor(view, seat)
  const object = (seat: Seat) => (seat === view.seat ? 'you' : seatName(view, seat))
  const verb = (seat: Seat, you: string, they: string) => (seat === view.seat ? you : they)
  if (s.challenge) {
    const { challenger, accused, guilty, rule, card } = s.challenge
    const penalised = guilty ? accused : challenger
    const penalty = `${name(penalised)} ${verb(penalised, 'take', 'takes')} 26; nobody else scores.`
    return guilty
      ? `${name(challenger)} caught ${object(accused)} ${CAUGHT[rule ?? ''] ?? 'breaking a rule'} with ${cardText(card)}. ${penalty}`
      : `${name(challenger)} accused ${object(accused)}, but ${object(accused)} played by the rules. ${penalty}`
  }
  if (s.moon !== null) {
    return view.rules.moon === 'othersAdd'
      ? `${name(s.moon)} shot the moon: everyone else takes 26.`
      : `${name(s.moon)} shot the moon and ${verb(s.moon, 'take', 'takes')} off 26.`
  }
  const low = Math.min(...s.scoresAfter)
  const leaders = s.scoresAfter.flatMap((score, seat) => (score === low ? [seat] : []))
  const one = leaders.length === 1 && leaders[0] !== view.seat
  return `${capital(listNames(view, leaders))} ${one ? 'has' : 'have'} the fewest points, ${points(low)}.`
}

/** Hearts' own reasons for refusing an action; the shell words the table's. */
export const REJECTIONS: Record<Exclude<RejectReason, TableReject>, string> = {
  notYourTurn: "It isn't your turn.",
  cardNotInHand: "That card isn't in your hand.",
  illegalCard: "That card isn't allowed here.",
}
