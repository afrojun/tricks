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
import { chooseCheat, holdBack } from './cheat'
import { type Mind, TRAITS, roll } from '../kit/mind'
import { history, wouldWin } from './read'
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

type CardChoice = { card: Card; reason: Reason }

function chooseCard(view: View, phase: ViewPlaying, legal: readonly Card[]): CardChoice {
  const me = view.seat!
  const as = (code: Extract<Reason, { card: Card }>['code'], card: Card): CardChoice => ({ card, reason: { code, card } })
  if (phase.current.length === 0) {
    if (phase.thunee?.caller === me) return as('thuneeLeadHigh', highest(legal))
    const plain = legal.filter((c) => c.suit !== phase.trump)
    const boss = plain.find((c) => c.rank === 'J')
    if (boss) return as('leadBoss', boss)
    return plain.length > 0 ? as('leadLow', lowest(plain)) : as('leadTrump', highest(legal))
  }
  const winningSeat = trickWinner(phase.current, phase.trump)
  const partnerWinning = teamOf(winningSeat) === teamOf(me) && phase.thunee?.caller !== winningSeat
  const last = phase.current.length === view.playerCount - 1
  if (partnerWinning) {
    // Feed points to a partner who has the trick, but only when it is safe.
    if (last) return as('feedPartner', [...legal].sort((a, b) => CARD_POINTS[b.rank] - CARD_POINTS[a.rank])[0])
    const cheapest = lowest(legal)
    return as(wouldWin(phase, me, cheapest) ? 'cheapOvertake' : 'holdUnderPartner', cheapest)
  }
  const winners = legal.filter((c) => wouldWin(phase, me, c))
  if (winners.length > 0) return as('cheapestWinner', [...winners].sort((a, b) => rankStrength(a.rank) - rankStrength(b.rank))[0])
  return as('cannotWin', lowest(legal))
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
    case 'playing': {
      const careful = TRAITS[mind.persona].cheats === 'careful'
      const honest = chooseCard(view, phase, careful ? holdBack(view, phase, can.legal) : can.legal)
      const cheat = chooseCheat(view, phase, honest.card, mind)
      const choice: CardChoice = cheat ? { card: cheat, reason: { code: 'fallback' } } : honest
      return sureSpecialCall(view, phase, choice.card) ?? { action: { type: 'playCard', card: choice.card }, reason: choice.reason }
    }
    default:
      return { action: fallbackAction(view), reason: { code: 'fallback' } }
  }
}

const BLUFF_CHANCE = 0.5

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

  // A bluff needs one of the pair in hand. Sly also needs the other unseen and bluffs once a round;
  // Wild ignores the risk.
  const { cheats } = TRAITS[mind.persona]
  if (cheats === 'never') return null
  const careful = cheats === 'careful'
  if (careful && phase.jodhiClaims.some((j) => j.seat === me)) return null
  const played = history(phase).flatMap((t) => t.plays.map((p) => p.card))
  for (const suit of open) {
    const pair = (c: Card) => c.suit === suit && (c.rank === 'K' || c.rank === 'Q')
    if (phase.hand.filter(pair).length !== 1 || (careful && played.some(pair))) continue
    if (roll(mind.salt, me, `bluff:${phase.tricks.length}:${suit}`) < BLUFF_CHANCE) return { type: 'claimJodhi', suit, withJack: false }
  }
  return null
}

/** Always valid for a seat that is to act; used if `chooseAction` is ever rejected. */
export function fallbackAction(view: View): Action {
  const can = availableActions(view)
  if (can.chooseTrump.length > 0) return { type: 'chooseTrump', choice: can.chooseTrump[0] }
  if (can.legal.length > 0) return { type: 'playCard', card: can.legal[0] }
  if (can.play.length > 0) return { type: 'playCard', card: can.play[0] }
  return { type: 'pass' }
}
