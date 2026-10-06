import { describe, expect, test } from 'vitest'
import { heartsClient } from '../client'
import { type RoundSummary, type View, OMNIBUS, STANDARD, resolveRules, viewFor } from '../engine'
import { Table } from '../engine/testing'
import { dwell } from './dwell'
import { present } from './present'

/** A view of four seated players, Asha at seat 0 and the viewer at seat 1. */
function seated(): View {
  const t = new Table()
  return { ...viewFor(t.game, 1), seats: viewFor(t.game, 1).seats.map((s, i) => ({ ...s, name: ['Asha', 'Bheki', 'Chan', 'Devi'][i] })) }
}

const summary = (over: Partial<RoundSummary>): RoundSummary => ({ roundNumber: 1, reason: 'normal', points: [0, 0, 0, 26], scoresAfter: [0, 0, 0, 26], moon: null, ...over })

describe('Hearts on the client', () => {
  test('names the game as the shell lists it, clockwise, for four, without teams or practice', () => {
    expect(heartsClient).toMatchObject({ id: 'hearts', name: 'Hearts', direction: 'clockwise', seatCounts: [4], practice: null })
    expect([0, 1, 2, 3].map((seat) => heartsClient.lobbyTeams(seat, 4))).toEqual([null, null, null, null])
  })

  test('its rule book has Standard and Omnibus', () => {
    expect(heartsClient.rules.presets.map((p) => p.name)).toEqual(['Standard', 'Omnibus'])
    expect(resolveRules(heartsClient.rules.presets[0].overrides)).toEqual(STANDARD)
    expect(resolveRules(heartsClient.rules.presets[1].overrides)).toEqual(OMNIBUS)
    expect(heartsClient.rules.defaults).toEqual(STANDARD)
  })

  test('cards and passes hold the screen; scoring does not wait', () => {
    expect(dwell({ type: 'cardPlayed', seat: 0, card: { suit: 'clubs', rank: '2' } })).toBeGreaterThan(0)
    expect(dwell({ type: 'passesExchanged' })).toBeGreaterThan(0)
    expect(dwell({ type: 'challengeResolved', challenger: 0, accused: 1, guilty: true })).toBeGreaterThan(1000)
    expect(dwell({ type: 'roundScored', summary: summary({}) })).toBe(0)
    expect(dwell({ type: 'seatChanged' })).toBe(0)
  })

  test('a deal says which way to pass', () => {
    const view = seated()
    expect(present({ type: 'dealt', roundNumber: 1, direction: 'left' }, view, 1)).toEqual({ toast: 'Pass three cards to the left.' })
    expect(present({ type: 'dealt', roundNumber: 3, direction: 'across' }, view, 1)).toEqual({ toast: 'Pass three cards across.' })
    expect(present({ type: 'dealt', roundNumber: 4, direction: 'none' }, view, 1)).toEqual({ toast: 'No passing this round.' })
  })

  test('hearts breaking is announced', () => {
    expect(present({ type: 'heartsBroken' }, seated(), 1)).toEqual({ toast: 'Hearts are broken.' })
  })

  test('a moon is a moment, named for whoever shot it', () => {
    const view = seated()
    expect(present({ type: 'roundScored', summary: summary({ reason: 'moon', moon: 1 }) }, view, 1).moments).toEqual([
      expect.objectContaining({ title: 'Shot the moon', detail: 'You took every point' }),
    ])
    expect(present({ type: 'roundScored', summary: summary({ reason: 'moon', moon: 2 }) }, view, 1).moments).toEqual([
      expect.objectContaining({ title: 'Shot the moon', detail: 'Chan took every point' }),
    ])
  })

  test('a verdict names the rule broken', () => {
    const view = seated()
    const card = { suit: 'hearts', rank: 'Q' } as const
    const verdict = (rule: string | null, guilty: boolean) =>
      present({ type: 'roundScored', summary: summary({ reason: 'challenge', challenge: { challenger: 1, accused: 0, guilty, rule, card } }) }, view, 1).moments?.[0]
    expect(verdict('followSuit', true)).toMatchObject({ title: 'Caught', detail: 'Asha did not follow suit', tone: 'danger', card })
    expect(verdict('heartsLead', true)).toMatchObject({ detail: 'Asha led a heart before hearts were broken' })
    expect(verdict('firstTrickPoints', true)).toMatchObject({ detail: 'Asha played points on the first trick' })
    expect(verdict(null, false)).toMatchObject({ title: 'Fair play', detail: 'Asha played by the rules', tone: 'good' })
  })

  test('a won game is celebrated', () => {
    expect(present({ type: 'gameOver', winner: 2 }, seated(), 1)).toEqual({ celebrate: 'var(--accent)' })
  })
})
