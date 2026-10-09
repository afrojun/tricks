import { describe, expect, test } from 'vitest'
import { createGame } from '../engine/apply'
import { Table } from '../engine/testing'
import { banter } from './banter'

/** You at seat 0 and three computers. */
function table() {
  const t = new Table({}, 3)
  t.game = { ...createGame(), rules: t.game.rules }
  t.do(null, { type: 'sit', seat: 0, name: 'You' })
  for (const seat of [1, 2, 3]) t.do(0, { type: 'addAi', seat })
  return t.game
}

describe('what Hearts’ computers say', () => {
  test('taking the queen of spades stings', () => {
    expect(banter(table(), [{ type: 'trickWon', seat: 3, points: 13 }], () => 0)).toEqual([{ seat: 3, say: { kind: 'line', id: 'eish' } }])
  })

  test('a few hearts are not worth a word', () => {
    expect(banter(table(), [{ type: 'trickWon', seat: 3, points: 2 }], () => 0)).toEqual([])
  })

  test('the winner of the game, if a computer, is pleased', () => {
    expect(banter(table(), [{ type: 'gameOver', winner: 1 }], () => 0)).toEqual([{ seat: 1, say: { kind: 'line', id: 'lekker' } }])
    expect(banter(table(), [{ type: 'gameOver', winner: 0 }], () => 0)).toEqual([])
  })
})
