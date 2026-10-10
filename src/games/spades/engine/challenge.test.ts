import { describe, expect, test } from 'vitest'
import { availableActions } from './available'
import { VOID } from './deals'
import { seenPlays } from './excuses'
import { Table, playOf } from './testing'
import { viewFor } from './view'

/** Seat 1 holds no clubs; seat 0 renege-free leads a club. Seat 2 holds clubs: playing a diamond on a club is a renege. */
const renege = (rules = {}) => new Table(4, rules).deal(VOID, 3).call(3, 4, 3, 3).play('2c Qs 9d Ac')

describe('accusing, under "set"', () => {
  test('a guilty renege sets the cheat’s side; the other side scores what it called; the round ends', () => {
    const t = renege()
    expect(playOf(t.game).tricks[0].plays[2].broke).toEqual(['followSuit'])
    t.do(1, { type: 'challengePlay', seat: 2 })
    const phase = t.game.phase
    if (phase.kind !== 'roundResult') throw new Error(phase.kind)
    expect(phase.summary.reason).toBe('challenge')
    expect(phase.summary.challenge).toMatchObject({ challenger: 1, accused: 2, guilty: true, rule: 'followSuit' })
    expect(phase.summary.sides.map((s) => s.points)).toEqual([-60, 70])
    expect(t.events).toContainEqual({ type: 'challengeResolved', challenger: 1, accused: 2, guilty: true, penalty: 'set', rule: 'followSuit', card: { suit: 'diamonds', rank: '9' } })
  })

  test('a wrong accusation sets the accuser’s side instead', () => {
    const t = renege().do(2, { type: 'challengePlay', seat: 1 })
    const phase = t.game.phase
    if (phase.kind !== 'roundResult') throw new Error(phase.kind)
    expect(phase.summary.sides.map((s) => s.points)).toEqual([-60, 70])
    expect(phase.summary.challenge).toMatchObject({ guilty: false })
  })

  test('only a seat that has played may be accused, and only with cheating on', () => {
    const t = new Table(4).deal(VOID, 3).call(3, 4, 3, 3).play('2c')
    expect(availableActions(viewFor(t.game, 1)).challengePlay).toEqual([0])
    const off = new Table(4, { allowCheating: false }).deal(VOID, 3).call(3, 4, 3, 3).play('2c')
    expect(availableActions(viewFor(off.game, 1)).challengePlay).toEqual([])
    expect(off.try(1, { type: 'challengePlay', seat: 0 })).toBe('notAllowed')
  })
})

describe('accusing, under "Bid plus three"', () => {
  test('guilty: the cheat’s side’s contract rises by three, play goes on, and its plays so far are settled', () => {
    const t = renege({ renege: 'bidPlusThree' }).do(1, { type: 'challengePlay', seat: 2 })
    expect(t.game.phase.kind).toBe('trickPause')
    expect(viewFor(t.game, 0).phase).toMatchObject({ contracts: [9, 7], settled: [0, 0, 1, 0] })
    expect(t.events).toContainEqual({ type: 'challengeResolved', challenger: 1, accused: 2, guilty: true, penalty: 'bidPlusThree', rule: 'followSuit', card: { suit: 'diamonds', rank: '9' } })
    // Nothing of seat 2 is left to judge until it plays again.
    expect(availableActions(viewFor(t.game, 1)).challengePlay).toEqual([0, 3])
    // Its settled renege is still seen, but never as a cheat to prove.
    const seen = seenPlays(viewFor(t.game, 1, 'full'))
    expect(seen.find((p) => p.seat === 2)?.settled).toBe(true)
  })

  test('wrong: the accuser’s side pays instead', () => {
    const t = renege({ renege: 'bidPlusThree' }).do(2, { type: 'challengePlay', seat: 0 })
    expect(viewFor(t.game, 0).phase).toMatchObject({ contracts: [9, 7], settled: [1, 0, 0, 0] })
  })

  test('a standing Nil at fault fails instead of raising the contract', () => {
    const t = new Table(4, { renege: 'bidPlusThree' }).deal(VOID, 3).call(3, 4, 'nil', 3).play('2c Qs 9d Ac')
    t.do(2, { type: 'challengePlay', seat: 1 })
    expect(viewFor(t.game, 0).phase).toMatchObject({ contracts: [3, 7], nilFailed: [false, false, true, false] })
    t.autoPlay('roundResult', 'gameOver')
    const phase = t.game.phase
    if (phase.kind !== 'roundResult') throw new Error(phase.kind)
    expect(phase.summary.sides[0].nils[0]).toMatchObject({ seat: 2, failed: true, points: -100 })
  })
})
