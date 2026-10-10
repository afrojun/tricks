import { describe, expect, test } from 'vitest'
import { createGame } from '../engine'
import { Table } from '../engine/testing'
import { banter } from './banter'

/** You at seat 0 and three computers. */
function table() {
  const t = new Table(4, {}, 3)
  t.game = { ...createGame(), rules: t.game.rules, settings: t.game.settings }
  t.do(null, { type: 'sit', seat: 0, name: 'You' })
  for (const seat of [1, 2, 3]) t.do(0, { type: 'addAi', seat })
  return t.game
}

describe('what Thunee’s computers say', () => {
  test('a won game: Lekker from a computer on the winning side, never from you', () => {
    expect(banter(table(), [{ type: 'gameOver', winner: 0 }], () => 0)).toEqual([{ seat: 2, say: { kind: 'line', id: 'lekker' } }])
  })

  test('a Jack slammed: Yoh from another computer', () => {
    const said = banter(table(), [{ type: 'cardPlayed', seat: 1, card: { suit: 'hearts', rank: 'J' } }], () => 0)
    expect(said).toHaveLength(1)
    expect(said[0].seat).not.toBe(1)
    expect(said[0].say).toEqual({ kind: 'line', id: 'yoh' })
  })

  test('an ordinary card says nothing', () => {
    expect(banter(table(), [{ type: 'cardPlayed', seat: 1, card: { suit: 'hearts', rank: 'Q' } }], () => 0)).toEqual([])
  })
})
