/** Rule checks shared by the engine (on full state) and availableActions (on a view). */
import { type Card, type Suit, SUITS } from './cards'
import { CALL_AMOUNTS, type RuleSet } from './rules'
import { type Seat, type Team, partnerOf, teamOf } from './seats'
import type { TrumpChoice } from './types'

export interface CallState {
  defaultTrumper: Seat
  call: { seat: Seat; amount: number } | null
  passed: Seat[]
}

/** Whether `seat` may still make a call in this calling window. */
export function mayCall(seat: Seat, s: CallState): boolean {
  if (s.passed.includes(seat)) return false
  if (callAmounts(s).length === 0) return false
  if (s.call === null) return seat !== s.defaultTrumper
  return teamOf(seat) !== teamOf(s.call.seat)
}

export function callAmounts(s: CallState): number[] {
  const current = s.call?.amount ?? 0
  return CALL_AMOUNTS.filter((a) => a > current)
}

/** The seat that will choose trump if the window closed now. */
export function prospectiveTrumper(s: CallState): Seat {
  return s.call?.seat ?? s.defaultTrumper
}

/** Trump may be a suit held among the first four cards, or the last card dealt. */
export function trumpChoices(hand: readonly Card[]): TrumpChoice[] {
  const held = SUITS.filter((suit) => hand.some((c) => c.suit === suit))
  return [...held, 'lastCard']
}

export function holdsSixOfOneSuit(hand: readonly Card[]): boolean {
  return hand.length === 6 && hand.every((c) => c.suit === hand[0].suit)
}

export function thuneeEligible(seat: Seat, hand: readonly Card[], trumper: Seat, rules: RuleSet): boolean {
  if (rules.thuneeCaller === 'trumperOnly' && seat !== trumper) return false
  return !holdsSixOfOneSuit(hand)
}

/** Whether winning a trick now opens a Jodhi claim, given the team's tricks won this half (including it). */
export function jodhiTimingOk(teamTricksWon: number, rules: RuleSet): boolean {
  return rules.jodhiTiming === 'anyTrick' || teamTricksWon === 1 || teamTricksWon === 3
}

/**
 * Whether a computer's lead waits, without timers, for its partner to call Jodhi or say no, once its
 * side has opened a claim: only when that partner is a person. A person leading needs no wait, since
 * the claim stays open until they lead; nor does a game with timers, or one without partners.
 */
export function jodhiWaits(seats: readonly { kind: string; standIn: boolean }[], playerCount: number, rules: Pick<RuleSet, 'timers'>, openFor: Team | null, leader: Seat): boolean {
  const partner = partnerOf(leader, playerCount)
  if (rules.timers || openFor === null || partner === null) return false
  return (seats[leader].kind === 'ai' || seats[leader].standIn) && seats[partner].kind === 'human'
}

/** Who a trick pause with no deadline waits on: the partner of the trick's winner, who leads next. */
export function jodhiWaitingOn(deadline: number | null, tricks: readonly { winner: Seat }[], playerCount: number): Seat[] {
  const last = tricks[tricks.length - 1]
  const partner = deadline === null && last ? partnerOf(last.winner, playerCount) : null
  return partner === null ? [] : [partner]
}

export function jodhiPoints(suit: Suit, withJack: boolean, trump: Suit | null): number {
  return (suit === trump ? 40 : 20) + (withJack ? 10 : 0)
}

export function holdsJodhi(cards: readonly Card[], suit: Suit, withJack: boolean): boolean {
  const has = (rank: Card['rank']) => cards.some((c) => c.suit === suit && c.rank === rank)
  return has('K') && has('Q') && (!withJack || has('J'))
}

export function ballsTarget(rules: RuleSet, khanaakCalled: boolean): number {
  return rules.ballsToWin + (rules.khanaakRaisesTarget && khanaakCalled ? 1 : 0)
}

export function winningTeam(balls: readonly [number, number], target: number, rules: RuleSet): Team | null {
  for (const team of [0, 1] as const) {
    const lead = balls[team] - balls[1 - team]
    if (balls[team] >= target && (!rules.twoToClear || lead >= 2)) return team
  }
  return null
}
