import { describe, expect, test } from 'vitest'
import { mindFor } from '../../../kit/mind'
import { availableActions } from './available'
import { checkInvariants } from './invariants'
import { CLASSIC_APP, type RuleOverrides, TRADITIONAL } from './rules'
import { Table, card, cards } from './testing'
import type { Game } from './types'
import { viewFor } from './view'

// Dealer 0: seat 1 is trumper (team 1), seat 2 leads. Teams: 0+2 count, 1+3 trump.
const D1 = ['Jh 9h Ks Qs 10c Qd', 'Js 9s As 10s Kd Qc', 'Jc 9c Ac Kc Ah 10h', 'Jd 9d Ad 10d Kh Qh']
const start = (overrides: RuleOverrides = {}) => new Table(4, { redealIfNoTrumps: false, ...overrides }).deal(D1).toPlay('spades')
const can = (t: Table, seat: number) => availableActions(viewFor(t.game, seat))
const playOf = (game: Game) => {
  if (game.phase.kind !== 'playing' && game.phase.kind !== 'trickPause') throw new Error(game.phase.kind)
  return game.phase.play
}

describe('allowCheating', () => {
  test('is on in Traditional and in the classic app', () => {
    expect(TRADITIONAL.allowCheating).toBe(true)
    expect(CLASSIC_APP.allowCheating).toBe(true)
  })

  describe('on', () => {
    test('any held card may be played; a rule-breaking one is accepted and recorded', () => {
      const t = start().play('Jc Qh') // seat 0 holds the 10 of clubs
      expect(can(t, 0).play).toEqual(cards('Jh 9h Ks Qs 10c Qd'))
      expect(can(t, 0).legal).toEqual(cards('10c'))
      t.play('Jh')
      expect(playOf(t.game).current[2].broke).toEqual(['renege'])
      checkInvariants(t.game)
    })

    test('a false Jodhi is accepted, and recorded as false', () => {
      const t = start().play('Ah Qh 9h 10s') // seat 1 trumps; it holds Kd but not Qd
      t.do(1, { type: 'claimJodhi', suit: 'diamonds', withJack: false })
      expect(playOf(t.game).jodhiClaims[0].valid).toBe(false)
      checkInvariants(t.game)
    })

    test('an opponent who has played, and an opponent’s Jodhi, may be accused', () => {
      const t = start().play('Ah Qh 9h 10s').do(1, { type: 'claimJodhi', suit: 'diamonds', withJack: false })
      expect(can(t, 0)).toMatchObject({ challengePlay: [1, 3], challengeJodhi: [0] })
    })

    test('each computer plays with its own persona', () => {
      const t = start()
      const game: Game = { ...t.game, seats: t.game.seats.map((s) => ({ ...s, kind: 'ai', persona: 'wild' })) }
      for (const seat of [0, 1, 2, 3]) expect(mindFor(game, seat).persona).toBe('wild')
    })
  })

  describe('off', () => {
    const off = { allowCheating: false }

    test('only legal cards may be played: a rule-breaking card is refused, a card not held is not in the hand', () => {
      const t = start(off).play('Jc Qh')
      expect(can(t, 0).play).toEqual(cards('10c'))
      expect(can(t, 0).legal).toEqual(cards('10c'))
      expect(t.try(0, { type: 'playCard', card: card('Jh') })).toBe('illegalCard')
      expect(t.try(0, { type: 'playCard', card: card('Jc') })).toBe('cardNotInHand')
      t.play('10c')
      expect(playOf(t.game).current[2].broke).toEqual([])
    })

    test('an undercut is refused too, and a card no rule forbids is still played', () => {
      // Seat 2 leads a diamond; seat 0 trumps with Ks; seat 1, holding clubs, may not undercut with Qs.
      const t = new Table(4, { redealIfNoTrumps: false, ...off })
        .deal(['Ks Jh 9h Ah 10h Kh', 'Qs Js Jc 9c Ac 10s', 'Jd 9d Ad 10d Kd Qd', 'Qh Kc Qc 10c 9s As'])
        .toPlay('spades')
        .play('Jd Qh Ks')
      expect(t.try(1, { type: 'playCard', card: card('Qs') })).toBe('illegalCard')
      expect(can(t, 1).play).toEqual(cards('Js Jc 9c Ac 10s'))
      t.play('Js')
    })

    test('a false Jodhi is refused; a true one is accepted', () => {
      const t = start(off).play('Jc Qh 10c Qc') // team 0 wins; seat 0 holds Ks Qs, seat 2 Kc but no Qc
      expect(t.try(2, { type: 'claimJodhi', suit: 'clubs', withJack: false })).toBe('falseClaim')
      expect(t.try(0, { type: 'claimJodhi', suit: 'spades', withJack: true })).toBe('falseClaim')
      t.do(0, { type: 'claimJodhi', suit: 'spades', withJack: false })
      expect(playOf(t.game).jodhiClaims.map((j) => j.valid)).toEqual([true])
    })

    test('a dealt Jodhi counts cards already played, as the claim would be judged', () => {
      // Seat 3 was dealt K+Q of hearts but has played both by the time team 1 wins a trick.
      const claim = (jodhiCards: 'inHand' | 'dealt') =>
        start({ ...off, jodhiCards }).play('Jc Qh 10c Qc  9c Kh Qd 10s').try(3, { type: 'claimJodhi', suit: 'hearts', withJack: false })
      expect(claim('inHand')).toBe('falseClaim')
      expect(claim('dealt')).toBeNull()
    })

    test('nobody may accuse', () => {
      const t = start(off).play('Jc Qh 10c Qc').do(0, { type: 'claimJodhi', suit: 'spades', withJack: false })
      for (const seat of [0, 1, 2, 3]) expect(can(t, seat)).toMatchObject({ challengePlay: [], challengeJodhi: [] })
      expect(t.try(1, { type: 'challengePlay', seat: 0 })).toBe('notAllowed')
      expect(t.try(1, { type: 'challengeJodhi', claim: 0 })).toBe('notAllowed')
    })

    test('every computer plays as Straight, whatever its persona', () => {
      const t = start(off)
      const game: Game = { ...t.game, seats: t.game.seats.map((s) => ({ ...s, kind: 'ai', persona: 'wild' })) }
      for (const seat of [0, 1, 2, 3]) expect(mindFor(game, seat).persona).toBe('straight')
    })

    test('the invariants refuse a rule-breaking card or a false claim that got through', () => {
      const cheat = start().play('Jc Qh Jh').game
      expect(() => checkInvariants({ ...cheat, rules: { ...cheat.rules, allowCheating: false } })).toThrow(/rule-breaking/)
      const bluff = start().play('Ah Qh 9h 10s').do(1, { type: 'claimJodhi', suit: 'diamonds', withJack: false }).game
      expect(() => checkInvariants({ ...bluff, rules: { ...bluff.rules, allowCheating: false } })).toThrow(/false Jodhi/)
    })
  })
})
