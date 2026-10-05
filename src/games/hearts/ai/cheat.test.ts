import { describe, expect, test } from 'vitest'
import type { Persona } from '../../../kit/mind'
import { VOID } from '../engine/deals'
import type { RuleOverrides } from '../engine/rules'
import { Table, card, playOf } from '../engine/testing'
import { viewFor } from '../engine/view'
import { decide } from './choose'
import { SLY, SLY_BEFORE_PASSING, SLY_PASSES, TO_THE_QUEEN } from './deals'

/** Points on the first trick: seat 2 throws a heart on it, then seat 3 leads the king of hearts to seat 1's lone ace. */
const SMALL = [
  '2c 3c 4c 2h 2d 3d 4d 5d 2s 3s 4s 5s 6s',
  '5c 6c Ah 6d 7d 8d 9d 10d 7s 8s 9s 10s Js',
  '3h 4h 5h 6h 7h 8h 9h 10h Jh Qh Jd Qd Kd',
  'Ac Kh 7c 8c 9c 10c Jc Qc Kc Ad Qs Ks As',
]

const playFor = (t: Table, persona: Persona, seat = t.turn) => decide(viewFor(t.game, seat, 'full'), { persona, salt: 1 })
const atTheQueen = (overrides: RuleOverrides = {}) => new Table({ passing: 'none', ...overrides }).deal(SLY).play(TO_THE_QUEEN)

describe('cheating', () => {
  test('Sly and Wild renege rather than take the queen when the giveaway can wait seven tricks; Straight and Sharp never do', () => {
    const t = atTheQueen()
    const renege = { action: { type: 'playCard', card: card('Kd') }, reason: { code: 'renege', card: card('Kd'), honest: card('As'), dodges: 13 } }
    expect(playFor(t, 'sly')).toEqual(renege)
    expect(playFor(t, 'wild')).toEqual(renege)
    for (const honest of ['straight', 'sharp'] as const) expect(playFor(t, honest)?.action).toEqual({ type: 'playCard', card: card('As') })
  })

  test('Sly passes up the same cheat when the seat that passed it the suit knows it is there; Wild takes it', () => {
    const t = new Table({ passing: 'left' }).deal(SLY_BEFORE_PASSING).pass(SLY_PASSES).play(TO_THE_QUEEN)
    expect(playOf(t.game).hands[1]).toEqual(expect.arrayContaining([card('As'), card('Kd')]))
    expect(playFor(t, 'sly')?.action).toEqual({ type: 'playCard', card: card('As') })
    expect(playFor(t, 'wild')?.reason).toMatchObject({ code: 'renege', card: card('Kd'), dodges: 13 })
  })

  test('Wild reneges for a few points only when its mood is up', () => {
    const t = new Table({ passing: 'none', pointsOnFirstTrick: true }).deal(SMALL).play('2c 5c 3h Ac  Kh 2h')
    expect(playFor(t, 'wild')?.action).toEqual({ type: 'playCard', card: card('Ah') })
    expect(playFor(t, 'sly')?.action).toEqual({ type: 'playCard', card: card('Ah') })
    t.game = { ...t.game, scores: [0, 30, 10, 0] }
    expect(playFor(t, 'wild')?.reason).toEqual({ code: 'renege', card: card('Js'), honest: card('Ah'), dodges: 3 })
  })

  test('a renege breaks no rule but following suit', () => {
    // Seat 1 throws the queen on the first trick against the rules; seat 2 would take it with its jack of clubs.
    const t = new Table({ passing: 'none' }).deal(VOID).play('2c Qs')
    const decision = playFor(t, 'wild')
    expect(decision?.reason).toMatchObject({ code: 'renege', honest: card('Jc'), dodges: 13 })
    t.do(2, decision!.action)
    expect(playOf(t.game).current.at(-1)!.broke).toEqual(['followSuit'])
  })

  test('nobody reneges with cheating off', () => {
    const t = atTheQueen({ allowCheating: false })
    for (const persona of ['sly', 'wild'] as const) expect(playFor(t, persona)?.action).toEqual({ type: 'playCard', card: card('As') })
  })
})

describe('holding back', () => {
  // After reneging with the king of diamonds, seat 1 is void in clubs and holds the ace of spades, its highest card.
  const afterRenege = () => atTheQueen().play('Kd 5h  7c 3c')

  test('after a renege, Sly keeps the giveaway back while it has another card; Wild does not', () => {
    const t = afterRenege()
    expect(playFor(t, 'sly')).toEqual({ action: { type: 'playCard', card: card('Qd') }, reason: { code: 'dumpHigh', card: card('Qd') } })
    expect(playFor(t, 'wild')?.action).toEqual({ type: 'playCard', card: card('As') })
  })

  test('with nothing else left, the giveaway comes out', () => {
    const t = afterRenege()
    const view = viewFor(t.game, 1, 'full')
    if (view.phase.kind !== 'playing') throw new Error(view.phase.kind)
    expect(decide({ ...view, phase: { ...view.phase, hand: [card('As')] } }, { persona: 'sly', salt: 1 })?.action).toEqual({ type: 'playCard', card: card('As') })
  })
})
