import { describe, expect, test } from 'vitest'
import { OMNIBUS_OVERRIDES } from './rules'
import { actionSchema, ruleOverridesSchema } from './schema'
import { card, cards } from './testing'

describe('wire schemas', () => {
  test('system actions and malformed actions are refused', () => {
    for (const bad of [
      { type: 'tick' },
      { type: 'setConnected', seat: 0, connected: false },
      { type: 'playCard', card: { suit: 'stars', rank: 'Q' } },
      { type: 'playCard', card: { suit: 'hearts', rank: '1' } },
      { type: 'playCard' },
      { type: 'choosePass', cards: cards('2c 3c') },
      { type: 'choosePass', cards: cards('2c 3c 4c 5c') },
      { type: 'challengePlay', seat: 4 },
      { type: 'sit', seat: 4, name: 'x' },
      { type: 'setPlayerCount', playerCount: 2 },
      { type: 'pass' },
      { type: 'nope' },
      null,
      'start',
    ]) {
      expect(actionSchema.safeParse(bad).success).toBe(false)
    }
  })

  test('every action a player may send is accepted', () => {
    for (const good of [
      { type: 'sit', seat: 3, name: 'x' },
      { type: 'addAi', seat: 2, persona: 'sly' },
      { type: 'setPlayerCount', playerCount: 4 },
      { type: 'start' },
      { type: 'setRules', overrides: OMNIBUS_OVERRIDES },
      { type: 'choosePass', cards: cards('Qs Ah Kh') },
      { type: 'playCard', card: card('10h') },
      { type: 'challengePlay', seat: 3 },
      { type: 'nextRound' },
      { type: 'rematch' },
      { type: 'replaceWithAi', seat: 1 },
      { type: 'reclaimSeat' },
    ]) {
      expect(actionSchema.safeParse(good).success).toBe(true)
    }
  })

  test('rule overrides drop unknown settings and refuse out-of-range values', () => {
    expect(ruleOverridesSchema.parse({ ...OMNIBUS_OVERRIDES, futureSetting: true })).toEqual(OMNIBUS_OVERRIDES)
    expect(ruleOverridesSchema.safeParse({ gameEndsAt: 24 }).success).toBe(false)
    expect(ruleOverridesSchema.safeParse({ gameEndsAt: 501 }).success).toBe(false)
    expect(ruleOverridesSchema.safeParse({ gameEndsAt: 25 }).success).toBe(true)
    expect(ruleOverridesSchema.safeParse({ gameEndsAt: 500 }).success).toBe(true)
    expect(ruleOverridesSchema.safeParse({ passing: 'right' }).success).toBe(false)
    expect(ruleOverridesSchema.safeParse({ moon: 'everyone' }).success).toBe(false)
    expect(ruleOverridesSchema.safeParse({ allowCheating: 'yes' }).success).toBe(false)
    const all = {
      allowCheating: false,
      gameEndsAt: 75,
      passing: 'none',
      moon: 'shooterSubtracts',
      jackOfDiamonds: true,
      queenBreaksHearts: true,
      pointsOnFirstTrick: true,
    }
    expect(ruleOverridesSchema.parse(all)).toEqual(all)
  })
})
