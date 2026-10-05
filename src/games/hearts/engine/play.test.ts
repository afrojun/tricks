import { describe, expect, test } from 'vitest'
import { availableActions } from './available'
import { ALL_HEARTS, ALL_POINTS, LEAD, VOID } from './deals'
import type { RuleOverrides } from './rules'
import { Table, card, cards, playOf } from './testing'
import { viewFor } from './view'

/** A round without passing, dealt `hands`. */
const start = (hands = VOID, overrides: RuleOverrides = {}) => new Table({ passing: 'none', ...overrides }).deal(hands)
const can = (t: Table, seat: number) => availableActions(viewFor(t.game, seat))
/** The record of the latest card played. */
const last = (t: Table) => {
  const play = playOf(t.game)
  return play.current.length > 0 ? play.current[play.current.length - 1] : play.tricks[play.tricks.length - 1].plays[3]
}

describe('the opening lead', () => {
  for (const allowCheating of [true, false]) {
    test(`whoever holds the two of clubs leads it, and only it (cheating ${allowCheating ? 'on' : 'off'})`, () => {
      const t = start(VOID, { allowCheating })
      expect(t.turn).toBe(0)
      expect(can(t, 0).play).toEqual([card('2c')])
      expect(can(t, 0).legal).toEqual([card('2c')])
      for (const other of cards(VOID[0]).slice(1)) expect(t.try(0, { type: 'playCard', card: other })).toBe('illegalCard')
      expect(t.try(0, { type: 'playCard', card: card('Qs') })).toBe('cardNotInHand')
      expect(t.try(1, { type: 'playCard', card: card('4d') })).toBe('notYourTurn')
      expect(t.try(null, { type: 'playCard', card: card('2c') })).toBe('notSeated')
      t.play('2c')
      expect(last(t).broke).toEqual([])
    })
  }

  test('play runs clockwise: each seat is followed by the next', () => {
    const t = start()
    const turns = [t.turn]
    for (const c of ['2c', '4d', '9c']) turns.push(t.play(c).turn)
    expect(turns).toEqual([0, 1, 2, 3])
  })
})

describe('following suit', () => {
  test('a player who holds the led suit must follow it', () => {
    const t = start().play('2c 4d')
    expect(can(t, 2).legal).toEqual(cards('9c 10c Jc'))
    t.play('9c')
    expect(last(t).broke).toEqual([])
  })

  test('with cheating on, a renege is accepted and recorded; with it off, refused', () => {
    const t = start().play('2c 4d')
    expect(can(t, 2).play).toHaveLength(13)
    t.play('8d')
    expect(last(t)).toMatchObject({ seat: 2, card: card('8d'), broke: ['followSuit'] })
    expect(last(t).handBefore).toHaveLength(13)

    const off = start(VOID, { allowCheating: false }).play('2c 4d')
    expect(can(off, 2).play).toEqual(cards('9c 10c Jc'))
    expect(off.try(2, { type: 'playCard', card: card('8d') })).toBe('illegalCard')
  })

  test('a player who holds none of the led suit may play another, and records nothing', () => {
    const t = start().play('2c 4d')
    expect(last(t)).toMatchObject({ seat: 1, broke: [] })
  })
})

describe('the first trick', () => {
  test('no heart and no queen of spades, unless the hand holds nothing else', () => {
    const t = start().play('2c')
    expect(can(t, 1).legal).toEqual(cards('4d 5d 6d 7d 4s 5s 6s 7s'))
    expect(last(start().play('2c 4h')).broke).toEqual(['firstTrickPoints'])
    expect(last(start().play('2c Qs')).broke).toEqual(['firstTrickPoints'])
    const off = start(VOID, { allowCheating: false }).play('2c')
    expect(off.try(1, { type: 'playCard', card: card('Qs') })).toBe('illegalCard')
  })

  test('a heart played off suit by a player who could follow breaks both rules', () => {
    expect(last(start().play('2c 4d 8h')).broke).toEqual(['followSuit', 'firstTrickPoints'])
  })

  test('a hand of nothing but hearts and the queen of spades may play them', () => {
    const t = start(ALL_POINTS).play('2c')
    expect(can(t, 1).legal).toHaveLength(13)
    t.play('Qs')
    expect(last(t).broke).toEqual([])
    // Seat 2 holds diamonds beside its heart.
    expect(can(t, 2).legal).toEqual(cards('2d 3d 4d 5d 6d 7d 8d 9d 10d Jd Qd Kd'))
    expect(last(t.play('Ah')).broke).toEqual(['firstTrickPoints'])
  })

  test('with points allowed on the first trick, the rule is dropped', () => {
    const t = start(VOID, { pointsOnFirstTrick: true }).play('2c')
    expect(can(t, 1).legal).toHaveLength(13)
    expect(last(t.play('4h')).broke).toEqual([])
    expect(last(t.play('8h')).broke).toEqual(['followSuit'])
  })

  test('after the first trick, a void player may throw points', () => {
    // Seat 3 wins the first trick and leads a club; seat 1 has none.
    const t = start().play('2c 4d 9c Ac  Qc 3c')
    expect(can(t, 1).legal).toHaveLength(12)
    expect(last(t.play('Qs')).broke).toEqual([])
  })
})

describe('breaking hearts', () => {
  test('a heart may not be led until a heart has been played', () => {
    const t = start(LEAD).play('2c Ac 6c Jc').endPause()
    expect(t.turn).toBe(1)
    expect(can(t, 1).legal).toEqual(cards('5d 6d 7d Qs 5s 6s'))
    expect(playOf(t.game).heartsBroken).toBe(false)
    t.play('5h')
    expect(last(t).broke).toEqual(['heartsLead'])
    expect(playOf(t.game).heartsBroken).toBe(true)
    expect(t.events.filter((e) => e.type === 'heartsBroken')).toHaveLength(1)

    const off = start(LEAD, { allowCheating: false }).play('2c Ac 6c Jc').endPause()
    expect(off.try(1, { type: 'playCard', card: card('5h') })).toBe('illegalCard')
  })

  test('a heart thrown on another suit breaks them, and then they may be led', () => {
    // Seat 1 throws a heart on the second trick; seat 3 wins it and may lead hearts.
    const t = start().play('2c 4d 9c Ac  Qc 3c 4h 10c')
    expect(playOf(t.game).heartsBroken).toBe(true)
    t.endPause()
    expect(can(t, 3).legal).toEqual(cards('Kc Qd Kd Ad Js Ks As Jh Qh Kh Ah'))
    expect(last(t.play('Jh')).broke).toEqual([])
  })

  test('a hand of nothing but hearts may lead one before they are broken', () => {
    const t = start(ALL_HEARTS).play('2c Ac Kc 2s').endPause()
    expect(t.turn).toBe(1)
    expect(can(t, 1).legal).toHaveLength(12)
    expect(last(t.play('2h')).broke).toEqual([])
  })

  test('the queen of spades may be led at any time, and breaks hearts only under its rule', () => {
    const plain = start(LEAD).play('2c Ac 6c Jc  Qs')
    expect(last(plain).broke).toEqual([])
    expect(playOf(plain.game).heartsBroken).toBe(false)
    plain.play('7s Ks 2s').endPause()
    expect(can(plain, 3).legal.some((c) => c.suit === 'hearts')).toBe(false)

    const queen = start(LEAD, { queenBreaksHearts: true }).play('2c Ac 6c Jc  Qs')
    expect(playOf(queen.game).heartsBroken).toBe(true)
    expect(queen.events).toContainEqual({ type: 'heartsBroken' })
    queen.play('7s Ks 2s').endPause()
    expect(can(queen, 3).legal).toEqual(expect.arrayContaining(cards('Kh Ah')))
  })
})

describe('winning a trick', () => {
  test('the highest card of the led suit wins, and its winner leads after a pause', () => {
    const t = start(LEAD).play('2c Ac 6c Jc')
    expect(t.game.phase.kind).toBe('trickPause')
    expect(t.events).toContainEqual({ type: 'trickWon', seat: 1, points: 0 })
    expect(t.try(1, { type: 'playCard', card: card('5d') })).toBe('wrongPhase')
    t.advance(1999)
    expect(t.game.phase.kind).toBe('trickPause')
    t.advance(1)
    expect(t.game.phase).toMatchObject({ kind: 'playing', turn: 1 })
  })

  test('a card off the led suit never wins, however high, and the trick’s points go to its winner', () => {
    const t = start().play('2c 4d 9c Ac  Qc 3c Qs 10c')
    expect(t.events).toContainEqual({ type: 'trickWon', seat: 3, points: 13 })
    expect(viewFor(t.game, 0).phase).toMatchObject({ taken: [0, 0, 0, 13] })
  })

  test('a round is thirteen tricks, then it is scored', () => {
    const t = start().autoPlay('roundResult')
    expect(t.events.filter((e) => e.type === 'trickWon')).toHaveLength(13)
    expect(t.events.filter((e) => e.type === 'roundScored')).toHaveLength(1)
  })
})
