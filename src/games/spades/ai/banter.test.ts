import { describe, expect, test } from 'vitest'
import { seededRng } from '../../../kit/testing'
import { FOUR } from '../engine/deals'
import { Table } from '../engine/testing'
import { banter } from './banter'

describe('banter', () => {
  test('only computers speak, about the round’s moments, and never on an ordinary card', () => {
    const t = new Table(4).deal(FOUR, 3).call(3, 3, 3, 3)
    expect(banter(t.game, [{ type: 'cardPlayed', seat: 0, card: { suit: 'clubs', rank: '2' } }], seededRng(1))).toEqual([])
    // Every seat is a person here: nobody answers anything.
    expect(banter(t.game, [{ type: 'nilBroken', seat: 1 }, { type: 'gameOver', winner: 0 }], seededRng(1))).toEqual([])
  })
})
