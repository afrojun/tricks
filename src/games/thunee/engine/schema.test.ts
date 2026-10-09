import { describe, expect, test } from 'vitest'
import { TUSCANS_OVERRIDES } from './rules'
import { actionSchema, ruleOverridesSchema } from './schema'

describe('wire schemas', () => {
  test('system actions and malformed actions are refused', () => {
    for (const bad of [
      { type: 'tick' },
      { type: 'setConnected', seat: 0, connected: false },
      { type: 'playCard', card: { suit: 'stars', rank: 'J' } },
      { type: 'call', amount: 15 },
      { type: 'sit', seat: 9, name: 'x' },
      { type: 'sit', seat: 0, name: 'x'.repeat(500) },
      { type: 'nope' },
      null,
      'start',
    ]) {
      expect(actionSchema.safeParse(bad).success).toBe(false)
    }
    expect(actionSchema.safeParse({ type: 'call', amount: 104 }).success).toBe(true)
  })

  test('rule overrides drop unknown settings and refuse out-of-range values', () => {
    expect(ruleOverridesSchema.parse({ ...TUSCANS_OVERRIDES, futureSetting: true })).toEqual(TUSCANS_OVERRIDES)
    expect(ruleOverridesSchema.safeParse({ ballsToWin: 0 }).success).toBe(false)
    expect(ruleOverridesSchema.safeParse({ khanaak: 'loose' }).success).toBe(false)
  })

  test('a computer may be added with a persona, a surprise, or neither', () => {
    expect(actionSchema.safeParse({ type: 'addAi', seat: 1 }).success).toBe(true)
    expect(actionSchema.safeParse({ type: 'addAi', seat: 1, persona: 'wild' }).success).toBe(true)
    expect(actionSchema.safeParse({ type: 'addAi', seat: 1, persona: 'surprise' }).success).toBe(true)
    expect(actionSchema.safeParse({ type: 'addAi', seat: 1, persona: 'evil' }).success).toBe(false)
  })
})
