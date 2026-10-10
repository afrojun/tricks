import { type CommonRules, diff, resolve } from '../../../kit/rules'
import type { TimerSpec } from '../../../kit/table'

export { TRICK_PAUSE_MS } from '../../../kit/rules'

/** `allowCheating` comes from the kit: with it off, a rule-breaking card or a false Jodhi is refused and nobody may accuse. */
export interface RuleSet extends CommonRules {
  thuneeCaller: 'anyone' | 'trumperOnly'
  thuneeTrump: 'firstCardLed' | 'noTrump'
  thuneeLeader: 'caller' | 'afterCaller'
  thuneeWinner: 'callerOnly' | 'team'
  thuneePartnerCatchBalls: number
  jodhiTiming: 'firstAndThird' | 'anyTrick'
  jodhiCards: 'inHand' | 'dealt'
  lastTrick: 'transfer' | 'bonus'
  defaultTrumper: 'dealerRight' | 'teamAhead'
  dealerRotation: 'stayWhileBehind' | 'always'
  khanaak: 'strict' | 'simple'
  khanaakRaisesTarget: boolean
  double: boolean
  undercutRestriction: boolean
  redealIfNoTrumps: boolean
  ballsToWin: number
  twoToClear: boolean
  twoPlayerTarget: number
}

export type RuleOverrides = Partial<RuleSet>

export const TRADITIONAL: RuleSet = {
  allowCheating: true,
  thuneeCaller: 'anyone',
  thuneeTrump: 'firstCardLed',
  thuneeLeader: 'caller',
  thuneeWinner: 'callerOnly',
  thuneePartnerCatchBalls: 8,
  jodhiTiming: 'firstAndThird',
  jodhiCards: 'inHand',
  lastTrick: 'transfer',
  defaultTrumper: 'dealerRight',
  dealerRotation: 'stayWhileBehind',
  khanaak: 'strict',
  khanaakRaisesTarget: false,
  double: true,
  undercutRestriction: true,
  redealIfNoTrumps: true,
  ballsToWin: 12,
  twoToClear: false,
  twoPlayerTarget: 125,
}

/** The house rules at Tuscans. */
export const TUSCANS_OVERRIDES: RuleOverrides = {
  thuneePartnerCatchBalls: 4,
  jodhiTiming: 'anyTrick',
  undercutRestriction: false,
  twoPlayerTarget: 105,
}

export function resolveRules(overrides: RuleOverrides): RuleSet {
  return resolve(TRADITIONAL, overrides)
}

/** The settings in `rules` that differ from Traditional. */
export function diffRules(rules: RuleSet): RuleOverrides {
  return diff(TRADITIONAL, rules)
}

/**
 * The windows a table's timers may close, which are the table's settings and not rules: calling, and
 * the Thunee window. Without timers each waits until every player has called or passed.
 */
export const TIMERS = {
  call: { default: 10, min: 3, max: 60 },
  thunee: { default: 5, min: 0, max: 30 },
} as const satisfies Record<string, TimerSpec>

export type TimerId = keyof typeof TIMERS

/** Thunee is played by two or four. */
export const SEAT_COUNTS = [2, 4] as const
/** Four-player counting target; fixed for every rule set. */
export const FOUR_PLAYER_TARGET = 105
export const CHALLENGE_BALLS = 4
export const CALL_AMOUNTS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 104] as const
