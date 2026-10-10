import type { Suit } from '../../../kit/cards'
import { partnerOf } from '../../../kit/partners'
import type { Seat, TableReject } from '../../../kit/table'
import { seatName } from '../../../ui/text'
import { type Call, type Card, type RejectReason, type RoundSummary, type View, type ViewPlaying, seatsOf, strength, suitOf } from '../engine'

/** Red and black in turn, spades at the right, so neighbouring suits are told apart in a long row. */
const HAND_ORDER: readonly Suit[] = ['hearts', 'clubs', 'diamonds', 'spades']

/** Display order only: grouped by the suit each card plays as, the colours alternating, highest first. */
export function sortHand(hand: readonly Card[], jokers: boolean): Card[] {
  const of = suitOf(jokers)
  const rank = strength(jokers)
  return [...hand].sort((a, b) => HAND_ORDER.indexOf(of(a)) - HAND_ORDER.indexOf(of(b)) || rank(b) - rank(a))
}

/** "You" for the viewer, otherwise the seat's name. */
export function nameFor(view: View, seat: Seat): string {
  return seat === view.seat ? 'You' : seatName(view, seat)
}

/** A side's name: "You and Priya" or "Asha and Chan" with four, a player's name otherwise. The viewer's partner second. */
export function sideName(view: View, side: number): string {
  const seats = seatsOf(side, view.playerCount)
  const mine = view.seat !== null && seats.includes(view.seat)
  const ordered = mine ? [view.seat!, ...seats.filter((s) => s !== view.seat)] : seats
  return ordered.map((s) => (s === view.seat ? 'You' : seatName(view, s))).join(' and ')
}

/**
 * A side as a sentence's subject: "Your side" for the viewer and a partner, "You" for the viewer alone, otherwise
 * its name. `many` when its verb is plural: "You are", "Asha and Chan are", but "Your side is", "Asha is".
 */
export function sideSubject(view: View, side: number): { name: string; many: boolean } {
  const seats = seatsOf(side, view.playerCount)
  if (view.seat !== null && seats.includes(view.seat)) return seats.length > 1 ? { name: 'Your side', many: false } : { name: 'You', many: true }
  return { name: sideName(view, side), many: seats.length > 1 }
}

/** Sides as one subject: "Both sides", "You and Asha", "Your side". `many` as for `sideSubject`. */
export function sidesSubject(view: View, sides: readonly number[]): { name: string; many: boolean } {
  if (sides.length === 1) return sideSubject(view, sides[0])
  if (view.playerCount === 4) return { name: 'Both sides', many: true }
  const names = sides.map((side, i) => (i === 0 ? sideSubject(view, side).name : midSentence(sideSubject(view, side).name)))
  return { name: `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`, many: true }
}

/** A name or a side's name inside a sentence: "You" and "Your" in lower case, anyone else's name as it is. */
export function midSentence(name: string): string {
  return name.replace(/^(You|Your)(?= |$)/, (word) => word.toLowerCase())
}

/** "Your" for the viewer, otherwise "Asha’s". */
function whose(view: View, seat: Seat): string {
  return seat === view.seat ? 'Your' : `${seatName(view, seat)}’s`
}

/** A number of points, with a true minus sign. */
export function points(n: number): string {
  return n < 0 ? `−${-n}` : String(n)
}

/** "+50", "−40", "0". */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : points(n)
}

/** "3 points", "1 point", "−10 points". */
export function pointsWord(n: number): string {
  return `${points(n)} point${Math.abs(n) === 1 ? '' : 's'}`
}

export function trickWord(n: number): string {
  return `${n} trick${n === 1 ? '' : 's'}`
}

/** A call as a player says it: "4", "Nil", "Blind nil". */
export function callText(call: Call): string {
  if (call.tricks > 0) return String(call.tricks)
  return call.blind ? 'Blind nil' : 'Nil'
}

/** A seat's line through the round: "2 of 4", "Nil", "Nil broken", or a dash before its call. */
export function tally(phase: { calls: readonly (Call | null)[]; taken?: readonly number[]; nilFailed?: readonly boolean[] }, seat: Seat): { text: string; broken: boolean } {
  const call = phase.calls[seat]
  if (!call) return { text: '–', broken: false }
  const taken = phase.taken?.[seat] ?? 0
  if (call.tricks === 0) {
    const broken = taken > 0 || (phase.nilFailed?.[seat] ?? false)
    return { text: `${callText(call)}${broken ? ' broken' : ''}`, broken }
  }
  return { text: phase.taken ? `${taken} of ${call.tricks}` : callText(call), broken: false }
}

/** The line over the hand: what to do now, or whom the table is waiting on. `mine` when it is the viewer's move. */
export function hint(view: View): { text: string; mine: boolean } | null {
  const phase = view.phase
  const me = view.seat
  switch (phase.kind) {
    case 'drawing':
      return phase.turn === me ? { text: 'Your draw', mine: true } : { text: `${seatName(view, phase.turn)} to draw`, mine: false }
    case 'calling':
      if (me !== null && !phase.looked[me] && phase.turn !== me) return { text: 'Your cards are face down', mine: false }
      return phase.turn === me ? { text: 'Your call', mine: true } : { text: `${seatName(view, phase.turn)} to call`, mine: false }
    case 'exchanging': {
      if (phase.turn !== me) return { text: `${seatName(view, phase.turn)} to give two cards`, mine: false }
      const to = me === phase.exchange.blind ? partnerOf(me, view.playerCount)! : phase.exchange.blind
      return { text: `Pick two cards for ${seatName(view, to)}`, mine: true }
    }
    case 'playing':
      if (phase.turn !== me) return { text: `${seatName(view, phase.turn!)} to play`, mine: false }
      return { text: phase.current.length === 0 ? 'Your lead' : 'Your turn', mine: true }
    case 'roundResult':
      return { text: `Round ${view.roundNumber} is over`, mine: false }
    default:
      return null
  }
}

/** Why each rule-breaking play is wrong, for the verdict: "<name> …". */
export const BROKE: Record<string, string> = {
  followSuit: 'did not follow suit',
  spadesLead: 'led a spade before spades were broken',
}

/** How each rule-breaking play was caught: "Asha caught you <…>". */
const CAUGHT: Record<string, string> = {
  followSuit: 'not following suit',
  spadesLead: 'leading a spade before spades were broken',
}

/** The round in a sentence, for the result and the end of the game. */
export function headline(view: View, summary: RoundSummary): string {
  const c = summary.challenge
  if (c) {
    const accused = midSentence(nameFor(view, c.accused))
    const challenger = nameFor(view, c.challenger)
    if (c.guilty) return `${challenger} caught ${accused} ${CAUGHT[c.rule ?? ''] ?? 'breaking a rule'}.`
    return `${challenger} challenged ${accused}, ${c.accused === view.seat ? 'but you' : 'who'} played by the rules.`
  }
  const lines: string[] = []
  summary.sides.forEach((side, i) => {
    for (const nil of side.nils) {
      const what = nil.blind ? 'Blind nil' : 'Nil'
      if (nil.points > 0) lines.push(`${nameFor(view, nil.seat)} made ${what}.`)
      else lines.push(`${whose(view, nil.seat)} ${what} was ${nil.failed ? 'lost to a challenge' : 'broken'}.`)
    }
    const who = sideSubject(view, i)
    if (side.contract > 0 && !side.made) lines.push(`${who.name} ${who.many ? 'were' : 'was'} set.`)
    if (side.bagPenalty < 0) lines.push(`${who.name} lost ${-side.bagPenalty} for bags.`)
  })
  return lines.length > 0 ? lines.join(' ') : 'Every call was made.'
}

/** The cards just given to the viewer in a Blind nil exchange, marked until the viewer plays a card. */
export function newCards(view: View, phase: ViewPlaying): Card[] {
  const exchange = phase.exchange
  if (exchange === null || view.seat === null || phase.tricks.length > 0 || phase.current.some((p) => p.seat === view.seat)) return []
  const mine = view.seat === exchange.blind ? exchange.returned : exchange.gave
  return mine ?? []
}

export const REJECTIONS: Record<Exclude<RejectReason, TableReject>, string> = {
  notYourTurn: 'It isn’t your turn.',
  cardNotInHand: 'That card isn’t in your hand.',
  illegalCard: 'That card isn’t allowed here.',
  badCall: 'That call isn’t open to you.',
}
