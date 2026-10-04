/** AI players. They see only a seat's view, play legally, and never bluff. */
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

const HIGH = new Set<Card['rank']>(['J', '9', 'A'])

/** The most this hand of four is willing to call for the right to choose trump. */
export function callLimit(hand: readonly Card[]): number {
  const jacks = hand.filter((c) => c.rank === 'J').length
  const high = hand.filter((c) => HIGH.has(c.rank)).length
  const backedJack = hand.some((j) => j.rank === 'J' && hand.some((c) => c.suit === j.suit && c.rank !== 'J' && HIGH.has(c.rank)))
  if (jacks >= 2) return 30
  if (backedJack) return 20
  if (high >= 3) return 10
  return 0
}

export function bestTrump(hand: readonly Card[], choices: readonly TrumpChoice[]): TrumpChoice {
  const score = (suit: Suit) =>
    hand.filter((c) => c.suit === suit).reduce((sum, c) => sum + 10 + rankStrength(c.rank) * 3, 0)
  const suits = choices.filter((c): c is Suit => c !== 'lastCard')
  return suits.reduce<TrumpChoice>((best, s) => (best === 'lastCard' || score(s) > score(best) ? s : best), 'lastCard')
}

/** Only with a hand that all but guarantees six tricks. */
function wantsThunee(hand: readonly Card[]): boolean {
  return SUITS.some((suit) => {
    const inSuit = hand.filter((c) => c.suit === suit)
    const top = ['J', '9', 'A'].every((r) => inSuit.some((c) => c.rank === r))
    return top && inSuit.length === 5 && hand.some((c) => c.suit !== suit && c.rank === 'J')
  })
}

const lowest = (cards: readonly Card[]) =>
  [...cards].sort((a, b) => CARD_POINTS[a.rank] - CARD_POINTS[b.rank] || rankStrength(a.rank) - rankStrength(b.rank))[0]
const highest = (cards: readonly Card[]) => [...cards].sort((a, b) => rankStrength(b.rank) - rankStrength(a.rank))[0]

function wouldWin(phase: ViewPlaying, me: number, card: Card): boolean {
  return trickWinner([...phase.current, { seat: me, card }], phase.trump) === me
}

function chooseCard(view: View, phase: ViewPlaying, legal: readonly Card[]): Card {
  const me = view.seat!
  if (phase.current.length === 0) {
    if (phase.thunee?.caller === me) return highest(legal)
    const plain = legal.filter((c) => c.suit !== phase.trump)
    const boss = plain.find((c) => c.rank === 'J')
    if (boss) return boss
    return plain.length > 0 ? lowest(plain) : highest(legal)
  }
  const winningSeat = trickWinner(phase.current, phase.trump)
  const partnerWinning = teamOf(winningSeat) === teamOf(me) && phase.thunee?.caller !== winningSeat
  const last = phase.current.length === view.playerCount - 1
  if (partnerWinning) {
    // Feed points to a partner who has the trick, but only when it is safe.
    if (last) return [...legal].sort((a, b) => CARD_POINTS[b.rank] - CARD_POINTS[a.rank])[0]
    return lowest(legal)
  }
  const winners = legal.filter((c) => wouldWin(phase, me, c))
  if (winners.length > 0) return [...winners].sort((a, b) => rankStrength(a.rank) - rankStrength(b.rank))[0]
  return lowest(legal)
}

/** A special call the view proves will succeed: only when playing last to the final trick. */
function sureSpecialCall(view: View, phase: ViewPlaying, card: Card): Action | null {
  const me = view.seat!
  const can = availableActions(view)
  if (phase.current.length !== view.playerCount - 1 || !wouldWin(phase, me, card)) return null
  if (can.callDouble) return { type: 'callDouble' }
  if (can.callKhanaak) {
    const team = teamOf(me)
    const points = (t: number) =>
      phase.tricks.filter((x) => teamOf(x.winner) === t).reduce((s, x) => s + x.plays.reduce((p, y) => p + CARD_POINTS[y.card.rank], 0), 0)
    const jodhi = (t: number) => phase.jodhiClaims.filter((j) => teamOf(j.seat) === t).reduce((s, j) => s + j.points, 0)
    const lostATrick = phase.tricks.some((t) => teamOf(t.winner) !== team)
    const ok =
      view.rules.khanaak === 'strict'
        ? lostATrick && jodhi(team) + 10 > points(1 - team) + jodhi(1 - team)
        : points(1 - team) < jodhi(team) + 10
    if (ok) return { type: 'callKhanaak' }
  }
  return null
}

/** The action an AI seat takes when it is one of the seats to act. */
export function chooseAction(view: View): Action {
  const can = availableActions(view)
  const phase = view.phase
  switch (phase.kind) {
    case 'calling': {
      const amount = can.calls[0]
      if (amount !== undefined && amount <= callLimit(phase.hand)) return { type: 'call', amount }
      return { type: 'pass' }
    }
    case 'trumpSelection':
      return { type: 'chooseTrump', choice: bestTrump(phase.hand, can.chooseTrump) }
    case 'thuneeWindow':
      return can.callThunee && wantsThunee(phase.hand) ? { type: 'callThunee' } : { type: 'pass' }
    case 'playing': {
      const card = chooseCard(view, phase, can.legal)
      return sureSpecialCall(view, phase, card) ?? { type: 'playCard', card }
    }
    default:
      return fallbackAction(view)
  }
}

/** A Jodhi the seat really holds and may claim now, if any. */
export function chooseJodhi(view: View): Action | null {
  const phase = view.phase
  if (view.seat === null || (phase.kind !== 'playing' && phase.kind !== 'trickPause')) return null
  const me = view.seat
  const ownPlays = phase.tricks.filter((t) => t.half === phase.half).flatMap((t) => t.plays).filter((p) => p.seat === me)
  const cards = view.rules.jodhiCards === 'inHand' ? phase.hand : [...phase.hand, ...ownPlays.map((p) => p.card)]
  for (const suit of availableActions(view).claimJodhi) {
    if (holdsJodhi(cards, suit, false)) return { type: 'claimJodhi', suit, withJack: holdsJodhi(cards, suit, true) }
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
