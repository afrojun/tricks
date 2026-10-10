import { describe, expect, test } from 'vitest'
import type { Persona } from '../../../kit/mind'
import { FOUR } from '../engine/deals'
import { Table } from '../engine/testing'
import { viewFor } from '../engine/view'
import { chooseChallenge, findProofs } from './catch'
import { decide } from './choose'

/** Seat 1 called Nil and must follow the two of clubs with a club that wins it. */
const atRisk = () => new Table(4).deal(FOUR, 3).call(3, 'nil', 3, 3).play('2c')
const mind = (persona: Persona) => ({ persona, salt: 7 })

describe('cheating', () => {
  test('Wild reneges to save a Nil; Sly weighs it and, so early, with three watching, holds back; Straight and Sharp never do', () => {
    const t = atRisk()
    const d = decide(viewFor(t.game, 1, 'full'), mind('wild'))!
    expect(d.reason).toMatchObject({ code: 'renege', saves: 'nil' })
    if (d.action.type !== 'playCard') throw new Error(d.action.type)
    expect(d.action.card.suit).not.toBe('clubs')
    expect(d.action.card.suit).not.toBe('spades')
    for (const persona of ['sly', 'straight', 'sharp'] as const) expect(decide(viewFor(t.game, 1, 'full'), mind(persona))!.reason.code).toBe('playLow')
  })
})

describe('catching', () => {
  test('a later club proves the renege to the other side, never to the cheat’s partner', () => {
    const t = atRisk().play('7d 10c Kc').endPause()
    // Seat 3 won with the king of clubs and leads; seat 1, the cheat, follows a club lead with a club.
    t.play('Ac 3c 6c')
    expect(findProofs(viewFor(t.game, 0, 'full')).map((p) => p.accused)).toEqual([1])
    expect(findProofs(viewFor(t.game, 2, 'full')).map((p) => p.accused)).toEqual([1])
    expect(findProofs(viewFor(t.game, 3, 'full'))).toEqual([])
    expect(chooseChallenge(viewFor(t.game, 3, 'full'), mind('sharp'))).toBeNull()
    const caught = [0, 1, 2, 3, 4, 5].map((salt) => chooseChallenge(viewFor(t.game, 0, 'full'), { persona: 'sharp', salt }))
    expect(caught.filter((a) => a !== null).length).toBeGreaterThan(3)
    expect(caught.find((a) => a !== null)).toEqual({ type: 'challengePlay', seat: 1 })
  })

  test('a play an accusation has settled proves nothing more', () => {
    const t = new Table(4, { renege: 'bidPlusThree' }).deal(FOUR, 3).call(3, 'nil', 3, 3).play('2c 7d 10c Kc')
    t.do(0, { type: 'challengePlay', seat: 1 }).endPause()
    t.play('Ac 3c 6c')
    expect(findProofs(viewFor(t.game, 0, 'full'))).toEqual([])
  })
})
