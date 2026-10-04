import { describe, expect, test } from 'vitest'
import { type Persona, viewFor } from '../engine'
import { Table } from '../engine/testing'
import { chooseChallenge, findProofs, noticeOdds } from './suspicion'

// Dealer 0: seat 1 is trumper (spades), seat 2 leads. Teams: 0+2 count, 1+3 trump.
// Seat 1 holds one club (Qc); seat 0 holds Qd.
const D1 = ['Jh 9h Ks Qs 10c Qd', 'Js 9s As 10s Kd Qc', 'Jc 9c Ac Kc Ah 10h', 'Jd 9d Ad 10d Kh Qh']
const start = (hands = D1, players: 2 | 4 = 4) => new Table(players, { redealIfNoTrumps: false }).deal(hands).toPlay('spades')

/** Seat 1 trumps a 45-point club trick it should have followed, then leads its club at once. */
const clumsy = () => start().play('Kc Qh 10c Js').endPause().play('Qc')
/** Seat 1 discards on a cheap club trick it loses, then holds its club until trick 6. */
const patient = () => start().play('Kc Qh 10c Kd  Qd 10s 10h Jd  As Ah Kh Qs  9s Ac 10d Ks  Js 9c Ad Jh  Qc')
/** Seat 1 trumps the first trick, then claims a diamond Jodhi; seat 0 holds the Qd. */
const falseJodhi = () => start().play('Ah Qh 9h 10s').do(1, { type: 'claimJodhi', suit: 'diamonds', withJack: false })

const rate = (t: Table, seat: number, persona: Persona, salts = 2000) => {
  let caught = 0
  for (let salt = 1; salt <= salts; salt++) if (chooseChallenge(viewFor(t.game, seat, 'full'), { persona, salt })) caught++
  return caught / salts
}

describe('proofs', () => {
  test('a renege shown up on the next trick, after winning a big trick the observer led, is certain to be noticed', () => {
    const view = viewFor(clumsy().game, 2, 'full')
    const proofs = findProofs(view)
    expect(proofs).toHaveLength(1)
    expect(proofs[0]).toMatchObject({ id: 'renege:1:0:1', accused: 1, claim: null, gap: 0 })
    expect(proofs[0].salience).toBeCloseTo(1.3 * 1.3 * 1.2)
    for (let salt = 1; salt <= 50; salt++) {
      expect(chooseChallenge(view, { persona: 'straight', salt })).toEqual({ type: 'challengePlay', seat: 1 })
    }
  })

  test('a renege held back until trick 6 is usually missed, even by Sharp', () => {
    const t = patient()
    const proofs = findProofs(viewFor(t.game, 2, 'full'))
    expect(proofs).toHaveLength(1)
    expect(proofs[0]).toMatchObject({ id: 'renege:1:0:5', accused: 1, gap: 4 })
    expect(proofs[0].salience).toBeCloseTo(1.2)
    expect(noticeOdds(0.95, 4, 1.2)).toBeCloseTo(0.285)
    const sharp = rate(t, 2, 'sharp')
    expect(sharp).toBeGreaterThan(0.24)
    expect(sharp).toBeLessThan(0.33)
    const straight = rate(t, 2, 'straight')
    expect(straight).toBeGreaterThan(0.14)
    expect(straight).toBeLessThan(0.22)
  })

  test('partners are never accused, and a fair round holds no proof', () => {
    expect(findProofs(viewFor(clumsy().game, 3, 'full'))).toEqual([])
    const fair = start().play('Jc Qh 10c Qc  9c Kh Qd 10s')
    for (const seat of [0, 1, 2, 3]) expect(findProofs(viewFor(fair.game, seat, 'full'))).toEqual([])
  })

  test('a Jodhi disproved by the observer’s own hand stands out; an observer without the card sees nothing', () => {
    const t = falseJodhi()
    const proofs = findProofs(viewFor(t.game, 0, 'full'))
    expect(proofs).toEqual([{ id: 'jodhi:0:Q-diamonds', accused: 1, claim: 0, gap: 0, salience: 1.5 }])
    expect(findProofs(viewFor(t.game, 2, 'full'))).toEqual([])
    for (let salt = 1; salt <= 50; salt++) {
      expect(chooseChallenge(viewFor(t.game, 0, 'full'), { persona: 'sharp', salt })).toEqual({ type: 'challengeJodhi', claim: 0 })
    }
    const straight = rate(t, 0, 'straight')
    expect(straight).toBeGreaterThan(0.85)
    expect(straight).toBeLessThan(0.95)
  })

  test('an undercut is proved when the player later shows a plain card, only under the undercut rule', () => {
    // Seat 2 leads a diamond; seat 0 trumps with Ks; seat 1 undercuts with Qs while holding clubs,
    // then follows seat 0's heart lead with Jc.
    const UNDERCUT = ['Ks Jh 9h Ah 10h Kh', 'Qs Js Jc 9c Ac 10s', 'Jd 9d Ad 10d Kd Qd', 'Qh Kc Qc 10c 9s As']
    const moves = (t: Table) => t.deal(UNDERCUT).toPlay('spades').play('Jd Qh Ks Qs').endPause().play('Jh Jc')
    const proofs = findProofs(viewFor(moves(new Table(4, { redealIfNoTrumps: false })).game, 2, 'full'))
    expect(proofs).toHaveLength(1)
    expect(proofs[0]).toMatchObject({ id: 'undercut:1:0:1', accused: 1, gap: 0 })
    expect(proofs[0].salience).toBeCloseTo(1.3 * 1.2 * 1.2)
    const free = moves(new Table(4, { redealIfNoTrumps: false, undercutRestriction: false }))
    expect(findProofs(viewFor(free.game, 2, 'full'))).toEqual([])
  })

  test('a void shown in one half proves nothing about a card played in the next', () => {
    const view = viewFor(clumsy().game, 2, 'full')
    const phase = view.phase
    if (phase.kind !== 'playing') throw new Error(phase.kind)
    // The same cards, but the reveal now falls in a later half with a fresh hand
    // (history() labels the current trick with phase.half; the cheat trick keeps half 1).
    expect(findProofs({ ...view, phase: { ...phase, half: 2 } })).toEqual([])
  })
})
