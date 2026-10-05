import { type CommonRules, diff, resolve } from '../../../kit/rules'
import type { Seat } from '../../../kit/table'

export interface HeartsRules extends CommonRules {
  /** A round that ends with any score at this or more ends the game; 25 to 500. */
  gameEndsAt: number
  passing: 'rotating' | 'left' | 'none'
  /** Shooting the moon: everyone else scores 26, or the shooter scores -26. */
  moon: 'othersAdd' | 'shooterSubtracts'
  /** The jack of diamonds is worth -10 to whoever takes it. */
  jackOfDiamonds: boolean
  /** The queen of spades breaks hearts as a heart does. */
  queenBreaksHearts: boolean
  /** Drops the first-trick rule: hearts and the queen of spades may be played to the first trick. */
  pointsOnFirstTrick: boolean
}

export type RuleOverrides = Partial<HeartsRules>

export const STANDARD: HeartsRules = {
  allowCheating: true,
  gameEndsAt: 100,
  passing: 'rotating',
  moon: 'othersAdd',
  jackOfDiamonds: false,
  queenBreaksHearts: false,
  pointsOnFirstTrick: false,
}

export const OMNIBUS_OVERRIDES: RuleOverrides = { jackOfDiamonds: true }

export function resolveRules(overrides: RuleOverrides): HeartsRules {
  return resolve(STANDARD, overrides)
}

/** The settings in `rules` that differ from Standard. */
export function diffRules(rules: HeartsRules): RuleOverrides {
  return diff(STANDARD, rules)
}

export const OMNIBUS: HeartsRules = resolveRules(OMNIBUS_OVERRIDES)

export const SEAT_COUNTS = [4] as const
export const PLAYERS = 4
export const HAND_SIZE = 13
export const PASS_SIZE = 3
/** What a challenge costs: the accused when guilty, the accuser when not. */
export const CHALLENGE_POINTS = 26
/** The points of hearts and the queen of spades in every round; taking them all shoots the moon. */
export const MOON_POINTS = 26

export type PassDirection = 'left' | 'right' | 'across' | 'none'
const ROTATION: readonly PassDirection[] = ['left', 'right', 'across', 'none']

/** Which way cards are passed in a round. Before the first round, the first round's way. */
export function passDirection(rules: Pick<HeartsRules, 'passing'>, roundNumber: number): PassDirection {
  if (rules.passing === 'none') return 'none'
  if (rules.passing === 'left') return 'left'
  return ROTATION[(Math.max(1, roundNumber) - 1) % ROTATION.length]
}

const STEPS = { left: 1, across: 2, right: 3 } as const

/** Who receives `seat`'s cards. Seats are numbered clockwise, so the next seat is the player on the left. */
export function passTarget(seat: Seat, direction: Exclude<PassDirection, 'none'>): Seat {
  return (seat + STEPS[direction]) % PLAYERS
}
