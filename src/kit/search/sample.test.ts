import { describe, expect, test } from 'vitest'
import { type Card, SUITS, type Suit, cardId, sameCard, shuffle } from '../cards'
import { seededRng } from '../testing'
import { prepare } from './sample'
import { fork, seed, stream } from './seed'
import type { Constraint, Knowledge, World } from './types'

const c = (text: string): Card => {
  const suit = SUITS.find((s) => s[0] === text.slice(-1))!
  return { suit, rank: text.slice(0, -1) }
}
const cards = (text: string) => text.trim().split(/\s+/).map(c)
const of = (suit: Suit) => (card: Card) => card.suit === suit
const key = (world: World<Card>) => world.map((place) => place.map(cardId).sort().join(' ')).join(' | ')

/** Every constraint holds in a world. */
function keeps(world: World<Card>, constraints: readonly Constraint<Card>[]): boolean {
  return constraints.every((k) => {
    if (k.kind === 'holds') return world[k.place].some((x) => sameCard(x, k.card))
    if (k.kind === 'none') return !world[k.place].some(k.of)
    return k.places.some((p) => world[p].some(k.of))
  })
}

/** Counts of each distinct world over `n` samples. */
function tally(knowledge: Knowledge<Card>, n: number, salt = 1): Map<string, number> {
  const sampler = prepare(knowledge)
  const rng = seededRng(salt)
  const out = new Map<string, number>()
  for (let i = 0; i < n; i++) {
    const world = sampler.sample(rng)
    out.set(key(world), (out.get(key(world)) ?? 0) + 1)
  }
  return out
}

/** Pearson's chi-square statistic against equal counts over `k` outcomes. */
function chiSquare(counts: Map<string, number>, k: number): number {
  const n = [...counts.values()].reduce((a, b) => a + b, 0)
  const expected = n / k
  const seen = [...counts.values()].reduce((a, o) => a + (o - expected) ** 2 / expected, 0)
  return seen + (k - counts.size) * expected
}

describe('a decision’s random stream', () => {
  test('the same salt, seat and decision give the same numbers; each part changes them', () => {
    const draw = (rng: () => number) => Array.from({ length: 5 }, rng)
    const base = draw(seed(42, 1, '3:2:Qs'))
    expect(draw(seed(42, 1, '3:2:Qs'))).toEqual(base)
    for (const other of [seed(43, 1, '3:2:Qs'), seed(42, 2, '3:2:Qs'), seed(42, 1, '3:2:Ks')]) expect(draw(other)).not.toEqual(base)
    expect(base.every((x) => x >= 0 && x < 1)).toBe(true)
  })

  test('a forked stream is repeatable and its own', () => {
    const a = seed(7, 0, 'x')
    const b = seed(7, 0, 'x')
    const s = fork(a)
    expect(fork(b)).toBe(s)
    expect(stream(s)()).toBe(stream(s)())
    expect(stream(s)()).not.toBe(a())
  })
})

describe('the sampler', () => {
  test('deals every hidden card once, each place its size, in a random order', () => {
    const hidden = cards('Jh 9h Ah 10h Kh Qh Js 9s As')
    const sampler = prepare({ hidden, sizes: [4, 2, 3], hard: [], soft: [] })
    const rng = seededRng(3)
    for (let i = 0; i < 200; i++) {
      const world = sampler.sample(rng)
      expect(world.map((p) => p.length)).toEqual([4, 2, 3])
      expect(world.flat().map(cardId).sort()).toEqual(hidden.map(cardId).sort())
    }
  })

  test('is uniform over every deal, and over the deals that keep a constraint', () => {
    const hidden = cards('Jh 9h Js 9s')
    // Four cards into two places of two: six deals.
    expect(chiSquare(tally({ hidden, sizes: [2, 2], hard: [], soft: [] }, 6000), 6)).toBeLessThan(20.5) // p ≈ 0.001 with 5 degrees
    // Place 0 holds no hearts: one deal is left.
    expect([...tally({ hidden, sizes: [2, 2], hard: [{ kind: 'none', place: 0, of: of('hearts'), why: 'void' }], soft: [] }, 100).keys()]).toEqual([key([cards('Js 9s'), cards('Jh 9h')])])
  })

  test('never breaks a hard constraint: known cards, absences, and "at least one"', () => {
    const hidden = cards('Jh 9h Ah 10h Kh Qh Js 9s As 10s Kd Qd')
    const hard: Constraint<Card>[] = [
      { kind: 'holds', place: 2, card: c('Jh'), why: 'given' },
      { kind: 'holds', place: 2, card: c('9h'), why: 'given' },
      { kind: 'none', place: 0, of: of('spades'), why: 'void' },
      { kind: 'some', places: [1], of: of('hearts'), why: 'holds a heart' },
    ]
    const sampler = prepare({ hidden, sizes: [4, 4, 4], hard, soft: [] })
    const rng = seededRng(5)
    for (let i = 0; i < 500; i++) expect(keeps(sampler.sample(rng), hard)).toBe(true)
  })

  /**
   * Thunee's redeal rule, on a deal of its 24 cards: a round is redealt when the counting side holds no trump,
   * so a round in play is one where it held one. Seat 0 looks on at the end of the fourth trick: it is on the
   * counting side with seat 2, hearts are trump, and neither has played a heart nor does seat 0 hold one. So
   * seat 2 must hold a heart now, though most deals of the six hidden cards would give it none.
   */
  describe('a rule of the deal: Thunee’s counting side holds a trump', () => {
    const hidden = cards('Jh 9h Ks Qs Kd Qd')
    /** Places 0, 1 and 2 are seats 1, 2 and 3, two cards each. */
    const redeal: Constraint<Card> = { kind: 'some', places: [1], of: of('hearts'), why: 'the counting side held a trump' }

    test('every world keeps it, and every world that keeps it is equally likely', () => {
      const counts = tally({ hidden, sizes: [2, 2, 2], hard: [redeal], soft: [] }, 5400)
      // 90 deals in all; in 36 of them seat 2 has two of the four other cards.
      expect(counts.size).toBe(54)
      for (const world of counts.keys()) expect(world.split(' | ')[1]).toMatch(/h/)
      expect(chiSquare(counts, 54)).toBeLessThan(95) // p ≈ 0.001 with 53 degrees
    })

    test('it bites: without it, a third of the deals would have been redealt', () => {
      const counts = tally({ hidden, sizes: [2, 2, 2], hard: [], soft: [] }, 3000)
      expect(counts.size).toBe(90)
      const redealt = [...counts].filter(([world]) => !world.split(' | ')[1].includes('h')).reduce((a, [, n]) => a + n, 0)
      expect(redealt / 3000).toBeGreaterThan(0.33)
      expect(redealt / 3000).toBeLessThan(0.47)
    })

    test('a shown void that contradicts it is soft and is dropped; the rule is kept', () => {
      const shown: Constraint<Card> = { kind: 'none', place: 1, of: of('hearts'), why: 'did not follow a heart' }
      const sampler = prepare({ hidden, sizes: [2, 2, 2], hard: [redeal], soft: [shown] })
      expect(sampler.dropped).toEqual([shown])
      expect(sampler.kept).toEqual([])
      const rng = seededRng(9)
      for (let i = 0; i < 200; i++) expect(keeps(sampler.sample(rng), [redeal])).toBe(true)
    })
  })

  test('drops soft evidence newest first, preferring a piece whose loss lets the rest hold', () => {
    const hidden = cards('Jh 9h Ah Js 9s As')
    const oldest: Constraint<Card> = { kind: 'none', place: 0, of: of('hearts'), why: 'oldest' }
    const blocking: Constraint<Card> = { kind: 'none', place: 1, of: of('hearts'), why: 'blocking' }
    const newest: Constraint<Card> = { kind: 'none', place: 2, of: of('clubs'), why: 'newest, harmless' }
    // Three hearts cannot all go to place 2, which holds two.
    const sampler = prepare({ hidden, sizes: [2, 2, 2], hard: [], soft: [oldest, blocking, newest] })
    expect(sampler.dropped).toEqual([blocking])
    expect(sampler.kept).toEqual([oldest, newest])
    const rng = seededRng(11)
    for (let i = 0; i < 100; i++) expect(keeps(sampler.sample(rng), [oldest, newest])).toBe(true)
    // When no single piece is to blame, the newest goes first: four hearts need two places of two.
    const three = prepare({
      hidden: cards('Jh 9h Ah 10h Js 9s'),
      sizes: [2, 2, 2],
      hard: [],
      soft: [oldest, { ...blocking, why: 'a' }, { kind: 'none', place: 2, of: of('hearts'), why: 'b' }],
    })
    expect(three.dropped.map((k) => k.why)).toEqual(['b', 'a'])
  })

  test('throws only when the hard constraints cannot hold, which no real view gives', () => {
    const hidden = cards('Jh 9h Js 9s')
    expect(() => prepare({ hidden, sizes: [2, 2], hard: [{ kind: 'none', place: 0, of: () => true, why: 'impossible' }], soft: [] })).toThrow(/hard constraints/)
    expect(() => prepare({ hidden, sizes: [2, 1], hard: [], soft: [] })).toThrow(/hidden cards/)
    expect(() => prepare({ hidden, sizes: [2, 2], hard: [{ kind: 'holds', place: 0, card: c('Ah'), why: 'not hidden' }], soft: [] })).toThrow(/not hidden/)
  })

  test('never throws when the hard constraints hold, whatever soft evidence a cheat leaves', () => {
    const deck = SUITS.flatMap((suit) => ['A', 'K', 'Q', 'J', '10', '9', '8'].map((rank) => ({ suit, rank })))
    for (let trial = 1; trial <= 300; trial++) {
      const rng = seededRng(trial)
      const places = 2 + Math.floor(rng() * 3)
      const sizes = Array.from({ length: places }, () => 1 + Math.floor(rng() * 6))
      const hidden = shuffle(deck, rng).slice(0, sizes.reduce((a, b) => a + b, 0))
      // The true deal: every hard constraint is drawn from it, so a deal exists.
      const truth: Card[][] = []
      let at = 0
      for (const size of sizes) truth.push(hidden.slice(at, (at += size)))
      const pick = <T>(items: readonly T[]) => items[Math.floor(rng() * items.length)]
      const hard: Constraint<Card>[] = []
      const soft: Constraint<Card>[] = []
      for (let i = 0; i < 6; i++) {
        const place = Math.floor(rng() * places)
        const suit = pick(SUITS)
        const r = rng()
        if (r < 0.2 && truth[place].length > 0) hard.push({ kind: 'holds', place, card: pick(truth[place]), why: 'known' })
        else if (r < 0.4 && !truth[place].some(of(suit))) hard.push({ kind: 'none', place, of: of(suit), why: 'void' })
        else if (r < 0.5 && truth[place].some(of(suit))) hard.push({ kind: 'some', places: [place], of: of(suit), why: 'some' })
        // Soft evidence may be true or false: a cheat's.
        else soft.push(rng() < 0.5 ? { kind: 'none', place, of: of(suit), why: `soft ${i}` } : { kind: 'holds', place, card: pick(hidden), why: `soft ${i}` })
      }
      const sampler = prepare({ hidden, sizes, hard, soft })
      expect(sampler.kept.length + sampler.dropped.length).toBe(soft.length)
      for (let i = 0; i < 5; i++) {
        const world = sampler.sample(rng)
        expect(world.map((p) => p.length)).toEqual(sizes)
        expect(keeps(world, [...hard, ...sampler.kept])).toBe(true)
      }
    }
  })

  test('the same stream gives the same world', () => {
    const knowledge: Knowledge<Card> = { hidden: cards('Jh 9h Ah 10h Js 9s As 10s'), sizes: [3, 3, 2], hard: [], soft: [] }
    const one = prepare(knowledge).sample(seed(5, 2, 'id'))
    expect(prepare(knowledge).sample(seed(5, 2, 'id'))).toEqual(one)
  })
})
