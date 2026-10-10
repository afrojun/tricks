import { describe, expect, test } from 'vitest'
import { isDeepStrictEqual } from 'node:util'
import { clone, collectCards, deepFreeze, exposed, same, seededRng } from './testing'

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

  test('exposed finds the hidden cards collectCards would, and the secrets the JSON would show', () => {
    const view = {
      hand: [{ suit: 'hearts', rank: 'Q' }, { suit: 'clubs', rank: '2', broke: [] }],
      trick: { plays: [{ seat: 1, card: { suit: 'clubs', rank: 'A' }, handBefore: undefined }] },
      deep: [[{ aiSalt: 3 }]],
    }
    const hidden = [
      { suit: 'clubs', rank: 'A' },
      { suit: 'hearts', rank: '2' },
      { suit: 'clubs', rank: '2' },
    ] as const
    const secrets = ['handBefore', 'broke', 'aiSalt', 'stock']
    const found = exposed(view, hidden, secrets)
    expect(found.cards).toEqual(collectCards(view).filter((c) => hidden.some((h) => h.suit === c.suit && h.rank === c.rank)))
    expect(found.cards).toEqual([{ suit: 'clubs', rank: '2', broke: [] }, { suit: 'clubs', rank: 'A' }])
    const text = JSON.stringify(view)
    expect([...found.keys].sort()).toEqual(secrets.filter((key) => text.includes(`"${key}":`)).sort())
    expect([...found.keys].sort()).toEqual(['aiSalt', 'broke'])
  })

  test('clone copies plain data as structuredClone does, keeping what is shared shared', () => {
    const shared = [{ suit: 'clubs', rank: 'A' }]
    const value = deepFreeze({ hands: [shared, shared], seat: { n: 0, name: undefined }, flags: [true, -0] })
    const copied = clone(value)
    expect(same(copied, value)).toBe(true)
    expect(same(copied, structuredClone(value))).toBe(true)
    expect(copied.hands[0]).toBe(copied.hands[1])
    expect(copied.hands[0]).not.toBe(shared)
    expect(Object.isFrozen(copied) || Object.isFrozen(copied.hands[0][0])).toBe(false)
  })

  test('same finds plain data equal exactly as isDeepStrictEqual does', () => {
    const pairs: [unknown, unknown][] = [
      [{ a: [1, { b: 'x' }], c: null }, { c: null, a: [1, { b: 'x' }] }],
      [{ a: undefined }, {}],
      [{ a: undefined }, { b: undefined }],
      [{}, { a: undefined }],
      [[1, 2], [1, 2, 3]],
      [[], {}],
      [{ 0: 'a' }, ['a']],
      [Number.NaN, Number.NaN],
      [0, -0],
      [{ a: 1 }, { a: '1' }],
      [null, {}],
      [{ a: { b: [true] } }, { a: { b: [true] } }],
    ]
    for (const [a, b] of pairs) {
      expect(same(a, b), JSON.stringify([a, b])).toBe(isDeepStrictEqual(a, b))
      expect(same(b, a), JSON.stringify([b, a])).toBe(isDeepStrictEqual(b, a))
    }
  })
})
