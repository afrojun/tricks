import { type CommonRules, diff, resolve } from '../../../kit/rules'
import type { Seat } from '../../../kit/table'

export interface SpadesRules extends CommonRules {
  /** A round that ends with any side at this or more ends the game; 100 to 1000. */
  gameEndsAt: number
  /** A round that leaves any side at `LOSING_SCORE` or below also ends the game, so sides far behind cannot play on for ever. */
  losingScore: boolean
  /** A player may call Nil: to take no tricks, for 100. */
  nil: boolean
  /** A player whose side trails every other by 100 may call Nil before looking at the hand, for 200. Needs `nil`, and three or four players. */
  blindNil: boolean
  /** Ten bags cost a side 100. */
  bagPenalty: boolean
  /** With four players, who leads the first trick: the player left of the dealer, or whoever holds the lowest club, which they must lead. */
  firstLead: 'left' | 'lowestClub'
  /** What a caught renege costs: the side is set and the round ends, or the side's contract rises by three and play goes on. */
  renege: 'set' | 'bidPlusThree'
  /** Two jokers, the two of diamonds and the two of spades are the top four trumps; the twos of clubs and hearts leave the deck. */
  jokers: boolean
}

export type RuleOverrides = Partial<SpadesRules>

export const STANDARD: SpadesRules = {
  allowCheating: true,
  gameEndsAt: 500,
  losingScore: false,
  nil: true,
  blindNil: false,
  bagPenalty: true,
  firstLead: 'left',
  renege: 'set',
  jokers: false,
}

export const JOKERS_OVERRIDES: RuleOverrides = { jokers: true }

export function resolveRules(overrides: RuleOverrides): SpadesRules {
  return resolve(STANDARD, overrides)
}

/** The settings in `rules` that differ from Standard. */
export function diffRules(rules: SpadesRules): RuleOverrides {
  return diff(STANDARD, rules)
}

export const JOKERS: SpadesRules = resolveRules(JOKERS_OVERRIDES)

export const SEAT_COUNTS = [2, 3, 4] as const
/** A table starts at four, in two partnerships. */
export const DEFAULT_PLAYERS = 4

/** Thirteen each, but seventeen with three. */
export function handSize(playerCount: number): number {
  return playerCount === 3 ? 17 : 13
}

/** The cards Blind nil gives each way between partners. */
export const EXCHANGE_SIZE = 2
/** How far a side must trail every other to call Blind nil. */
export const BLIND_NIL_BEHIND = 100
/** What Nil and Blind nil win or lose. */
export const NIL_POINTS = 100
export const BLIND_NIL_POINTS = 200
/** The score at or below which a side loses, under `losingScore`. */
export const LOSING_SCORE = -200
/** Tricks a "Bid plus three" penalty adds to a contract. */
export const RENEGE_TRICKS = 3
/** Bags that cost a side `BAG_PENALTY` each time its count reaches a multiple. */
export const BAGS_PER_PENALTY = 10
export const BAG_PENALTY = 100

// ── Sides ────────────────────────────────────────────────────────────────

/** How many sides play: two partnerships with four players, otherwise each player alone. */
export function sideCount(playerCount: number): number {
  return playerCount === 4 ? 2 : playerCount
}

/** The side a seat plays for: seats 0 and 2 against 1 and 3 with four, otherwise its own. */
export function sideOf(seat: Seat, playerCount: number): number {
  return playerCount === 4 ? seat % 2 : seat
}

/** The seats of a side, in seat order. */
export function seatsOf(side: number, playerCount: number): Seat[] {
  return playerCount === 4 ? [side, side + 2] : [side]
}

/**
 * Whether a seat's side may call Blind nil this round: the rule is on, with Nil, at a table of three or four, and
 * the side's score is at least 100 below every other side's. Scores change only between rounds, so this holds
 * for the whole round. With four, only one partner may call it; the caller checks that.
 */
export function blindNilOpen(rules: Pick<SpadesRules, 'nil' | 'blindNil'>, playerCount: number, scores: readonly number[], seat: Seat): boolean {
  if (!rules.nil || !rules.blindNil || playerCount < 3) return false
  const mine = sideOf(seat, playerCount)
  return scores.every((score, side) => side === mine || score - scores[mine] >= BLIND_NIL_BEHIND)
}
