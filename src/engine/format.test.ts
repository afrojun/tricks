import { describe, expect, test } from 'vitest'
import { upgradeGame } from './format'
import { checkInvariants } from './invariants'
import { Table } from './testing'
import { FORMAT_VERSION } from './types'
import { viewFor } from './view'

// Dealer 0: seat 1 is trumper (spades), seat 2 leads. Teams: 0+2 count, 1+3 trump.
const D1 = ['Jh 9h Ks Qs 10c Qd', 'Js 9s As 10s Kd Qc', 'Jc 9c Ac Kc Ah 10h', 'Jd 9d Ad 10d Kh Qh']

/** Seat 1 trumps the first trick and then claims a diamond Jodhi it cannot have. */
const claimed = () => {
  const t = new Table(4, { redealIfNoTrumps: false }).deal(D1).toPlay('spades').play('Ah Qh 9h 10s')
  return t.do(1, { type: 'claimJodhi', suit: 'diamonds', withJack: false })
}

describe('saved state for computer players', () => {
  test('every deal draws a salt that no view carries', () => {
    const a = new Table(4, {}, 1).do(0, { type: 'start' }).game
    const b = new Table(4, {}, 2).do(0, { type: 'start' }).game
    expect(Number.isInteger(a.aiSalt)).toBe(true)
    expect(a.aiSalt).not.toBe(b.aiSalt)
    for (const seat of [0, 1, null]) expect(JSON.stringify(viewFor(a, seat))).not.toContain('aiSalt')
  })

  test('a Jodhi claim records how many tricks had been played, and views show it', () => {
    const t = claimed()
    const phase = viewFor(t.game, 0).phase
    if (phase.kind !== 'trickPause') throw new Error(phase.kind)
    expect(phase.jodhiClaims[0]).toMatchObject({ seat: 1, suit: 'diamonds', trick: 1 })
  })

  test('a format 1 save mid-round is upgraded; anything older is refused; current saves pass through', () => {
    const t = claimed()
    const old: any = structuredClone(t.game) // a save written before the fields existed
    old.formatVersion = 1
    delete old.aiSalt
    for (const seat of old.seats) {
      delete seat.persona
      delete seat.personaHidden
    }
    for (const claim of old.phase.play.jodhiClaims) delete claim.trick

    const game = upgradeGame(old, 77)!
    expect(game.formatVersion).toBe(FORMAT_VERSION)
    expect(game.aiSalt).toBe(77)
    expect(game.seats.every((s) => s.persona === 'straight' && !s.personaHidden)).toBe(true)
    if (game.phase.kind !== 'trickPause') throw new Error(game.phase.kind)
    expect(game.phase.play.jodhiClaims[0].trick).toBe(1)
    expect(() => checkInvariants(game)).not.toThrow()

    expect(upgradeGame({ ...old, formatVersion: 0 }, 1)).toBeNull()
    expect(upgradeGame(null, 1)).toBeNull()
    expect(upgradeGame(t.game, 5)).toEqual(t.game)
  })
})
