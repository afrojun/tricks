/**
 * The gate's measurements, small: each must run and keep its own checks. The gate itself, with its numbers,
 * is `run.ts`; see section 9 of the search-player spec.
 */
import { describe, expect, test } from 'vitest'
import { cheatRound, replay, selfDeal, strengthDeal } from './measure'

const WORLDS = 3

describe('the gate, in small', () => {
  test('strength: a duplicate deal under every direction, the search player in each seat in turn', () => {
    const deal = strengthDeal(1, WORLDS, 'written')
    expect(deal.differences).toHaveLength(16)
    expect(deal.differences).toEqual(deal.search.map((p, i) => p - deal.baseline[i]))
    // Four hand-written players share the round's points: a quarter of 26 each, or a moon's.
    expect(deal.baseline.reduce((a, b) => a + b, 0) % 26).toBe(0)
    expect(deal.searched).toBeGreaterThan(16 * 5)
    expect(deal.agreed).toBeLessThanOrEqual(deal.searched)
    for (const searches of ['pass', 'play'] as const) {
      const part = strengthDeal(1, WORLDS, 'written', searches)
      expect(part.searched).toBeGreaterThan(searches === 'pass' ? 0 : 16 * 5)
      if (searches === 'pass') expect(part.searched).toBeLessThanOrEqual(12)
    }
  }, 120_000)

  test('four search players take 6.5 points a round each, plus the moons', () => {
    const deal = selfDeal(2, WORLDS)
    const total = deal.points.flat().reduce((a, b) => a + b, 0)
    expect(total).toBe(26 * 4 + 52 * deal.moons)
  }, 120_000)

  test('against Sly and Wild, nobody accusing: no sampler failure, and every world checked', () => {
    let cheats = 0
    for (let seed = 20_001; seed <= 20_006; seed++) {
      const round = cheatRound(seed, WORLDS)
      expect(round.error).toBeNull()
      expect(round.worlds).toBeGreaterThan(0)
      cheats += round.cheats + round.cheatsWritten
    }
    expect(cheats).toBeGreaterThan(0)
  }, 120_000)

  test('determinism: every decision of a round, asked again from its reloaded save, comes out the same', () => {
    const result = replay(1, WORLDS)
    expect(result.decisions).toBeGreaterThan(50)
    expect(result.differed).toBe(0)
  }, 120_000)
})
