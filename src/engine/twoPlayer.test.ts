import { describe, expect, test } from 'vitest'
import { availableActions } from './available'
import { checkInvariants } from './invariants'
import { Table } from './testing'
import type { Game } from './types'
import { viewFor } from './view'

// Dealer 0: seat 1 is the default trumper, seat 0 leads.
const HANDS = ['Jh 9h Ah 10h Ks Qs', 'Js 9s As 10s Kh Qh']

const playOf = (game: Game) => {
  if (game.phase.kind !== 'playing' && game.phase.kind !== 'trickPause') throw new Error(game.phase.kind)
  return game.phase.play
}

describe('two-player game', () => {
  test('four then two cards each, with twelve left for the second half', () => {
    const t = new Table(2).deal(HANDS)
    expect(t.game.phase).toMatchObject({ kind: 'calling', defaultTrumper: 1 })
    t.toPlay('spades')
    expect(t.game.phase).toMatchObject({ kind: 'playing', turn: 0 })
    expect(playOf(t.game).hands.map((h) => h.length)).toEqual([6, 6])
    expect(playOf(t.game).stock).toHaveLength(12)
    checkInvariants(t.game)
  })

  test('after six tricks the rest is dealt; trump and call carry over and the last winner leads', () => {
    const t = new Table(2).deal(HANDS).toPlay('spades')
    for (let i = 0; i < 6; i++) t.endPause().autoPlay('trickPause')
    const lastWinner = playOf(t.game).tricks[5].winner
    t.endPause()
    expect(t.game.phase).toMatchObject({ kind: 'playing', turn: lastWinner, play: { half: 2, trump: 'spades', stock: [] } })
    expect(playOf(t.game).hands.map((h) => h.length)).toEqual([6, 6])
    expect(t.events.filter((e) => e.type === 'dealt')).toHaveLength(2)
    expect(t.events.filter((e) => e.type === 'roundScored')).toHaveLength(0)
    checkInvariants(t.game)
  })

  test('scored once after twelve tricks, with one last-trick adjustment and the two-player target', () => {
    for (const [overrides, target] of [[{}, 125], [{ twoPlayerTarget: 105 }, 105]] as const) {
      const t = new Table(2, overrides).deal(HANDS).toPlay('spades').autoPlay('roundResult', 'gameOver')
      const phase = t.game.phase
      if (phase.kind !== 'roundResult') throw new Error(phase.kind)
      const { summary } = phase
      expect(summary.tricksWon[0] + summary.tricksWon[1]).toBe(12)
      expect(summary.cardPoints[0] + summary.cardPoints[1]).toBe(304)
      expect(summary.normal?.target).toBe(target)
      expect(Math.abs(summary.normal!.lines.find((l) => l.label === 'lastTrick')!.value)).toBe(10)
      expect(t.events.filter((e) => e.type === 'roundScored')).toHaveLength(1)
    }
  })

  test('Double and Khanaak are never available', () => {
    const t = new Table(2).deal(HANDS).toPlay('spades')
    for (let guard = 0; guard < 60 && t.game.phase.kind !== 'roundResult'; guard++) {
      const phase = t.game.phase
      if (phase.kind === 'playing') {
        expect(availableActions(viewFor(t.game, phase.turn))).toMatchObject({ callDouble: false, callKhanaak: false })
      }
      t.autoPlay(phase.kind === 'playing' ? 'trickPause' : 'playing', 'roundResult')
    }
  })

  test('a Thunee ends the round within the first half', () => {
    const t = new Table(2).deal(HANDS).advance(10_000).do(1, { type: 'chooseTrump', choice: 'spades' })
    t.do(1, { type: 'callThunee' })
    expect(t.game.phase).toMatchObject({ kind: 'playing', turn: 1 })
    t.autoPlay('roundResult', 'gameOver')
    const phase = t.game.phase
    if (phase.kind !== 'roundResult') throw new Error(phase.kind)
    expect(phase.summary.reason).toBe('thunee')
    expect(phase.summary.tricksWon[0] + phase.summary.tricksWon[1]).toBeLessThanOrEqual(6)
  })
})
