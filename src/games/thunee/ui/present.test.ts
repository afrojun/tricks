import { describe, expect, test } from 'vitest'
import { type RoundSummary, viewFor } from '../engine'
import { Table, card } from '../engine/testing'
import { present } from './present'
import { headline } from './RoundResult'

/** Seat 0 (P0) accused by seat 1, the viewer, over a play or a Jodhi. */
function challenged(challenge: RoundSummary['challenge']): RoundSummary {
  return {
    roundNumber: 1,
    reason: 'challenge',
    winner: 1,
    balls: 4,
    ballsAfter: [0, 4],
    trumper: 0,
    trump: 'hearts',
    callAmount: 0,
    cardPoints: [0, 0],
    tricksWon: [0, 0],
    challenge,
  }
}

const view = viewFor(new Table(4).game, 1)
const verdict = (summary: RoundSummary) => present({ type: 'roundScored', summary }, view, 1).moments?.[0]
const play = { challenger: 1, accused: 0, kind: 'play', card: card('9h') } as const

describe('a verdict says what was done', () => {
  test('a renege did not follow suit', () => {
    const summary = challenged({ ...play, guilty: true, rule: 'renege' })
    expect(verdict(summary)).toMatchObject({ title: 'Caught', detail: 'P0 did not follow suit', tone: 'danger', card: card('9h') })
    expect(headline(view, summary)).toBe('P1 caught P0 not following suit.')
  })

  test('an undercut is called an undercut', () => {
    const summary = challenged({ ...play, guilty: true, rule: 'undercut' })
    expect(verdict(summary)).toMatchObject({ title: 'Caught', detail: 'P0 undercut a trump' })
    expect(headline(view, summary)).toBe('P1 caught P0 undercutting a trump.')
  })

  test('a false Jodhi, and a fair play, read as before', () => {
    const jodhi = challenged({ challenger: 1, accused: 0, kind: 'jodhi', guilty: true, suit: 'spades' })
    expect(verdict(jodhi)).toMatchObject({ title: 'Caught', detail: 'P0 called a false Jodhi' })
    expect(headline(view, jodhi)).toBe('P1 caught P0 calling a false Jodhi.')
    const fair = challenged({ ...play, guilty: false })
    expect(verdict(fair)).toMatchObject({ title: 'Fair play', detail: 'P0 followed suit', tone: 'good' })
    expect(headline(view, fair)).toBe('P1 challenged P0 over playing 9♥, and was wrong.')
  })
})
