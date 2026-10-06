import { describe, expect, test } from 'vitest'
import { type Persona, viewFor } from '../games/thunee/engine'
import { Table, card } from '../games/thunee/engine/testing'
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

  test('Sly passes up a cheat it would have to show soon; Wild takes it', () => {
    const t = start(TWO_HEARTS).play('Ah 10h 9h')
    expect(playFor(t, 1, 'sly')).toEqual({ type: 'playCard', card: card('Qh') })
    expect(playFor(t, 1, 'wild')).toEqual({ type: 'playCard', card: card('10s') })
    expect(playFor(t, 1, 'straight')).toEqual({ type: 'playCard', card: card('Qh') })
  })

  test('Sly declines a cheat whose giveaway would be a 9 (risk 0.281, not 0.234)', () => {
    // Seat 1 holds 9c as its only club; the opponents lead 10c and seat 0 trumps with Qs. As would win for 25.
    const NINE = ['Qs Jh 9h Ah 10h Kh', 'As 9c Kd Jd 10d Ad', '10c Jc Ac Kc Qc 9d', 'Js 9s 10s Ks Qh Qd']
    const t = start(NINE).play('10c Qh Qs')
    expect(playFor(t, 1, 'sly')).toEqual({ type: 'playCard', card: card('9c') })
    expect(playFor(t, 1, 'wild')).toEqual({ type: 'playCard', card: card('As') })
  })

  test('after a renege, Sly keeps the giveaway card back while it has anything else', () => {
    const t = start().play('Kc Qh 10c 10s').endPause()
    expect(playFor(t, 1, 'sly')).toEqual({ type: 'playCard', card: card('Kd') })
    expect(playFor(t, 1, 'straight')).toEqual({ type: 'playCard', card: card('Qc') })
  })
})

describe('false Jodhis', () => {
  // Seat 1 trumps the first trick; it holds Kd and Qc, and neither partner card has been seen.
  const won = () => start().play('Ah Qh 9h 10s')
  const bluffs = (t: Table, persona: Persona) => {
    let count = 0
    for (let salt = 1; salt <= 400; salt++) {
      const claim = chooseJodhi(viewFor(t.game, 1, 'full'), { persona, salt })
      if (claim) {
        expect(claim).toMatchObject({ type: 'claimJodhi', withJack: false })
        expect(['diamonds', 'clubs']).toContain((claim as { suit: string }).suit)
        count++
      }
    }
    return count / 400
  }

  test('Sly and Wild sometimes claim a Jodhi they half hold; honest personas never do', () => {
    for (const persona of ['sly', 'wild'] as const) {
      const r = bluffs(won(), persona)
      expect(r).toBeGreaterThan(0.6)
      expect(r).toBeLessThan(0.9)
    }
    expect(bluffs(won(), 'straight')).toBe(0)
    expect(bluffs(won(), 'sharp')).toBe(0)
  })

  test('Wild bluffs a Jodhi whose other card has been seen; Sly never does', () => {
    // Seat 1 trumps a heart trick in which seat 0, void in hearts, throws the Qd; seat 1 holds Kd and Qc.
    const SEEN = ['Ks Qs 10c Qd Jd 9d', 'Js 9s As 10s Kd Qc', 'Jc 9c Ac Kc Ah 10h', 'Jh 9h Kh Qh Ad 10d']
    const t = start(SEEN).play('Ah Qh Qd 10s')
    const phase = t.game.phase
    if (phase.kind !== 'trickPause') throw new Error(phase.kind)
    expect(phase.play.tricks[0].plays.every((p) => p.broke.length === 0)).toBe(true)
    const diamonds = (persona: Persona) => {
      let count = 0
      for (let salt = 1; salt <= 400; salt++) {
        const claim = chooseJodhi(viewFor(t.game, 1, 'full'), { persona, salt })
        if (claim?.type === 'claimJodhi' && claim.suit === 'diamonds') count++
      }
      return count
    }
    expect(diamonds('wild')).toBeGreaterThan(0)
    expect(diamonds('sly')).toBe(0)
  })

  test('Sly bluffs at most once a round', () => {
    const t = won()
    let salt = 1
    while (salt <= 1000 && !chooseJodhi(viewFor(t.game, 1, 'full'), { persona: 'sly', salt })) salt++
    const claim = chooseJodhi(viewFor(t.game, 1, 'full'), { persona: 'sly', salt })
    expect(claim).not.toBeNull()
    t.do(1, claim!)
    for (let s = 1; s <= 100; s++) expect(chooseJodhi(viewFor(t.game, 1, 'full'), { persona: 'sly', salt: s })).toBeNull()
  })
})
