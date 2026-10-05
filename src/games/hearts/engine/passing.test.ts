import { describe, expect, test } from 'vitest'
import { cardId, sameCard } from '../../../kit/cards'
import { STALL_MS, replaceableSeats } from '../../../kit/table'
import { collectCards } from '../../../kit/testing'
import { seatsToAct } from './apply'
import { availableActions } from './available'
import { VOID } from './deals'
import { Table, card, cards, playOf } from './testing'
import { viewFor } from './view'

// Each seat gives away the first three cards of its VOID hand.
const GIVE = ['2c 3c 4c', '4d 5d 6d', '9c 10c Jc', 'Qc Kc Ac']

describe('the deal', () => {
  test('the start deals thirteen cards to each seat, and the first round passes left', () => {
    const t = new Table().do(0, { type: 'start' })
    const phase = t.game.phase
    if (phase.kind !== 'passing') throw new Error(phase.kind)
    expect(phase.hands.map((h) => h.length)).toEqual([13, 13, 13, 13])
    expect(new Set(phase.hands.flat().map(cardId)).size).toBe(52)
    expect(phase.direction).toBe('left')
    expect(t.game.roundNumber).toBe(1)
    expect(t.game.scores).toEqual([0, 0, 0, 0])
    expect(t.events).toContainEqual({ type: 'dealt', roundNumber: 1, direction: 'left' })
  })

  test('every deal draws a different shuffle and a salt', () => {
    const a = new Table({}, 1).do(0, { type: 'start' }).game
    const b = new Table({}, 2).do(0, { type: 'start' }).game
    expect(Number.isInteger(a.aiSalt)).toBe(true)
    expect(a.aiSalt).not.toBe(b.aiSalt)
    expect(a.phase).not.toEqual(b.phase)
  })
})

describe('passing', () => {
  test('chosen cards stay in the hand until the fourth seat chooses, then each seat’s go to the seat on its left', () => {
    const t = new Table().deal(VOID)
    t.do(0, { type: 'choosePass', cards: cards(GIVE[0]) })
    expect(t.events).toContainEqual({ type: 'passChosen', seat: 0 })
    const passing = t.game.phase
    if (passing.kind !== 'passing') throw new Error(passing.kind)
    expect(passing.hands[0]).toHaveLength(13)
    for (const seat of [1, 2, 3]) t.do(seat, { type: 'choosePass', cards: cards(GIVE[seat]) })
    expect(t.events).toContainEqual({ type: 'passesExchanged' })
    const play = playOf(t.game)
    expect(play.hands.map((h) => h.length)).toEqual([13, 13, 13, 13])
    // Left: 0 gives to 1, 1 to 2, 2 to 3, 3 to 0.
    expect(play.received).toEqual([cards(GIVE[3]), cards(GIVE[0]), cards(GIVE[1]), cards(GIVE[2])])
    expect(play.gave).toEqual(GIVE.map(cards))
    for (const c of cards(GIVE[0])) {
      expect(play.hands[1]).toContainEqual(c)
      expect(play.hands[0]).not.toContainEqual(c)
    }
  })

  test('whoever holds the two of clubs after the pass leads', () => {
    // Seat 0 passes the two of clubs to seat 1.
    const t = new Table().deal(VOID).pass(GIVE)
    expect(t.game.phase).toMatchObject({ kind: 'playing', turn: 1 })
    expect(availableActions(viewFor(t.game, 1)).play).toEqual([card('2c')])
  })

  test('the second round passes right and the third across', () => {
    const t = new Table().deal(VOID).pass(GIVE).autoPlay('roundResult')
    t.deal(VOID)
    expect(t.events).toContainEqual({ type: 'dealt', roundNumber: 2, direction: 'right' })
    t.pass(GIVE)
    expect(playOf(t.game).received).toEqual([cards(GIVE[1]), cards(GIVE[2]), cards(GIVE[3]), cards(GIVE[0])])
    t.autoPlay('roundResult').deal(VOID)
    expect(t.events).toContainEqual({ type: 'dealt', roundNumber: 3, direction: 'across' })
    t.pass(GIVE)
    expect(playOf(t.game).received).toEqual([cards(GIVE[2]), cards(GIVE[3]), cards(GIVE[0]), cards(GIVE[1])])
  })

  test('the fourth round has no pass: play starts at once', () => {
    const t = new Table().do(0, { type: 'start' }).autoPlay('roundResult')
    for (const round of [2, 3]) {
      t.do(0, { type: 'nextRound' })
      expect(t.game.roundNumber).toBe(round)
      t.autoPlay('roundResult')
    }
    t.deal(VOID)
    expect(t.game.roundNumber).toBe(4)
    expect(t.events).toContainEqual({ type: 'dealt', roundNumber: 4, direction: 'none' })
    expect(t.game.phase).toMatchObject({ kind: 'playing', turn: 0 })
    expect(playOf(t.game).received).toEqual([[], [], [], []])
    expect(playOf(t.game).gave).toEqual([[], [], [], []])
    expect(viewFor(t.game, 0).direction).toBe('none')
    t.autoPlay('roundResult').do(0, { type: 'nextRound' })
    expect(t.game.phase.kind).toBe('passing')
    expect(viewFor(t.game, 0).direction).toBe('left')
  })

  test('with passing always left, every round passes left; with no passing, no round does', () => {
    const left = new Table({ passing: 'left' }).do(0, { type: 'start' }).autoPlay('roundResult')
    for (let round = 2; round <= 4; round++) {
      left.do(0, { type: 'nextRound' })
      expect(left.game.phase).toMatchObject({ kind: 'passing', direction: 'left' })
      left.autoPlay('roundResult')
    }
    const none = new Table({ passing: 'none' }).do(0, { type: 'start' })
    expect(none.game.phase.kind).toBe('playing')
    expect(none.events).toContainEqual({ type: 'dealt', roundNumber: 1, direction: 'none' })
  })

  test('choosing twice is rejected, and so are cards not held, the wrong number, or the same card twice', () => {
    const t = new Table().deal(VOID)
    expect(t.try(0, { type: 'choosePass', cards: cards('2c 3c 4d') })).toBe('badChoice')
    expect(t.try(0, { type: 'choosePass', cards: cards('2c 3c') })).toBe('badChoice')
    expect(t.try(0, { type: 'choosePass', cards: cards('2c 3c 4c 5c') })).toBe('badChoice')
    expect(t.try(0, { type: 'choosePass', cards: cards('2c 2c 3c') })).toBe('badChoice')
    expect(t.try(null, { type: 'choosePass', cards: cards('2c 3c 4c') })).toBe('notSeated')
    t.do(0, { type: 'choosePass', cards: cards('2c 3c 4c') })
    expect(t.try(0, { type: 'choosePass', cards: cards('5c 6c 7c') })).toBe('notAllowed')
    expect(availableActions(viewFor(t.game, 0)).pass).toEqual([])
    expect(availableActions(viewFor(t.game, 1)).pass).toHaveLength(13)
    expect(t.try(1, { type: 'playCard', card: card('4d') })).toBe('wrongPhase')
  })

  test('a seat cannot see what it will receive, or anyone else’s choice', () => {
    const t = new Table().deal(VOID)
    for (const seat of [0, 1, 2]) t.do(seat, { type: 'choosePass', cards: cards(GIVE[seat]) })
    // Seat 3 receives from seat 2; seat 0 from seat 3.
    for (const seat of [0, 1, 2, 3, null]) {
      const view = viewFor(t.game, seat)
      const others = [0, 1, 2].filter((s) => s !== seat).flatMap((s) => cards(GIVE[s]))
      expect(collectCards(view).filter((c) => others.some((o) => sameCard(o, c)))).toEqual([])
      expect(view.phase).toMatchObject({ kind: 'passing', chosen: [0, 1, 2] })
    }
    expect(viewFor(t.game, 2).phase).toMatchObject({ choice: cards(GIVE[2]) })
    expect(viewFor(t.game, 3).phase).toMatchObject({ choice: null })
    t.do(3, { type: 'choosePass', cards: cards(GIVE[3]) })
    expect(viewFor(t.game, 3).phase).toMatchObject({ received: cards(GIVE[2]), gave: cards(GIVE[3]) })
  })

  test('the table waits on every seat that has not chosen, and a host can replace one who stalls', () => {
    const t = new Table().deal(VOID)
    expect(seatsToAct(t.game)).toEqual([0, 1, 2, 3])
    expect(t.game.waiting.map((w) => w.seat)).toEqual([0, 1, 2, 3])
    t.do(0, { type: 'choosePass', cards: cards(GIVE[0]) }).do(1, { type: 'choosePass', cards: cards(GIVE[1]) })
    expect(seatsToAct(t.game)).toEqual([2, 3])
    t.now += STALL_MS + 1
    expect(replaceableSeats(viewFor(t.game, 0), t.now)).toEqual([2, 3])
    t.do(0, { type: 'replaceWithAi', seat: 3 })
    expect(t.game.seats[3].standIn).toBe(true)
    expect(t.game.aiActAt).not.toBeNull()
  })

  test('a seat that passes last and then holds the two of clubs starts a fresh wait', () => {
    const t = new Table().deal(VOID)
    for (const seat of [1, 2, 3]) t.do(seat, { type: 'choosePass', cards: cards(GIVE[seat]) })
    t.now += STALL_MS + 1
    // Seat 0 keeps the two of clubs.
    t.do(0, { type: 'choosePass', cards: cards('8c 7c 6c') })
    expect(t.game.phase).toMatchObject({ kind: 'playing', turn: 0 })
    expect(t.game.waiting).toEqual([{ seat: 0, since: t.now }])
    expect(replaceableSeats(viewFor(t.game, 1), t.now)).toEqual([])
  })
})
