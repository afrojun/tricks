import { describe, expect, test } from 'vitest'
import { type RoundSummary, type SideResult, viewFor } from '../engine'
import { Table } from '../engine/testing'
import { roundMoments } from './present'

/** A round of three in which each side paid `penalties` for its bags, and every call was made. */
function paid(penalties: number[]): RoundSummary {
  const sides = penalties.map((bagPenalty) => ({ contract: 1, made: true, bagPenalty }) as SideResult)
  return { roundNumber: 1, reason: 'normal', sides, scoresAfter: penalties.map(() => 0), bagsAfter: penalties.map(() => 0) }
}

describe('round moments', () => {
  test('bags cost what the round says, as many tens as it crossed', () => {
    const view = viewFor(new Table(3).game, 0)
    expect(roundMoments(view, paid([-100, 0, 0]))).toMatchObject([{ title: 'Ten bags', detail: 'You lose 100' }])
    expect(roundMoments(view, paid([-200, -100, 0]))).toMatchObject([
      { title: 'Ten bags', detail: 'P1 loses 100' },
      { title: 'Ten bags twice', detail: 'You lose 200' },
    ])
    expect(roundMoments(view, paid([0, -100, -100]))).toMatchObject([{ title: 'Ten bags', detail: 'P1 and P2 lose 100' }])
  })
})
