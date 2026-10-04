export interface RuleSet {
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
  callTimerSeconds: number
  thuneeWindowSeconds: number
}

export type RuleOverrides = Partial<RuleSet>

export const TRADITIONAL: RuleSet = {
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
  callTimerSeconds: 10,
  thuneeWindowSeconds: 5,
}

/** How the December 2025 app played. */
export const CLASSIC_APP_OVERRIDES: RuleOverrides = {
  thuneeCaller: 'trumperOnly',
  thuneeTrump: 'noTrump',
  thuneeLeader: 'afterCaller',
  thuneeWinner: 'team',
  thuneePartnerCatchBalls: 4,
  jodhiTiming: 'anyTrick',
  jodhiCards: 'dealt',
  lastTrick: 'bonus',
  defaultTrumper: 'teamAhead',
  dealerRotation: 'always',
  khanaak: 'simple',
  khanaakRaisesTarget: true,
  double: false,
  undercutRestriction: false,
  redealIfNoTrumps: false,
  twoPlayerTarget: 105,
}

export function resolveRules(overrides: RuleOverrides): RuleSet {
  return { ...TRADITIONAL, ...overrides }
}

export const CLASSIC_APP: RuleSet = resolveRules(CLASSIC_APP_OVERRIDES)

/** The settings in `rules` that differ from Traditional. */
export function diffRules(rules: RuleSet): RuleOverrides {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(TRADITIONAL) as (keyof RuleSet)[]) {
    if (rules[key] !== TRADITIONAL[key]) out[key] = rules[key]
  }
  return out as RuleOverrides
}

/** Four-player counting target; fixed for every rule set. */
export const FOUR_PLAYER_TARGET = 105
export const CHALLENGE_BALLS = 4
export const TRICK_PAUSE_MS = 2000
export const CALL_AMOUNTS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 104] as const
