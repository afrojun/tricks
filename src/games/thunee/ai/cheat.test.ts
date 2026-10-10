import { describe, expect, test } from 'vitest'
import { type Card, type Persona, sameCard, viewFor } from '../engine'
import { Table, card } from '../engine/testing'
import { chooseAction, chooseJodhi } from './choose'

// Dealer 0: seat 1 is trumper (spades), seat 2 leads. Teams: 0+2 count, 1+3 trump.
const D1 = ['Jh 9h Ks Qs 10c Qd', 'Js 9s As 10s Kd Qc', 'Jc 9c Ac Kc Ah 10h', 'Jd 9d Ad 10d Kh Qh']
// Seat 1 holds two hearts it would have to show soon after cheating on a heart trick.
const TWO_HEARTS = ['9h Jh 10c Ks Qs Qd', 'Js 10s Kh Qh 9d Kd', 'Ah Kc 9c Ac Jc 10d', '10h Jd Ad Qc 9s As']
const start = (hands = D1) => new Table(4, { redealIfNoTrumps: false }).deal(hands).toPlay('spades')
const playFor = (t: Table, seat: number, persona: Persona, salt = 1) => chooseAction(viewFor(t.game, seat, 'full'), { persona, salt })

describe('cheating', () => {
  test('Sly trumps a club trick it should follow when its one club can wait five tricks', () => {
    const t = start().play('Kc Qh 10c')
    expect(playFor(t, 1, 'sly')).toEqual({ type: 'playCard', card: card('10s') })
    for (const honest of ['straight', 'sharp'] as const) expect(playFor(t, 1, honest)).toEqual({ type: 'playCard', card: card('Qc') })
  })

  test('Sly and Wild pass up a cheat they would have to show soon', () => {
    const t = start(TWO_HEARTS).play('Ah 10h 9h')
    expect(playFor(t, 1, 'sly')).toEqual({ type: 'playCard', card: card('Qh') })
    for (let salt = 1; salt <= 200; salt++) expect(playFor(t, 1, 'wild', salt)).toEqual({ type: 'playCard', card: card('Qh') })
    expect(playFor(t, 1, 'straight')).toEqual({ type: 'playCard', card: card('Qh') })
  })

  test('Sly declines a cheat whose giveaway would be a 9 (risk 0.281, not 0.234); Wild, with more nerve, gives in now and then', () => {
    // Seat 1 holds 9c as its only club; the opponents lead 10c and seat 0 trumps with Qs. As would win for 25.
    const NINE = ['Qs Jh 9h Ah 10h Kh', 'As 9c Kd Jd 10d Ad', '10c Jc Ac Kc Qc 9d', 'Js 9s 10s Ks Qh Qd']
    const t = start(NINE).play('10c Qh Qs')
    const plays = (persona: Persona) => Array.from({ length: 1000 }, (_, i) => playFor(t, 1, persona, i + 1))
    expect(plays('sly').every((a) => sameCard((a as { card: Card }).card, card('9c')))).toBe(true)
    // Wild's nerve is 0.3, above the risk; it gives in to a trick's temptation 15% of the time.
    const wild = plays('wild')
    for (const a of wild) expect(['9c', 'As'].map(card)).toContainEqual((a as { card: Card }).card)
    const took = wild.filter((a) => sameCard((a as { card: Card }).card, card('As'))).length / wild.length
    expect(took).toBeGreaterThan(0.11)
    expect(took).toBeLessThan(0.19)
  })

  test('after a renege, Sly keeps the giveaway card back while it has anything else', () => {
    const t = start().play('Kc Qh 10c 10s').endPause()
    expect(playFor(t, 1, 'sly')).toEqual({ type: 'playCard', card: card('Kd') })
    expect(playFor(t, 1, 'straight')).toEqual({ type: 'playCard', card: card('Qc') })
  })
})

describe('false Jodhis', () => {
  const claims = (t: Table, persona: Persona) => {
    let count = 0
    for (let salt = 1; salt <= 400; salt++) {
      const claim = chooseJodhi(viewFor(t.game, 1, 'full'), { persona, salt })
      if (claim) {
        expect(claim).toEqual({ type: 'claimJodhi', suit: 'diamonds', withJack: false })
        count++
      }
    }
    return count / 400
  }
  // Seat 1 trumps the first trick, then leads 10d: both opponents show out, and seat 3 wins with Jd.
  // Seat 1 holds Kd; the Qd can only be in its partner's hand.
  const SHOWN_OUT = ['Ah 10h 10c Kc Qc Qs', 'Js 9s As 10s Kd 10d', 'Qh Kh Jc 9c Ac Ks', 'Jd 9d Ad Qd Jh 9h']
  const shownOut = () =>
    new Table(4, { redealIfNoTrumps: false, jodhiTiming: 'anyTrick' }).deal(SHOWN_OUT).toPlay('spades').play('Qh Jh Ah 10s  10d Jc Jd Kc')

  test('Wild sometimes bluffs a Jodhi when neither opponent can hold the other card; nobody else does', () => {
    const r = claims(shownOut(), 'wild')
    expect(r).toBeGreaterThan(0.35)
    expect(r).toBeLessThan(0.65)
    for (const persona of ['sly', 'straight', 'sharp'] as const) expect(claims(shownOut(), persona)).toBe(0)
  })

  test('Wild does not trust a show-out the opponent has since contradicted', () => {
    // As SHOWN_OUT, but seat 0 holds Ad: it reneges with Kc on the diamond lead, then shows Ad in trick 2,
    // which seat 1 wins with a trump.
    const CONTRADICTED = ['Ah 10h Ad Kc Qc Qs', 'Js 9s As 10s Kd 10d', 'Qh Kh Jc 9c Ac Ks', 'Jd 9d 10c Qd Jh 9h']
    const t = new Table(4, { redealIfNoTrumps: false, jodhiTiming: 'anyTrick' })
      .deal(CONTRADICTED)
      .toPlay('spades')
      .play('Qh Jh Ah 10s  10d Jc Jd Kc')
    expect(claims(t, 'wild')).toBeGreaterThan(0)
    t.endPause().play('9h Ad Js Kh')
    expect(claims(t, 'wild')).toBe(0)
  })

  test('nobody bluffs a Jodhi whose other card an opponent may hold', () => {
    // Seat 1 trumps the first trick; it holds Kd and Qc, and neither opponent has shown out of either suit.
    const t = start().play('Ah Qh 9h 10s')
    for (const persona of ['sly', 'wild', 'straight', 'sharp'] as const) expect(claims(t, persona)).toBe(0)
  })

  test('Wild bluffs at most once a round', () => {
    const t = shownOut()
    let salt = 1
    while (salt <= 1000 && !chooseJodhi(viewFor(t.game, 1, 'full'), { persona: 'wild', salt })) salt++
    const claim = chooseJodhi(viewFor(t.game, 1, 'full'), { persona: 'wild', salt })
    expect(claim).not.toBeNull()
    t.do(1, claim!)
    for (let s = 1; s <= 100; s++) expect(chooseJodhi(viewFor(t.game, 1, 'full'), { persona: 'wild', salt: s })).toBeNull()
  })
})
