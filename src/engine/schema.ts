import { z } from 'zod'
import { CALL_AMOUNTS } from './rules'
import type { RuleOverrides } from './rules'
import { type Action, PERSONAS } from './types'

const suit = z.enum(['hearts', 'diamonds', 'clubs', 'spades'])
const rank = z.enum(['J', '9', 'A', '10', 'K', 'Q'])
const cardSchema = z.object({ suit, rank })
const seat = z.number().int().min(0).max(3)
const trumpChoice = z.union([suit, z.literal('lastCard')])

/** Rule overrides as they arrive from a client or a share link. Unknown keys are dropped. */
export const ruleOverridesSchema = z
  .object({
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

/** Actions a client may send. System actions are deliberately absent. */
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('sit'), seat, name: z.string().max(200) }),
  z.object({ type: z.literal('leaveSeat') }),
  z.object({ type: z.literal('rename'), name: z.string().max(200) }),
  z.object({ type: z.literal('addAi'), seat, persona: z.enum([...PERSONAS, 'surprise']).optional() }),
  z.object({ type: z.literal('clearSeat'), seat }),
  z.object({ type: z.literal('setRules'), overrides: ruleOverridesSchema }),
  z.object({ type: z.literal('setPlayerCount'), playerCount: z.union([z.literal(2), z.literal(4)]) }),
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('call'), amount: z.union(CALL_AMOUNTS.map((a) => z.literal(a))) }),
  z.object({ type: z.literal('pass') }),
  z.object({ type: z.literal('preselectTrump'), choice: trumpChoice }),
  z.object({ type: z.literal('chooseTrump'), choice: trumpChoice }),
  z.object({ type: z.literal('callThunee') }),
  z.object({ type: z.literal('playCard'), card: cardSchema }),
  z.object({ type: z.literal('claimJodhi'), suit, withJack: z.boolean() }),
  z.object({ type: z.literal('callDouble') }),
  z.object({ type: z.literal('callKhanaak') }),
  z.object({ type: z.literal('challengePlay'), seat }),
  z.object({ type: z.literal('challengeJodhi'), claim: z.number().int().min(0).max(100) }),
  z.object({ type: z.literal('nextRound') }),
  z.object({ type: z.literal('rematch') }),
  z.object({ type: z.literal('replaceWithAi'), seat }),
  z.object({ type: z.literal('reclaimSeat') }),
]) satisfies z.ZodType<Action>
