import { describe, expect, test } from 'vitest'
import { hasCard } from '../../../kit/cards'
import { noticed } from '../../../kit/integrity'
import type { Persona } from '../../../kit/mind'
import { allSeats } from '../../../kit/table'
import type { Card } from '../engine/cards'
import { VOID } from '../engine/deals'
import { beginRound } from '../engine/round'
import { PLAYERS, type PassDirection, type RuleOverrides, passTarget } from '../engine/rules'
import { Table, cards, playOf } from '../engine/testing'
import { viewFor } from '../engine/view'
import { chooseChallenge, findProofs, findSignals } from './catch'
import { GIVEN, GIVEN_PASSES, GIVEN_TO_THREE, SLY, SLY_BEFORE_PASSING, SLY_PASSES, SUSPECT, SUSPECT_PLAY, TO_THE_QUEEN } from './deals'

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

type Passing = Exclude<PassDirection, 'none'>
const ROUND: Record<PassDirection, number> = { left: 1, right: 2, across: 3, none: 4 }
const text = (c: Card) => `${c.rank}${c.suit[0]}`

/** The hands before passing that become `after` once each seat passes `passes[seat]` in `direction`. */
function beforePassing(after: string[], passes: string[], direction: Passing): string[] {
  return after.map((hand, seat) => {
    const from = allSeats(PLAYERS).find((s) => passTarget(s, direction) === seat)!
    const received = cards(passes[from])
    return [...cards(hand).filter((c) => !hasCard(received, c)), ...cards(passes[seat])].map(text).join(' ')
  })
}

/** The round of a rotating game that passes `direction`, dealt and passed so the hands are `after`. */
function passed(after: string[], passes: string[], direction: PassDirection, overrides: RuleOverrides = {}): Table {
  const t = new Table(overrides).do(0, { type: 'start' })
  const game = structuredClone(t.game)
  game.roundNumber = ROUND[direction]
  beginRound(game, t.ctx, [])
  t.game = game
  return direction === 'none' ? t.deal(after) : t.deal(beforePassing(after, passes, direction)).pass(passes)
}

/** After passing left. Seat 0 gives seat 1 `5c 3d 4d`; seat 1 also holds its own six of clubs. */
const PLAYED_FIRST = [
  '2c 3c 4c 7c 8c 9c 10c Jc Qc 2d Ad Ah 2s',
  '5c 6c 3d 4d 5d 6d 7d 8d 9d 10d Jd Qd Kd',
  'Qs 2h 3h 4h 5h 6h 7h 8h 9h 10h Jh Qh Kh',
  'Ac Kc As Ks Js 10s 9s 8s 7s 6s 5s 4s 3s',
]
const PLAYED_FIRST_PASSES = ['5c 3d 4d', '2h 3h 4h', 'As Ks Js', '2d Ad Ah']
/** After passing left. Seat 0 holds every club and gives seat 1 three diamonds; seat 1 holds hearts and diamonds. */
const HEART_FIRST = [
  '2c 3c 4c 5c 6c 7c 8c 9c 10c Jc Qc Kc Ac',
  '2h 3h 4h 5h 6h 7h 2d 3d 4d 5d 6d 7d 8d',
  '8h 9h 10h Jh Qh Kh Ah 9d 10d Jd Qd Kd Ad',
  '2s 3s 4s 5s 6s 7s 8s 9s 10s Js Qs Ks As',
]
const HEART_FIRST_PASSES = ['2d 3d 4d', '8h 9h 10h', 'As Ks Qs', 'Ac Kc Qc']
/** After passing left. Seat 1 holds the ace of clubs, the ace of spades, eight hearts and the three diamonds seat 0 gave it. */
const QUEEN_FIRST = [
  '2c Jc Qc Kc 2s 9s 10s Js Ks Jh Qh Kh Ah',
  'Ac As 2d 3d 4d 2h 3h 4h 5h 6h 7h 8h 9h',
  'Qs 3s 4s 3c 4c 5c 6c 5d 6d 7d 8d 9d 10d',
  '5s 6s 7s 8s 7c 8c 9c 10c Jd Qd Kd Ad 10h',
]
const QUEEN_FIRST_PASSES = ['2d 3d 4d', '5d 6d 7d', 'Jd Qd Kd', 'Jh Qh Kh']

const full = (t: Table, seat: number) => viewFor(t.game, seat, 'full')

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

describe('a proof from a passed card', () => {
  // Seat 0 passes seat 1 its only club and leads the two; seat 1 throws the king of diamonds.
  const given = { id: 'followSuit:1:0:given', accused: 1, rule: 'followSuit', claim: null, gap: 0, salience: 1.5 }

  test('keeps the salience it had when the accused card was played, so a miss stays missed', () => {
    // Then seat 2 throws the queen; seat 0 takes her with its two (GIVEN), or seat 3 overtakes with the three (GIVEN_TO_THREE).
    for (const [after, last] of [[GIVEN, '2s'], [GIVEN_TO_THREE, '3c']] as const) {
      const at = (plays: string) => passed([...after], GIVEN_PASSES.left, 'left', { pointsOnFirstTrick: true }).play(plays)
      const moments = [at('2c Kd'), at('2c Kd Qs'), at(`2c Kd Qs ${last}`), at(`2c Kd Qs ${last}`).endPause()]
      for (const t of moments) expect(findProofs(full(t, 0))).toEqual([given])
      let missed = 0
      for (let salt = 1; salt <= 400; salt++) {
        if (chooseChallenge(full(moments[0], 0), { persona: 'straight', salt }) !== null) continue
        missed++
        for (const t of moments.slice(1)) expect(chooseChallenge(full(t, 0), { persona: 'straight', salt })).toBeNull()
      }
      expect(missed).toBeGreaterThan(0)
      expect(chooseChallenge(full(moments[0], 0), { persona: 'straight', salt: 8 })).toBeNull()
    }
  })

  /** The rules seat `seat` broke with its card in trick `trick`. */
  const broke = (t: Table, trick: number, seat: number) => {
    const play = playOf(t.game)
    const plays = trick < play.tricks.length ? play.tricks[trick].plays : play.current
    return plays.find((p) => p.seat === seat)!.broke
  }

  test('comes to the seat that passed to the cheat, and to nobody else, whichever way cards are passed', () => {
    for (const direction of ['left', 'right', 'across'] as const) {
      const t = passed(GIVEN, GIVEN_PASSES[direction], direction).play('2c Kd')
      const passer = allSeats(PLAYERS).find((s) => passTarget(s, direction) === 1)!
      for (const seat of allSeats(PLAYERS)) expect([direction, seat, findProofs(full(t, seat))]).toEqual([direction, seat, seat === passer ? [given] : []])
    }
  })

  test('nothing to prove in a round without passing', () => {
    const none = new Table({ passing: 'none' }).deal(GIVEN).play('2c Kd')
    const fourth = passed(GIVEN, [], 'none').play('2c Kd')
    for (const t of [none, fourth]) {
      expect(broke(t, 0, 1)).toEqual(['followSuit'])
      for (const seat of allSeats(PLAYERS)) expect(findProofs(full(t, seat))).toEqual([])
    }
  })

  test('nothing to prove once the passed card has been played, or from the very card the cheat plays', () => {
    // Seat 1 follows the opening lead with the five of clubs seat 0 gave it, then throws a passed diamond on a club lead while holding its own six.
    const played = passed(PLAYED_FIRST, PLAYED_FIRST_PASSES, 'left').play('2c 5c 2h Ac  Kc 7c 3d')
    expect(broke(played, 1, 1)).toEqual(['followSuit'])
    expect(findProofs(full(played, 0))).toEqual([])
    // Seat 0 gives seat 1 three diamonds and no club; seat 1 throws one of them while holding its own five of clubs.
    const own = passed(GIVEN, ['Kd Qd Jd', ...GIVEN_PASSES.left.slice(1)], 'left').play('2c Kd')
    expect(broke(own, 0, 1)).toEqual(['followSuit'])
    expect(findProofs(full(own, 0))).toEqual([])
  })

  test('follows the house rules: a heart on the first trick proves nothing when points are allowed there', () => {
    // Seat 1, void in clubs, throws a heart on the opening lead while holding the diamonds seat 0 gave it.
    const at = (overrides: RuleOverrides) => passed(HEART_FIRST, HEART_FIRST_PASSES, 'left', overrides).play('2c 2h')
    expect(findProofs(full(at({}), 0))).toEqual([{ ...given, id: 'firstTrickPoints:1:0:given', rule: 'firstTrickPoints' }])
    expect(broke(at({ pointsOnFirstTrick: true }), 0, 1)).toEqual([])
    expect(findProofs(full(at({ pointsOnFirstTrick: true }), 0))).toEqual([])
  })

  test('follows the house rules: a heart led after only the queen has fallen proves nothing when she breaks hearts', () => {
    // Seat 1 wins two tricks, the second with the queen in it, then leads a heart while holding the diamonds seat 0 gave it.
    const at = (overrides: RuleOverrides) => passed(QUEEN_FIRST, QUEEN_FIRST_PASSES, 'left', overrides).play('2c Ac 3c 7c  As Qs 5s 2s  2h')
    expect(findProofs(full(at({}), 0))).toEqual([{ ...given, id: 'heartsLead:1:2:given', rule: 'heartsLead' }])
    expect(broke(at({ queenBreaksHearts: true }), 2, 1)).toEqual([])
    expect(findProofs(full(at({ queenBreaksHearts: true }), 0))).toEqual([])
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
