/**
 * The gate's measurements, small: each must run and keep its own checks. The gate itself, with its numbers,
 * is `run.ts`; see section 9 of the search-player spec.
 */
import { describe, expect, test } from 'vitest'
import { type Timing, raw } from './bench'
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

  test('raw timings keep each decision’s kind apart, so a reader needs no knowledge of the bench to tell pass from play', () => {
    const timings: Timing[] = [
      { round: 1, seat: 0, kind: 'pass', candidates: 8, ms: 12.345, cpu: 12 },
      { round: 1, seat: 1, kind: 'first', candidates: 3, ms: 4, cpu: null },
      { round: 1, seat: 2, kind: 'play', candidates: 1, ms: 0.01, cpu: 0.01 },
    ]
    expect(raw(timings)).toBe('1 pass 8 12.35 12.00;1 first 3 4.00;1 play 1 0.01 0.01')
    expect(raw(timings).split(';').map((row) => row.split(' ')[1])).toEqual(['pass', 'first', 'play'])
  })

  test('determinism: every decision of a round, asked again from its reloaded save, comes out the same', () => {
    const result = replay(1, WORLDS)
    expect(result.decisions).toBeGreaterThan(50)
    expect(result.differed).toBe(0)
  }, 120_000)
})
