import { describe, expect, test } from 'vitest'
import { collectCards, deepFreeze, seededRng } from './testing'

describe('test helpers', () => {
  test('a seeded generator repeats itself and stays in [0, 1)', () => {
    const a = seededRng(42)
    const b = seededRng(42)
    const xs = Array.from({ length: 100 }, () => a())
    expect(Array.from({ length: 100 }, () => b())).toEqual(xs)
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true)
    // Pinned to the generator Thunee's tests use, so seeded games deal the same cards.
    expect(seededRng(1)()).toBe(0.6270739405881613)
  })

  test('deepFreeze freezes nested objects and arrays', () => {
    const value = deepFreeze({ a: [{ b: 1 }], c: { d: [2] } })
    expect(Object.isFrozen(value.a[0])).toBe(true)
    expect(Object.isFrozen(value.c.d)).toBe(true)
  })

  test('collectCards finds every card-shaped object, however deep', () => {
    const found = collectCards({ hand: [{ suit: 'hearts', rank: 'Q' }], trick: { plays: [{ seat: 1, card: { suit: 'clubs', rank: '2' } }] }, n: 3 })
    expect(found).toEqual([{ suit: 'hearts', rank: 'Q' }, { suit: 'clubs', rank: '2' }])
  })
})
