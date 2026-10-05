import { z } from 'zod'
import { tableActionSchemas } from '../kit/table'
import { CALL_AMOUNTS, type RuleOverrides, SEAT_COUNTS } from './rules'
import type { Action } from './types'

const suit = z.enum(['hearts', 'diamonds', 'clubs', 'spades'])
const rank = z.enum(['J', '9', 'A', '10', 'K', 'Q'])
const cardSchema = z.object({ suit, rank })
const trumpChoice = z.union([suit, z.literal('lastCard')])

/** Rule overrides as they arrive from a client or a share link. Unknown keys are dropped. */
export const ruleOverridesSchema = z
  .object({
    allowCheating: z.boolean(),
    thuneeCaller: z.enum(['anyone', 'trumperOnly']),
    thuneeTrump: z.enum(['firstCardLed', 'noTrump']),
    thuneeLeader: z.enum(['caller', 'afterCaller']),
    thuneeWinner: z.enum(['callerOnly', 'team']),
    thuneePartnerCatchBalls: z.number().int().min(1).max(12),
    jodhiTiming: z.enum(['firstAndThird', 'anyTrick']),
    jodhiCards: z.enum(['inHand', 'dealt']),
    lastTrick: z.enum(['transfer', 'bonus']),
    defaultTrumper: z.enum(['dealerRight', 'teamAhead']),
    dealerRotation: z.enum(['stayWhileBehind', 'always']),
    khanaak: z.enum(['strict', 'simple']),
    khanaakRaisesTarget: z.boolean(),
    double: z.boolean(),
    undercutRestriction: z.boolean(),
    redealIfNoTrumps: z.boolean(),
    ballsToWin: z.number().int().min(1).max(30),
    twoToClear: z.boolean(),
    twoPlayerTarget: z.number().int().min(50).max(250),
    callTimerSeconds: z.number().int().min(3).max(60),
    thuneeWindowSeconds: z.number().int().min(0).max(30),
  })
  .partial() satisfies z.ZodType<RuleOverrides>

/**
 * The actions a player may send. Bounded, each value is also in range; unbounded, only each
 * field's type is checked, and the engine judges seats, names, amounts and claims itself.
 */
function actions(bounded: boolean) {
  const seat = bounded ? z.number().int().min(0).max(3) : z.number()
  return z.discriminatedUnion('type', [
    ...tableActionSchemas(SEAT_COUNTS, { bounded }),
    z.object({ type: z.literal('setRules'), overrides: ruleOverridesSchema }),
    z.object({ type: z.literal('call'), amount: bounded ? z.union(CALL_AMOUNTS.map((a) => z.literal(a))) : z.number() }),
    z.object({ type: z.literal('pass') }),
    z.object({ type: z.literal('preselectTrump'), choice: trumpChoice }),
    z.object({ type: z.literal('chooseTrump'), choice: trumpChoice }),
    z.object({ type: z.literal('callThunee') }),
    z.object({ type: z.literal('playCard'), card: cardSchema }),
    z.object({ type: z.literal('claimJodhi'), suit, withJack: z.boolean() }),
    z.object({ type: z.literal('callDouble') }),
    z.object({ type: z.literal('callKhanaak') }),
    z.object({ type: z.literal('challengePlay'), seat }),
    z.object({ type: z.literal('challengeJodhi'), claim: bounded ? z.number().int().min(0).max(100) : z.number() }),
    z.object({ type: z.literal('nextRound') }),
    z.object({ type: z.literal('rematch') }),
  ])
}

/** Actions a client may send, as the room checks them. System actions are deliberately absent. */
export const actionSchema = actions(true) satisfies z.ZodType<Action>

/** What `apply` checks of a player's action before reading any field: the shape of `actionSchema`, without its bounds. */
export const actionShape = actions(false) satisfies z.ZodType<Action>
