import { describe, expect, test } from 'vitest'
import { cardId } from '../../../kit/cards'
import { HONEST, type Mind } from '../../../kit/mind'
import { FOUR, THREE, VOID } from '../engine/deals'
import { STANDARD } from '../engine/rules'
import { Table, cards } from '../engine/testing'
import { viewFor } from '../engine/view'
import { countTricks, decide, nilHand } from './choose'

const four = { rules: STANDARD, playerCount: 4 }
const decision = (t: Table, mind: Mind = HONEST) => decide(viewFor(t.game, t.turn, 'full'), mind)!
const played = (t: Table) => {
  const d = decision(t)
  if (d.action.type !== 'playCard') throw new Error(d.action.type)
  return { card: cardId(d.action.card), code: d.reason.code }
}

describe('counting tricks to call', () => {
  test('high spades with guards, length past three, side aces and kings, and ruffs with spades to spare', () => {
    // A K Q of spades: three; the side aces two; nothing else.
    expect(countTricks(four, cards('As Ks Qs 2c 3c 4c Ac 2d 3d Ad 2h 3h 4h'))).toMatchObject({ spades: 3, sides: 2, ruffs: 0, total: 5 })
    // A bare king of spades counts nothing; five low spades count two by length; a void in hearts ruffs with a spare.
    expect(countTricks(four, cards('Ks 2c 3c 4c 5c 6c 2d 3d 4d 5d 6d 7d 8d')).spades).toBe(0)
    expect(countTricks(four, cards('2s 3s 4s 5s 6s 2c 3c 4c 5c 2d 3d 4d 5d 6d 7d 8d'.split(' ').slice(0, 13).join(' ')))).toMatchObject({ spades: 2, ruffs: 1 })
    expect(countTricks(four, cards('As 2s 3s 4s 2c 3c 4c 5c 2d 3d 4d 5d 6d'))).toMatchObject({ spades: 2, ruffs: 1 })
    // A king with a guard is half a trick with four, a whole one with fewer players.
    expect(countTricks(four, cards('2s Kc 2c 3c 4c 5c 2d 3d 4d 5d 2h 3h 4h')).sides).toBe(0.5)
    expect(countTricks({ rules: STANDARD, playerCount: 2 }, cards('2s Kc 2c 3c 4c 5c 2d 3d 4d 5d 2h 3h 4h')).sides).toBe(1)
  })

  test('Nil: low cards, few and low spades, a low card in every side suit; never with three', () => {
    const low = cards('2s 5s 2c 3c 4c 9c 2d 3d 7d 2h 3h 6h 8h')
    expect(nilHand(four, low)).toBe(true)
    expect(nilHand(four, cards('10s 5s 2c 3c 4c 9c 2d 3d 7d 2h 3h 6h 8h'))).toBe(false)
    expect(nilHand(four, cards('2s 5s 7c 8c 9c 10c 2d 3d 7d 2h 3h 6h 8h'))).toBe(false)
    expect(nilHand({ rules: STANDARD, playerCount: 3 }, low)).toBe(false)
  })

  test('a call is the count, and the second of a partnership trims one when the two would call eleven', () => {
    const t = new Table(4).deal(FOUR, 3)
    expect(decision(t)).toMatchObject({ action: { type: 'call', tricks: 3 }, reason: { code: 'call', trimmed: false } })
    t.call(1, 1)
    // Seat 2, holding three spades and four tricks' worth beside its partner's one: no trim.
    expect(decision(t)).toMatchObject({ reason: { code: 'call', trimmed: false } })
  })

  test('a hand turned down is looked at, unless the side is far enough behind for Blind nil and the roll says so', () => {
    const t = new Table(4, { blindNil: true }).deal(FOUR, 3, [0, 150])
    expect(decision(t)).toEqual({ action: { type: 'lookAtHand' }, reason: { code: 'look' } })
    const behind = new Table(4, { blindNil: true }).deal(FOUR, 3, [0, 400])
    const choices = Array.from({ length: 40 }, (_, salt) => decide(viewFor(behind.game, 0, 'full'), { persona: 'straight', salt })!.reason.code)
    expect(choices).toContain('blindNil')
    expect(choices).toContain('look')
  })
})

describe('drawing, with two', () => {
  test('keeps a spade or an ace, passes a low side card', () => {
    const t = new Table(2).begin()
    for (let i = 0; i < 26; i++) {
      const phase = t.game.phase
      if (phase.kind !== 'drawing') break
      const top = phase.stock[0]
      const d = decide(viewFor(t.game, phase.turn, 'full'), HONEST)!
      if (top.suit === 'spades' || top.rank === 'A') expect(d.action).toEqual({ type: 'draw', keep: true })
      if (top.suit !== 'spades' && ['2', '3', '4', '5'].includes(top.rank)) expect(d.action).toEqual({ type: 'draw', keep: false })
      t.do(phase.turn, d.action)
    }
    expect(t.game.phase.kind).toBe('calling')
  })
})

describe('play', () => {
  test('a forced opening is the lowest club', () => {
    const t = new Table(3).deal(THREE, 0).call(5, 5, 5)
    expect(played(t)).toEqual({ card: '3-clubs', code: 'openingLead' })
  })

  test('with the contract to make, the lowest card that wins; void, the lowest spade that wins', () => {
    const t = new Table(4).deal(VOID, 3).call(3, 4, 3, 3).play('2c')
    expect(played(t)).toEqual({ card: 'J-spades', code: 'trump' })
    t.play('Js')
    // Seat 2 cannot beat a spade with a club: its lowest.
    expect(played(t)).toEqual({ card: '9-clubs', code: 'playLow' })
  })

  test('the partner winning for sure: low', () => {
    const t = new Table(4).deal(VOID, 3).call(3, 4, 3, 3).play('2c Qs 9c')
    // Seat 3 holds clubs, its partner seat 1 has trumped with the queen and only the king and ace of spades are out, both with seat 1.
    expect(played(t)).toEqual({ card: 'Q-clubs', code: 'partnerWinning' })
  })

  test('the partner’s Nil: lead high so it can play under', () => {
    const t = new Table(4).deal(FOUR, 3).call(3, 3, 'nil', 3)
    expect(played(t).code).toBe('leadForNil')
  })

  test('an opponent’s Nil: lead low at it', () => {
    const t = new Table(4).deal(FOUR, 3).call(3, 'nil', 3, 3)
    expect(played(t)).toEqual({ card: '2-hearts', code: 'leadAtNil' })
  })

  test('playing Nil: the highest card that still loses', () => {
    // Seat 2 leads low at seat 1's Nil; seat 3 covers its partner with the ace; seat 1 plays under with its highest heart.
    const t = new Table(4).deal(FOUR, 1).call(3, 3, 3, 'nil')
    expect(played(t)).toEqual({ card: '8-hearts', code: 'leadAtNil' })
    t.play('8h')
    expect(played(t)).toEqual({ card: 'A-hearts', code: 'coverNil' })
    t.play('Ah 2h')
    expect(played(t)).toEqual({ card: '7-hearts', code: 'nilDuck' })
  })

  test('the same decision for the hand in any order', () => {
    const t = new Table(4).deal(FOUR, 3).call(3, 3, 3, 3)
    const view = viewFor(t.game, 0, 'full')
    const phase = view.phase
    if (phase.kind !== 'playing') throw new Error(phase.kind)
    const reversed = { ...view, phase: { ...phase, hand: [...phase.hand].reverse() } }
    expect(decide(reversed, HONEST)).toEqual(decide(view, HONEST))
  })
})
