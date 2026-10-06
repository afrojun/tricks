import { describe, expect, test } from 'vitest'
import { heartsClient } from '../client'
import { type GameEvent, type RoundSummary, type View, OMNIBUS, STANDARD, resolveRules, viewFor } from '../engine'
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
  test('names the game as the shell lists it, clockwise, for four, without teams, with practice', () => {
    expect(heartsClient).toMatchObject({ id: 'hearts', name: 'Hearts', direction: 'clockwise', seatCounts: [4] })
    expect(heartsClient.practice).not.toBeNull()
    expect([0, 1, 2, 3].map((seat) => heartsClient.lobbyTeams(seat, 4))).toEqual([null, null, null, null])
  })

  test('its rule book has Standard and Omnibus', () => {
    expect(heartsClient.rules.presets.map((p) => p.name)).toEqual(['Standard', 'Omnibus'])
    expect(resolveRules(heartsClient.rules.presets[0].overrides)).toEqual(STANDARD)
    expect(resolveRules(heartsClient.rules.presets[1].overrides)).toEqual(OMNIBUS)
    expect(heartsClient.rules.defaults).toEqual(STANDARD)
  })

  test('cards and passes hold the screen; an ordinary score does not wait', () => {
    expect(dwell({ type: 'cardPlayed', seat: 0, card: { suit: 'clubs', rank: '2' } })).toBeGreaterThan(0)
    expect(dwell({ type: 'passesExchanged' })).toBeGreaterThan(0)
    expect(dwell({ type: 'challengeResolved', challenger: 0, accused: 1, guilty: true })).toBeGreaterThan(1000)
    expect(dwell({ type: 'roundScored', summary: summary({}) })).toBe(0)
    expect(dwell({ type: 'seatChanged' })).toBe(0)
  })

  test('every message holds the screen for as long as the moments it shows, so the next cannot move the table under them', () => {
    const view = seated()
    const card = { suit: 'hearts', rank: '9' } as const
    const challenge = { challenger: 1, accused: 0, guilty: true, rule: 'followSuit', card }
    // Events as the engine sends them together, one message each.
    const messages: GameEvent[][] = [
      [{ type: 'cardPlayed', seat: 0, card }, { type: 'heartsBroken' }],
      [{ type: 'trickWon', seat: 0, points: 1 }, { type: 'roundScored', summary: summary({ reason: 'moon', moon: 2, points: [26, 26, 0, 26] }) }],
      [{ type: 'roundScored', summary: summary({ reason: 'moon', moon: 1 }) }, { type: 'gameOver', winner: 1 }],
      [{ type: 'challengeResolved', challenger: 1, accused: 0, guilty: true }, { type: 'roundScored', summary: summary({ reason: 'challenge', challenge }) }],
      [{ type: 'challengeResolved', challenger: 1, accused: 0, guilty: false }, { type: 'roundScored', summary: summary({ reason: 'challenge', challenge: { ...challenge, guilty: false, rule: null } }) }],
    ]
    for (const events of messages) {
      // Moments are shown one after another.
      const shown = events.flatMap((e) => present(e, view, 1).moments ?? []).reduce((ms, m) => ms + m.ms, 0)
      expect(shown, events.map((e) => e.type).join(' + ')).toBeGreaterThan(0)
      expect(Math.max(...events.map(dwell)), events.map((e) => e.type).join(' + ')).toBeGreaterThanOrEqual(shown)
    }
  })

  test('a deal says which way to pass', () => {
    const view = seated()
    expect(present({ type: 'dealt', roundNumber: 1, direction: 'left' }, view, 1)).toEqual({ toast: 'Pass three cards to the left.' })
    expect(present({ type: 'dealt', roundNumber: 3, direction: 'across' }, view, 1)).toEqual({ toast: 'Pass three cards across.' })
    expect(present({ type: 'dealt', roundNumber: 4, direction: 'none' }, view, 1)).toEqual({ toast: 'No passing this round.' })
  })

  test('hearts breaking takes the middle of the table, and holds the next card back until it has been seen', () => {
    const shown = present({ type: 'heartsBroken' }, seated(), 1)
    expect(shown.moments).toEqual([expect.objectContaining({ title: 'Hearts are broken', detail: 'Hearts may be led from now on.' })])
    expect(dwell({ type: 'heartsBroken' })).toBeGreaterThanOrEqual(shown.moments![0].ms)
  })

  test('the exchange names who passed the viewer their cards', () => {
    const view = (direction: View['direction']) => ({ ...seated(), direction })
    // Seats are numbered clockwise: to the left, Bheki (1) is given Asha's (0) cards.
    expect(present({ type: 'passesExchanged' }, view('left'), 1)).toEqual({ toast: 'Asha passed you three cards.' })
    expect(present({ type: 'passesExchanged' }, view('right'), 1)).toEqual({ toast: 'Chan passed you three cards.' })
    expect(present({ type: 'passesExchanged' }, view('across'), 1)).toEqual({ toast: 'Devi passed you three cards.' })
    expect(present({ type: 'passesExchanged' }, view('left'), null)).toEqual({ toast: 'The cards have changed hands.' })
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
