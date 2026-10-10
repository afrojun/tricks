import { z } from 'zod'
import { SUITS } from '../../../kit/cards'
import { tableActionSchemas } from '../../../kit/table'
import { RANKS } from './cards'
import { EXCHANGE_SIZE, type RuleOverrides, SEAT_COUNTS, handSize } from './rules'
import type { Action } from './types'

const cardSchema = z.object({ suit: z.enum(SUITS), rank: z.enum(RANKS) })

/** Rule overrides, with each number in its range when bounded; unbounded, only of its type. */
function ruleOverrides(bounded: boolean) {
  return z
    .object({
      allowCheating: z.boolean(),
      gameEndsAt: bounded ? z.number().int().min(100).max(1000) : z.number(),
      losingScore: z.boolean(),
      nil: z.boolean(),
      blindNil: z.boolean(),
      bagPenalty: z.boolean(),
      firstLead: z.enum(['left', 'lowestClub']),
      renege: z.enum(['set', 'bidPlusThree']),
      jokers: z.boolean(),
    })
    .partial()
}

/** Rule overrides as they arrive from a client or a share link. Unknown keys are dropped. */
export const ruleOverridesSchema = ruleOverrides(true) satisfies z.ZodType<RuleOverrides>

/**
 * The actions a player may send. Bounded, each value is also in range; unbounded, only each field's type is
 * checked (an enum's values and a card's suit and rank are its type), and the engine judges seats, names,
 * counts, calls, the cards given and rule numbers itself.
 */
function actions(bounded: boolean) {
  const most = Math.max(...SEAT_COUNTS)
  const seat = bounded ? z.number().int().min(0).max(most - 1) : z.number()
  const tricks = bounded ? z.number().int().min(0).max(Math.max(...SEAT_COUNTS.map(handSize))) : z.number()
  return z.discriminatedUnion('type', [
    ...tableActionSchemas(SEAT_COUNTS, { bounded }),
    z.object({ type: z.literal('setRules'), overrides: ruleOverrides(bounded) }),
    z.object({ type: z.literal('draw'), keep: z.boolean() }),
    z.object({ type: z.literal('lookAtHand') }),
    z.object({ type: z.literal('call'), tricks }),
    z.object({ type: z.literal('callBlindNil') }),
    z.object({ type: z.literal('giveCards'), cards: bounded ? z.array(cardSchema).length(EXCHANGE_SIZE) : z.array(cardSchema) }),
    z.object({ type: z.literal('playCard'), card: cardSchema }),
    z.object({ type: z.literal('challengePlay'), seat }),
    z.object({ type: z.literal('nextRound') }),
    z.object({ type: z.literal('rematch'), now: z.literal(true).optional() }),
  ])
}

/** Actions a client may send, as the room checks them. System actions are deliberately absent. */
export const actionSchema = actions(true) satisfies z.ZodType<Action>

/** What `apply` checks of a player's action before reading any field: the shape of `actionSchema`, without its bounds. */
export const actionShape = actions(false) satisfies z.ZodType<Action>
