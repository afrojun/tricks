import { z } from 'zod'
import { SUITS } from '../../../kit/cards'
import { tableActionSchemas } from '../../../kit/table'
import { RANKS } from './cards'
import { PASS_SIZE, type RuleOverrides, SEAT_COUNTS } from './rules'
import type { Action } from './types'

const cardSchema = z.object({ suit: z.enum(SUITS), rank: z.enum(RANKS) })
const seat = z.number().int().min(0).max(3)

/** Rule overrides as they arrive from a client or a share link. Unknown keys are dropped. */
export const ruleOverridesSchema = z
  .object({
    allowCheating: z.boolean(),
    gameEndsAt: z.number().int().min(25).max(500),
    passing: z.enum(['rotating', 'left', 'none']),
    moon: z.enum(['othersAdd', 'shooterSubtracts']),
    jackOfDiamonds: z.boolean(),
    queenBreaksHearts: z.boolean(),
    pointsOnFirstTrick: z.boolean(),
  })
  .partial() satisfies z.ZodType<RuleOverrides>

/** Actions a client may send. System actions are deliberately absent. */
export const actionSchema = z.discriminatedUnion('type', [
  ...tableActionSchemas(SEAT_COUNTS),
  z.object({ type: z.literal('setRules'), overrides: ruleOverridesSchema }),
  z.object({ type: z.literal('choosePass'), cards: z.array(cardSchema).length(PASS_SIZE) }),
  z.object({ type: z.literal('playCard'), card: cardSchema }),
  z.object({ type: z.literal('challengePlay'), seat }),
  z.object({ type: z.literal('nextRound') }),
  z.object({ type: z.literal('rematch') }),
]) satisfies z.ZodType<Action>
