import { describe, expect, test } from 'vitest'
import { STANDARD, type SpadesRules } from './rules'
import { bagPenalty, gameWinner, scoreChallenged, scoreSide } from './scoring'
import type { Call, RoundPlay } from './types'

/** A finished round: these calls, each seat taking this many tricks, with any penalties. */
function round(calls: (number | 'nil' | 'blind')[], taken: number[], extra: Partial<RoundPlay> = {}): RoundPlay {
  const winners = taken.flatMap((n, seat) => Array.from({ length: n }, () => seat))
  const toCall = (c: number | 'nil' | 'blind'): Call => (c === 'nil' ? { tricks: 0, blind: false } : c === 'blind' ? { tricks: 0, blind: true } : { tricks: c, blind: false })
  return {
    hands: calls.map(() => []),
    out: { setAside: null, discards: calls.map(() => []) },
    calls: calls.map(toCall),
    tricks: winners.map((winner) => ({ plays: [], winner })),
    current: [],
    spadesBroken: true,
    raised: calls.length === 4 ? [0, 0] : calls.map(() => 0),
    settled: calls.map(() => 0),
    nilFailed: calls.map(() => false),
    exchange: null,
    ...extra,
  }
}

const rules = (overrides: Partial<SpadesRules> = {}): SpadesRules => ({ ...STANDARD, ...overrides })

describe('a side’s round', () => {
  test('a contract made scores 10 a trick called and 1 a bag', () => {
    // Seats 0 and 2 call 3 and 2, and take 4 and 2: made, one bag.
    const side = scoreSide(0, round([3, 3, 2, 3], [4, 3, 2, 4]), 0, rules(), 4)
    expect(side).toMatchObject({ contract: 5, tricks: 6, made: true, bags: 1, bagPenalty: 0, points: 51 })
  })

  test('a contract missed loses 10 a trick called, and its tricks are no bags', () => {
    const side = scoreSide(1, round([3, 4, 2, 4], [4, 3, 2, 4]), 0, rules(), 4)
    expect(side).toMatchObject({ contract: 8, tricks: 7, made: false, bags: 0, points: -80 })
  })

  test('a Nil made is worth 100 beside the partner’s contract', () => {
    const side = scoreSide(0, round(['nil', 4, 4, 5], [0, 5, 4, 4]), 0, rules(), 4)
    expect(side).toMatchObject({ contract: 4, tricks: 4, made: true, bags: 0, points: 140 })
    expect(side.nils).toEqual([{ seat: 0, blind: false, tricks: 0, failed: false, points: 100 }])
  })

  test('a Nil broken loses 100; its tricks are bags and never count toward the contract', () => {
    const side = scoreSide(0, round(['nil', 4, 4, 5], [2, 4, 3, 4]), 0, rules(), 4)
    // The partner took 3 of 4: set for -40; the Nil's two tricks are bags.
    expect(side).toMatchObject({ contract: 4, tricks: 3, made: false, bags: 2, points: -40 - 100 + 2 })
  })

  test('Blind nil is worth 200 either way', () => {
    expect(scoreSide(0, round(['blind', 4, 5, 4], [0, 4, 5, 4]), 0, rules(), 4).points).toBe(250)
    expect(scoreSide(0, round(['blind', 4, 5, 4], [1, 4, 4, 4]), 0, rules(), 4).points).toBe(-200 - 50 + 1)
  })

  test('both partners Nil: no contract, each Nil scored alone, and every trick a bag', () => {
    const side = scoreSide(0, round(['nil', 6, 'nil', 6], [0, 6, 1, 6]), 0, rules(), 4)
    expect(side).toMatchObject({ contract: 0, tricks: 0, made: true, bags: 1, points: 100 - 100 + 1 })
  })

  test('ten bags cost 100, the count carries on, and twenty cost another 100', () => {
    expect(bagPenalty(8, 3, rules())).toBe(-100)
    expect(bagPenalty(10, 3, rules())).toBe(0)
    expect(bagPenalty(18, 13, rules())).toBe(-200)
    expect(bagPenalty(8, 3, rules({ bagPenalty: false }))).toBe(0)
    const side = scoreSide(0, round([3, 3, 2, 3], [6, 1, 2, 4]), 7, rules(), 4)
    expect(side).toMatchObject({ bags: 3, bagPenalty: -100, points: 50 + 3 - 100 })
  })

  test('with three, each player is a side', () => {
    const play = round([5, 'nil', 6], [6, 0, 11])
    expect(scoreSide(0, play, 0, rules(), 3)).toMatchObject({ contract: 5, made: true, bags: 1, points: 51 })
    expect(scoreSide(1, play, 0, rules(), 3)).toMatchObject({ contract: 0, points: 100 })
    expect(scoreSide(2, play, 0, rules(), 3)).toMatchObject({ contract: 6, bags: 5, points: 65 })
  })

  test('a "Bid plus three" penalty raises the contract, and a failed Nil scores as broken without a trick', () => {
    const raised = scoreSide(0, round([3, 3, 2, 3], [4, 3, 2, 4], { raised: [1, 0] }), 0, rules({ renege: 'bidPlusThree' }), 4)
    expect(raised).toMatchObject({ contract: 8, raised: 3, tricks: 6, made: false, points: -80 })
    const failed = scoreSide(0, round(['nil', 4, 5, 4], [0, 4, 5, 4], { nilFailed: [true, false, false, false] }), 0, rules({ renege: 'bidPlusThree' }), 4)
    expect(failed.nils[0]).toMatchObject({ failed: true, points: -100 })
  })
})

describe('a round ended by an accusation, under "set"', () => {
  test('the side set loses its contract and its Nils; every other scores what it called; nobody gains bags', () => {
    const play = round(['nil', 4, 5, 4], [0, 2, 1, 0])
    expect(scoreChallenged(0, play, 0, 4)).toMatchObject({ contract: 5, set: true, made: false, bags: 0, points: -50 - 100 })
    expect(scoreChallenged(1, play, 0, 4)).toMatchObject({ contract: 8, set: false, made: true, bags: 0, points: 80 })
  })
})

describe('the end', () => {
  test('the single highest score wins once any side reaches the end; a shared top plays on', () => {
    expect(gameWinner([480, 499], rules())).toBeNull()
    expect(gameWinner([510, 499], rules())).toBe(0)
    expect(gameWinner([510, 520], rules())).toBe(1)
    expect(gameWinner([510, 510], rules())).toBeNull()
    expect(gameWinner([300, 510, 510], rules())).toBeNull()
    expect(gameWinner([100, 60, 40], rules({ gameEndsAt: 100 }))).toBe(0)
  })

  test('with the losing score, a side at −200 or below ends the game, and the highest score wins', () => {
    expect(gameWinner([-200, 150], rules())).toBeNull()
    expect(gameWinner([-200, 150], rules({ losingScore: true }))).toBe(1)
    expect(gameWinner([-250, -210], rules({ losingScore: true }))).toBe(1)
    expect(gameWinner([-190, 150], rules({ losingScore: true }))).toBeNull()
    expect(gameWinner([-220, 100, 100], rules({ losingScore: true }))).toBeNull()
  })
})
