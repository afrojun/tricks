/** AI players. They see only a seat's view; whether they cheat depends on their persona. */
import {
  type Action,
  type Card,
  type Suit,
  type TrumpChoice,
  type View,
  type ViewPlaying,
  CARD_POINTS,
  SUITS,
  availableActions,
  holdsJodhi,
  rankStrength,
  teamOf,
  trickWinner,
} from '../engine'
import { chooseBluff, chooseCheat, holdBack } from './cheat'
import { type Mind, TRAITS } from '../../../kit/mind'
import { rivals, shownVoid, sureLead, touching, unseen, wouldWin } from './read'
import type { Decision, Reason } from './reasons'

const HIGH = new Set<Card['rank']>(['J', '9', 'A'])

/** What a hand of four is worth when calling: its jacks, high cards, and the most it will call. */
export function handStrength(hand: readonly Card[]) {
  const jacks = hand.filter((c) => c.rank === 'J').length
  const high = hand.filter((c) => HIGH.has(c.rank)).length
  const backedJack = hand.some((j) => j.rank === 'J' && hand.some((c) => c.suit === j.suit && c.rank !== 'J' && HIGH.has(c.rank)))
  const limit = jacks >= 2 ? 30 : backedJack ? 20 : high >= 3 ? 10 : 0
  return { jacks, backedJack, high, limit }
}

/** The most this hand of four is willing to call for the right to choose trump. */
export function callLimit(hand: readonly Card[]): number {
  return handStrength(hand).limit
}

export function bestTrump(hand: readonly Card[], choices: readonly TrumpChoice[]): TrumpChoice {
  const score = (suit: Suit) =>
    hand.filter((c) => c.suit === suit).reduce((sum, c) => sum + 10 + rankStrength(c.rank) * 3, 0)
  const suits = choices.filter((c): c is Suit => c !== 'lastCard')
  return suits.reduce<TrumpChoice>((best, s) => (best === 'lastCard' || score(s) > score(best) ? s : best), 'lastCard')
}

/** The suit of a hand that all but guarantees six tricks, if it has one. */
function thuneeSuit(hand: readonly Card[]): Suit | undefined {
  return SUITS.find((suit) => {
    const inSuit = hand.filter((c) => c.suit === suit)
    const top = ['J', '9', 'A'].every((r) => inSuit.some((c) => c.rank === r))
    return top && inSuit.length === 5 && hand.some((c) => c.suit !== suit && c.rank === 'J')
  })
}

const lowest = (cards: readonly Card[]) =>
  [...cards].sort((a, b) => CARD_POINTS[a.rank] - CARD_POINTS[b.rank] || rankStrength(a.rank) - rankStrength(b.rank))[0]
const highest = (cards: readonly Card[]) => [...cards].sort((a, b) => rankStrength(b.rank) - rankStrength(a.rank))[0]

type CardChoice = { card: Card; reason: Reason; alternatives?: Card[] }

function chooseCard(view: View, phase: ViewPlaying, legal: readonly Card[]): CardChoice {
  const me = view.seat!
  const as = (code: Extract<Reason, { card: Card }>['code'], card: Card, alternatives?: Card[]): CardChoice => ({ card, reason: { code, card }, alternatives })
  const thunee = phase.thunee
  const callerOnly = thunee !== null && view.rules.thuneeWinner === 'callerOnly'
  // A trick the caller's partner wins ends the Thunee, so the partner never tries to, and sheds the
  // high cards that could later be forced to win one.
  if (callerOnly && thunee.caller !== me && teamOf(thunee.caller) === teamOf(me)) {
    const under = phase.current.length === 0 ? [] : legal.filter((c) => !wouldWin(phase, me, c))
    // The highest first, and trumps before other suits at the same rank: the caller leads trumps first.
    const shed = [...under].sort((a, b) => rankStrength(b.rank) - rankStrength(a.rank) || Number(b.suit === phase.trump) - Number(a.suit === phase.trump))[0]
    return as('keepOffThunee', shed ?? lowest(legal))
  }
  if (phase.current.length === 0) {
    if (thunee?.caller === me) return thuneeLead(view, phase, legal)
    const plain = legal.filter((c) => c.suit !== phase.trump)
    const boss = plain.find((c) => c.rank === 'J')
    if (boss) return as('leadBoss', boss)
    return plain.length > 0 ? as('leadLow', lowest(plain)) : as('leadTrump', highest(legal))
  }
  const winningSeat = trickWinner(phase.current, phase.trump)
  // The caller of a Thunee that only they may win treats their partner as one more card to beat.
  const partnerWinning = teamOf(winningSeat) === teamOf(me) && !(callerOnly && thunee.caller === me)
  const last = phase.current.length === view.playerCount - 1
  if (partnerWinning) {
    // Stay under a partner who has the trick: never cut it with a trump while another card stays under.
    const under = legal.filter((c) => !wouldWin(phase, me, c))
    if (under.length === 0) return as('cheapOvertake', lowest(legal))
    // Feed points to a partner who has the trick, but only when it is safe.
    if (last) return as('feedPartner', [...under].sort((a, b) => CARD_POINTS[b.rank] - CARD_POINTS[a.rank])[0])
    return as('holdUnderPartner', lowest(under))
  }
  const winners = legal.filter((c) => wouldWin(phase, me, c))
  if (winners.length > 0) return as('cheapestWinner', [...winners].sort((a, b) => rankStrength(a.rank) - rankStrength(b.rank))[0])
  return as('cannotWin', lowest(legal))
}

/** The caller of a Thunee leads: set trump with the longest suit, draw the other side's trumps, then lead cards nobody can beat. */
function thuneeLead(view: View, phase: ViewPlaying, legal: readonly Card[]): CardChoice {
  const me = view.seat!
  const sure = legal.filter((c) => sureLead(view, phase, me, c))
  // Only winning tricks counts. When every card is sure to win, any order wins them all; otherwise only
  // cards with nothing unseen between them are interchangeable.
  const as = (code: Extract<Reason, { card: Card }>['code'], card: Card): CardChoice => {
    const same = sure.length === legal.length ? [...legal] : touching(phase, legal, card)
    return { card, reason: { code, card }, alternatives: same.length > 1 ? same : undefined }
  }
  if (phase.trump === null && !phase.trumpRevealed && view.rules.thuneeTrump === 'firstCardLed') {
    // This card makes its suit trump.
    const suits = SUITS.map((suit) => legal.filter((c) => c.suit === suit)).filter((cards) => cards.length > 0)
    const longest = suits.sort((a, b) => b.length - a.length || rankStrength(highest(b).rank) - rankStrength(highest(a).rank))[0]
    // The suit matters here: it becomes trump.
    return { card: highest(longest), reason: { code: 'thuneeSetTrump', card: highest(longest) } }
  }
  const trump = phase.trump
  const trumps = legal.filter((c) => c.suit === trump)
  const voids = shownVoid(phase)
  const theyMayHoldTrump = trump !== null && unseen(phase).some((c) => c.suit === trump) && rivals(view, phase, me).some((s) => !voids.get(s)?.has(trump))
  if (theyMayHoldTrump && trumps.length > 0) return as('thuneeDrawTrumps', highest(trumps))
  if (sure.length > 0) return as('thuneeSureLead', highest(sure))
  return as('thuneeLeadHigh', highest(legal))
}

/** A special call the view proves will succeed: only when playing last to the final trick. */
function sureSpecialCall(view: View, phase: ViewPlaying, card: Card): Decision | null {
  const me = view.seat!
  const can = availableActions(view)
  if (phase.current.length !== view.playerCount - 1 || !wouldWin(phase, me, card)) return null
  // These sums need every card played; a view that has forgotten earlier tricks cannot make them.
  const remembersAll = phase.tricks.every((t) => t.plays.length > 0)
  if (can.callDouble) return { action: { type: 'callDouble' }, reason: { code: 'sureDouble' } }
  if (can.callKhanaak && remembersAll) {
    const team = teamOf(me)
    const points = (t: number) =>
      phase.tricks.filter((x) => teamOf(x.winner) === t).reduce((s, x) => s + x.plays.reduce((p, y) => p + CARD_POINTS[y.card.rank], 0), 0)
    const jodhi = (t: number) => phase.jodhiClaims.filter((j) => teamOf(j.seat) === t).reduce((s, j) => s + j.points, 0)
    const lostATrick = phase.tricks.some((t) => teamOf(t.winner) !== team)
    const ok =
      view.rules.khanaak === 'strict'
        ? lostATrick && jodhi(team) + 10 > points(1 - team) + jodhi(1 - team)
        : points(1 - team) < jodhi(team) + 10
    if (ok) return { action: { type: 'callKhanaak' }, reason: { code: 'sureKhanaak' } }
  }
  return null
}

/** The action an AI seat takes when it is one of the seats to act. */
export function chooseAction(view: View, mind: Mind): Action {
  return decide(view, mind).action
}

/** The action an AI seat takes, and why. */
export function decide(view: View, mind: Mind): Decision {
  const can = availableActions(view)
  const phase = view.phase
  switch (phase.kind) {
    case 'calling': {
      const amount = can.calls[0]
      const strength = handStrength(phase.hand)
      if (amount !== undefined && amount <= strength.limit) return { action: { type: 'call', amount }, reason: { code: 'callStrong', ...strength } }
      return { action: { type: 'pass' }, reason: { code: 'passWeak', ...strength } }
    }
    case 'trumpSelection': {
      const choice = bestTrump(phase.hand, can.chooseTrump)
      const reason: Reason =
        choice === 'lastCard' ? { code: 'lastCard' } : { code: 'strongestSuit', suit: choice, cards: phase.hand.filter((c) => c.suit === choice) }
      return { action: { type: 'chooseTrump', choice }, reason }
    }
    case 'thuneeWindow': {
      const suit = thuneeSuit(phase.hand)
      if (can.callThunee && suit) return { action: { type: 'callThunee' }, reason: { code: 'thuneeSure', suit } }
      return { action: { type: 'pass' }, reason: { code: 'thuneeUnsafe' } }
    }
    case 'trickPause': {
      // Nothing proves an opponent hid a trump, so let the cards be dealt again.
      if (phase.redeal) return { action: { type: 'pass' }, reason: { code: 'dealAgain' } }
      // Only asked while the pause waits on this seat's Jodhi; a computer playing for a person answers it.
      const claim = chooseJodhi(view, mind)
      if (claim) return { action: claim, reason: { code: 'fallback' } }
      return { action: { type: 'pass' }, reason: { code: 'noJodhi' } }
    }
    case 'playing': {
      const cheats = TRAITS[mind.persona].cheats !== 'never'
      const honest = chooseCard(view, phase, cheats ? holdBack(view, phase, can.legal) : can.legal)
      // Never a cheat that could take a trick from a partner's Thunee.
      const cheat = honest.reason.code === 'keepOffThunee' ? null : chooseCheat(view, phase, honest.card, mind)
      const choice: CardChoice = cheat ? { card: cheat, reason: { code: 'fallback' } } : honest
      return sureSpecialCall(view, phase, choice.card) ?? { action: { type: 'playCard', card: choice.card }, reason: choice.reason, alternatives: choice.alternatives }
    }
    default:
      return { action: fallbackAction(view), reason: { code: 'fallback' } }
  }
}

/** A Jodhi the seat may claim now: a real one, or for cheating personas sometimes a bluff. */
export function chooseJodhi(view: View, mind: Mind): Action | null {
  const phase = view.phase
  if (view.seat === null || (phase.kind !== 'playing' && phase.kind !== 'trickPause')) return null
  const me = view.seat
  const ownPlays = phase.tricks.filter((t) => t.half === phase.half).flatMap((t) => t.plays).filter((p) => p.seat === me)
  const cards = view.rules.jodhiCards === 'inHand' ? phase.hand : [...phase.hand, ...ownPlays.map((p) => p.card)]
  const open = availableActions(view).claimJodhi
  for (const suit of open) {
    if (holdsJodhi(cards, suit, false)) return { type: 'claimJodhi', suit, withJack: holdsJodhi(cards, suit, true) }
  }
  return chooseBluff(view, phase, open, mind)
}

/** Always valid for a seat that is to act; used if `chooseAction` is ever rejected. */
export function fallbackAction(view: View): Action {
  const can = availableActions(view)
  if (can.chooseTrump.length > 0) return { type: 'chooseTrump', choice: can.chooseTrump[0] }
  if (can.legal.length > 0) return { type: 'playCard', card: can.legal[0] }
  if (can.play.length > 0) return { type: 'playCard', card: can.play[0] }
  return { type: 'pass' }
}
