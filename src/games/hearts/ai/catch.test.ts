import { describe, expect, test } from 'vitest'
import { noticed } from '../../../kit/integrity'
import type { Persona } from '../../../kit/mind'
import { VOID } from '../engine/deals'
import { Table } from '../engine/testing'
import { viewFor } from '../engine/view'
import { chooseChallenge, findProofs, findSignals } from './catch'
import { SLY, SLY_BEFORE_PASSING, SLY_PASSES, SUSPECT, SUSPECT_PLAY, TO_THE_QUEEN } from './deals'

/** Seat 1 reneges with the king of diamonds rather than take the queen, then shows the ace of spades on the next trick. */
const dodged = () => new Table({ passing: 'none' }).deal(SLY).play(`${TO_THE_QUEEN} Kd 5h  7c 3c As`)
/** Seat 0 throws a diamond on a club trick while holding clubs, and follows clubs on the next. No points are involved. */
const plain = () => new Table({ passing: 'none' }).deal(VOID).play('2c 4d 9c Ac  Qc 2d 5d 10c  Kc 3c')
/** `SUSPECT` dealt after passing left, so every seat could have emptied a suit. */
const SUSPECT_BEFORE_PASSING = [
  '2c 3c 4c 5c 6c 5d 6d 2s 3s 4s 5s 6s 7s',
  '7c 8c 9c 10c Qs 2h 3h 4h 5h 8s 6h 7h 8h',
  '9h 10h Jh Qh Kh 9s 10s Js Ks As Jc Qc Kc',
  'Ac 7d 8d 9d 10d Jd Qd Kd Ad Ah 2d 3d 4d',
]
const SUSPECT_PASSES = ['5s 6s 7s', '6h 7h 8h', 'Jc Qc Kc', '2d 3d 4d']

const rate = (t: Table, seat: number, persona: Persona, salts = 2000) => {
  let caught = 0
  for (let salt = 1; salt <= salts; salt++) if (chooseChallenge(viewFor(t.game, seat, 'full'), { persona, salt })) caught++
  return caught / salts
}
const noticeRate = (t: Table, seat: number, persona: Persona, salts = 2000) => {
  const proofs = findProofs(viewFor(t.game, seat, 'full'))
  let caught = 0
  for (let salt = 1; salt <= salts; salt++) if (noticed(proofs, { persona, salt }, seat)) caught++
  return caught / salts
}

describe('proofs', () => {
  test('a renege that dodged the queen stands out, the more to whoever was left with her', () => {
    const proof = { id: 'followSuit:1:4:5', accused: 1, rule: 'followSuit', claim: null, gap: 0 }
    expect(findProofs(viewFor(dodged().game, 0, 'full'))).toEqual([{ ...proof, salience: 1.5 }])
    expect(findProofs(viewFor(dodged().game, 3, 'full'))).toEqual([{ ...proof, salience: 1.5 * 1.2 }])
    expect(findProofs(viewFor(dodged().game, 1, 'full'))).toEqual([])
  })

  test('a plain renege does not', () => {
    expect(findProofs(viewFor(plain().game, 2, 'full'))).toEqual([{ id: 'followSuit:0:1:2', accused: 0, rule: 'followSuit', claim: null, gap: 0, salience: 1 }])
  })

  test('a seat that passed the cheat a card of the suit sees through the renege at once', () => {
    const t = new Table({ passing: 'left' }).deal(SLY_BEFORE_PASSING).pass(SLY_PASSES).play(`${TO_THE_QUEEN} Kd`)
    expect(findProofs(viewFor(t.game, 0, 'full'))).toEqual([{ id: 'followSuit:1:4:given', accused: 1, rule: 'followSuit', claim: null, gap: 0, salience: 1.5 * 1.5 }])
    for (const seat of [2, 3]) expect(findProofs(viewFor(t.game, seat, 'full'))).toEqual([])
    for (let salt = 1; salt <= 50; salt++) expect(chooseChallenge(viewFor(t.game, 0, 'full'), { persona: 'straight', salt })).toEqual({ type: 'challengePlay', seat: 1 })
  })

  test('attention comes with the persona', () => {
    const t = plain()
    const straight = noticeRate(t, 2, 'straight')
    expect(straight).toBeGreaterThan(0.55)
    expect(straight).toBeLessThan(0.65)
    const wild = noticeRate(t, 2, 'wild')
    expect(wild).toBeGreaterThan(0.3)
    expect(wild).toBeLessThan(0.4)
    expect(noticeRate(t, 2, 'sharp')).toBeGreaterThan(0.92)
    // With the queen dodged: 0.6 x 1.5 for Straight, and certain for the seat that took her.
    const q = rate(dodged(), 0, 'straight')
    expect(q).toBeGreaterThan(0.86)
    expect(q).toBeLessThan(0.94)
    expect(rate(dodged(), 3, 'straight', 200)).toBe(1)
  })

  test('a proof missed once stays missed', () => {
    const before = plain()
    const after = plain().play('6d')
    expect(findProofs(viewFor(after.game, 2, 'full'))).toEqual(findProofs(viewFor(before.game, 2, 'full')))
    let missed = 0
    for (let salt = 1; salt <= 300; salt++) {
      const was = chooseChallenge(viewFor(before.game, 2, 'full'), { persona: 'straight', salt })
      expect(chooseChallenge(viewFor(after.game, 2, 'full'), { persona: 'straight', salt })).toEqual(was)
      if (was === null) missed++
    }
    expect(missed).toBeGreaterThan(0)
  })
})

describe('signals', () => {
  test('showing out of a suit early when few could, and throwing a card on a trick that holds the queen', () => {
    const t = new Table({ passing: 'none' }).deal(SUSPECT).play(SUSPECT_PLAY)
    expect(findSignals(viewFor(t.game, 0, 'full'))).toEqual([
      { id: 'void:0:2', accused: 2, at: 0 },
      { id: 'void:1:1', accused: 1, at: 1 },
      { id: 'queen:1:2', accused: 2, at: 1 },
      { id: 'void:1:2', accused: 2, at: 1 },
    ])
  })

  test('after a pass, an early void is no surprise: the seat may have passed the suit away', () => {
    const t = new Table({ passing: 'left' }).deal(SUSPECT_BEFORE_PASSING).pass(SUSPECT_PASSES).play(SUSPECT_PLAY)
    expect(findSignals(viewFor(t.game, 0, 'full'))).toEqual([{ id: 'queen:1:2', accused: 2, at: 1 }])
  })

  test('a void counts once per suit', () => {
    // Seat 1 shows out of clubs on both of seat 3's club leads.
    const t = new Table({ passing: 'none' }).deal(VOID).play('2c 4d 9c Ac  Qc 3c 5d 10c')
    expect(findSignals(viewFor(t.game, 2, 'full')).filter((s) => s.accused === 1)).toEqual([{ id: 'void:0:1', accused: 1, at: 0 }])
  })
})

describe('hunches', () => {
  // Seat 1 shows out of clubs on the first trick, as VOID deals it: one signal, and no proof.
  const shownOut = () => new Table({ passing: 'none' }).deal(VOID).play('2c 4d')

  test('Wild sometimes accuses on one signal, more often when behind', () => {
    const t = shownOut()
    expect(findProofs(viewFor(t.game, 2, 'full'))).toEqual([])
    const wild = rate(t, 2, 'wild')
    expect(wild).toBeGreaterThan(0.1)
    expect(wild).toBeLessThan(0.14)
    t.game = { ...t.game, scores: [0, 10, 40, 0] }
    const behind = rate(t, 2, 'wild')
    expect(behind).toBeGreaterThan(0.16)
    expect(behind).toBeLessThan(0.2)
  })

  test('a hunch gets the same one look before and after its trick completes', () => {
    const during = shownOut()
    const after = shownOut().play('9c Ac')
    for (let salt = 1; salt <= 300; salt++) {
      const mind = { persona: 'wild' as const, salt }
      expect(chooseChallenge(viewFor(after.game, 2, 'full'), mind)).toEqual(chooseChallenge(viewFor(during.game, 2, 'full'), mind))
    }
  })

  test('Sharp acts on a hunch only from a third signal against one seat, at about its 0.3 chance', () => {
    const one = new Table({ passing: 'none' }).deal(SUSPECT).play('2c 7c 9s Ac')
    expect(rate(one, 0, 'sharp')).toBe(0)
    const three = new Table({ passing: 'none' }).deal(SUSPECT).play(SUSPECT_PLAY)
    const sharp = rate(three, 0, 'sharp')
    expect(sharp).toBeGreaterThan(0.26)
    expect(sharp).toBeLessThan(0.34)
    for (let salt = 1; salt <= 50; salt++) {
      const action = chooseChallenge(viewFor(three.game, 0, 'full'), { persona: 'sharp', salt })
      if (action) expect(action).toEqual({ type: 'challengePlay', seat: 2 })
    }
  })

  test('Straight and Sly never accuse without a proof', () => {
    const t = new Table({ passing: 'none' }).deal(SUSPECT).play(SUSPECT_PLAY)
    for (const persona of ['straight', 'sly'] as const) {
      expect(rate(t, 0, persona, 500)).toBe(0)
      expect(rate(shownOut(), 2, persona, 500)).toBe(0)
    }
  })
})
