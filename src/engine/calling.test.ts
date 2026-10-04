import { describe, expect, test } from 'vitest'
import { availableActions } from './available'
import { sameCard } from './cards'
import { CLASSIC_APP_OVERRIDES } from './rules'
import { Table, collectCards } from './testing'
import type { Game, RoundSummary } from './types'
import { viewFor } from './view'

// Dealer 0, so seat 1 is the default trumper and seat 2 leads.
const D1 = ['Jh 9h Ks Qs 10c Qd', 'Js 9s As 10s Kd Qc', 'Jc 9c Ac Kc Ah 10h', 'Jd 9d Ad 10d Kh Qh']
// Seats 0 and 2 (the counting team) hold no spades.
const NO_SPADES = ['Jh 9h Ah 10h Kh Qd', 'Js 9s As 10s Ks Qh', 'Jc 9c Ac 10c Kc Qc', 'Jd 9d Ad 10d Kd Qs']

const calling = (t: Table) => {
  if (t.game.phase.kind !== 'calling') throw new Error(t.game.phase.kind)
  return t.game.phase
}

/** No view may contain a card from another hand or the stock. */
function expectNoLeak(game: Game) {
  const phase = game.phase
  if (!('hands' in phase)) return
  for (const seat of [0, 1, 2, 3, null]) {
    const hidden = [...phase.hands.filter((_, s) => s !== seat).flat(), ...phase.stock]
    const seen = collectCards(viewFor(game, seat))
    expect(seen.filter((c) => hidden.some((h) => sameCard(h, c)))).toEqual([])
  }
}

describe('dealing', () => {
  test('four cards each, starting at the dealer’s right, with eight left in stock', () => {
    const t = new Table().do(0, { type: 'start' })
    const phase = calling(t)
    expect(phase.hands.map((h) => h.length)).toEqual([4, 4, 4, 4])
    expect(phase.stock).toHaveLength(8)
    expect(phase.deadline).toBe(t.now + 10_000)
    expect(t.events).toContainEqual({ type: 'dealt', roundNumber: 1, dealer: t.game.dealer, half: 1 })
  })

  test('views during calling hide other hands and the stock', () => {
    const t = new Table().deal(D1)
    expectNoLeak(t.game)
    expect(viewFor(t.game, 0).phase).toMatchObject({ kind: 'calling', handCounts: [4, 4, 4, 4] })
    expect(viewFor(t.game, null).phase).toMatchObject({ hand: [] })
  })
})

describe('calling', () => {
  test('the default trumper may not make the first call', () => {
    const t = new Table().deal(D1)
    expect(t.try(1, { type: 'call', amount: 10 })).toBe('notAllowed')
    expect(availableActions(viewFor(t.game, 1)).calls).toEqual([])
  })

  test('only an opponent of the highest caller may raise, and only to a higher valid amount', () => {
    const t = new Table().deal(D1).do(2, { type: 'call', amount: 10 })
    expect(t.try(0, { type: 'call', amount: 20 })).toBe('notAllowed') // partner
    expect(t.try(2, { type: 'call', amount: 20 })).toBe('notAllowed') // self
    expect(t.try(1, { type: 'call', amount: 10 })).toBe('badAmount')
    expect(t.try(1, { type: 'call', amount: 15 })).toBe('badAmount')
    t.do(1, { type: 'call', amount: 20 })
    expect(calling(t).call).toEqual({ seat: 1, amount: 20 })
    expect(availableActions(viewFor(t.game, 0)).calls).toEqual([30, 40, 50, 60, 70, 80, 90, 100, 104])
  })

  test('each call restarts the window; it closes when the deadline passes', () => {
    const t = new Table().deal(D1)
    t.now += 4000
    t.do(2, { type: 'call', amount: 10 })
    expect(calling(t).deadline).toBe(t.now + 10_000)
    t.advance(9999)
    expect(t.game.phase.kind).toBe('calling')
    t.advance(1)
    expect(t.game.phase).toMatchObject({ kind: 'trumpSelection', trumper: 2, callAmount: 10 })
  })

  test('with no call the default trumper chooses, and the window closes early once everyone else passes', () => {
    const t = new Table().deal(D1)
    t.do(0, { type: 'pass' }).do(2, { type: 'pass' })
    expect(t.game.phase.kind).toBe('calling')
    expect(t.try(0, { type: 'pass' })).toBe('notAllowed')
    expect(t.try(0, { type: 'call', amount: 10 })).toBe('notAllowed')
    t.do(3, { type: 'pass' })
    expect(t.game.phase).toMatchObject({ kind: 'trumpSelection', trumper: 1, callAmount: 0 })
  })

  test('a preselected trump is honoured when the window closes', () => {
    const t = new Table().deal(D1).do(1, { type: 'preselectTrump', choice: 'spades' })
    expect(viewFor(t.game, 1).phase).toMatchObject({ preselect: 'spades' })
    expect(viewFor(t.game, 0).phase).toMatchObject({ preselect: null })
    t.advance(10_000)
    expect(t.game.phase).toMatchObject({ kind: 'thuneeWindow', trumper: 1, trump: 'spades' })
  })

  test('a preselect is cleared when its owner is outcalled, and only the prospective trumper may preselect', () => {
    const t = new Table().deal(D1).do(1, { type: 'preselectTrump', choice: 'spades' })
    expect(t.try(2, { type: 'preselectTrump', choice: 'clubs' })).toBe('notAllowed')
    expect(t.try(1, { type: 'preselectTrump', choice: 'hearts' })).toBe('badChoice')
    t.do(2, { type: 'call', amount: 10 })
    expect(calling(t).preselect).toBeNull()
    expect(t.try(1, { type: 'preselectTrump', choice: 'spades' })).toBe('notAllowed')
    t.advance(10_000)
    expect(t.game.phase.kind).toBe('trumpSelection')
  })

  test('stale actions after the window closes are rejected and change nothing', () => {
    const t = new Table().deal(D1).advance(10_000)
    const before = t.game
    expect(t.try(2, { type: 'call', amount: 10 })).toBe('wrongPhase')
    expect(t.try(2, { type: 'pass' })).toBe('notAllowed')
    expect(t.try(2, { type: 'chooseTrump', choice: 'clubs' })).toBe('notYourTurn')
    expect(t.game).toBe(before)
  })
})

describe('default trumper', () => {
  const nextRoundWith = (overrides: object, patch: Partial<Game>) => {
    const t = new Table(4, overrides)
    t.game = { ...t.game, ...patch, roundNumber: 1, phase: { kind: 'roundResult', summary: {} as RoundSummary } }
    return calling(t.do(0, { type: 'nextRound' })).defaultTrumper
  }

  test('traditional: always the dealer’s right', () => {
    expect(nextRoundWith({}, { dealer: 0, balls: [5, 0] })).toBe(1)
    expect(nextRoundWith({}, { dealer: 3, balls: [0, 5] })).toBe(0)
  })

  test('team ahead: the leading team, then the last winner, then the dealer’s right', () => {
    const rules = { defaultTrumper: 'teamAhead' as const }
    expect(nextRoundWith(rules, { dealer: 0, balls: [0, 3] })).toBe(1)
    expect(nextRoundWith(rules, { dealer: 0, balls: [3, 0] })).toBe(2)
    expect(nextRoundWith(rules, { dealer: 0, balls: [2, 2], lastRoundWinner: 0 })).toBe(2)
    expect(nextRoundWith(rules, { dealer: 0, balls: [0, 0], lastRoundWinner: null })).toBe(1)
  })
})

describe('trump and the final deal', () => {
  test('trump must be a suit held in the first four cards, or last card', () => {
    const t = new Table().deal(D1).advance(10_000)
    expect(availableActions(viewFor(t.game, 1)).chooseTrump).toEqual(['spades', 'lastCard'])
    expect(t.try(1, { type: 'chooseTrump', choice: 'hearts' })).toBe('badChoice')
    t.do(1, { type: 'chooseTrump', choice: 'spades' })
    const phase = t.game.phase
    expect(phase).toMatchObject({ kind: 'thuneeWindow', trump: 'spades' })
    if (phase.kind !== 'thuneeWindow') throw new Error()
    expect(phase.hands.map((h) => h.length)).toEqual([6, 6, 6, 6])
    expect(phase.stock).toEqual([])
    expect(t.events).toContainEqual({ type: 'trumpChosen', seat: 1, lastCard: false })
  })

  test('last card makes trump the suit of the trumper’s sixth card', () => {
    const t = new Table().deal(D1).advance(10_000).do(1, { type: 'chooseTrump', choice: 'lastCard' })
    expect(t.game.phase).toMatchObject({ kind: 'thuneeWindow', trump: 'clubs' })
  })

  test('only the trumper sees trump before it is revealed', () => {
    const t = new Table().deal(D1).advance(10_000).do(1, { type: 'chooseTrump', choice: 'spades' })
    expect(viewFor(t.game, 1).phase).toMatchObject({ trump: 'spades' })
    for (const seat of [0, 2, 3, null]) expect(viewFor(t.game, seat).phase).toMatchObject({ trump: null })
    expectNoLeak(t.game)
  })

  test('the deal is cancelled when the counting team holds no trump, if the setting is on', () => {
    const t = new Table().deal(NO_SPADES).advance(10_000).do(1, { type: 'chooseTrump', choice: 'spades' })
    expect(t.events).toContainEqual({ type: 'dealCancelled' })
    expect(t.game.phase.kind).toBe('calling')
    expect(t.game.roundNumber).toBe(1)
    expect(t.game.dealer).toBe(0)

    const off = new Table(4, { redealIfNoTrumps: false }).deal(NO_SPADES).advance(10_000)
    off.do(1, { type: 'chooseTrump', choice: 'spades' })
    expect(off.game.phase.kind).toBe('thuneeWindow')
  })
})

describe('thunee window', () => {
  const toWindow = (overrides = {}, hands = D1) =>
    new Table(4, { redealIfNoTrumps: false, ...overrides }).deal(hands).advance(10_000).do(1, { type: 'chooseTrump', choice: 'spades' })

  test('anyone may call under traditional rules, except a hand of six in one suit', () => {
    const t = toWindow({}, NO_SPADES)
    expect([0, 1, 2, 3].map((s) => availableActions(viewFor(t.game, s)).callThunee)).toEqual([true, true, false, true])
    expect(t.try(2, { type: 'callThunee' })).toBe('notAllowed')
  })

  test('only the trumper may call under the trumper-only setting', () => {
    const t = toWindow({ thuneeCaller: 'trumperOnly' })
    expect([0, 1, 2, 3].map((s) => availableActions(viewFor(t.game, s)).callThunee)).toEqual([false, true, false, false])
  })

  test('a call from the trumper’s team starts play at once', () => {
    const t = toWindow().do(3, { type: 'callThunee' })
    expect(t.game.phase).toMatchObject({ kind: 'playing', turn: 3, play: { thunee: { caller: 3 }, trump: null } })
  })

  test('a call from the counting team is held, and the trumper’s team can override it', () => {
    const held = toWindow().do(0, { type: 'callThunee' })
    expect(held.game.phase).toMatchObject({ kind: 'thuneeWindow', pending: 0 })
    expect(held.try(2, { type: 'callThunee' })).toBe('notAllowed') // partner of the held call
    const overridden = toWindow().do(0, { type: 'callThunee' }).do(1, { type: 'callThunee' })
    expect(overridden.game.phase).toMatchObject({ kind: 'playing', play: { thunee: { caller: 1 } } })
    held.advance(5000)
    expect(held.game.phase).toMatchObject({ kind: 'playing', turn: 0, play: { thunee: { caller: 0 } } })
  })

  test('the window closes early when everyone passes, and play starts at the trumper’s right', () => {
    const t = toWindow()
    for (const seat of [0, 1, 2]) t.do(seat, { type: 'pass' })
    expect(t.game.phase.kind).toBe('thuneeWindow')
    t.do(3, { type: 'pass' })
    expect(t.game.phase).toMatchObject({ kind: 'playing', turn: 2, play: { thunee: null, trump: 'spades' } })
  })

  test('classic thunee: no trump, and the player after the caller leads', () => {
    const t = toWindow(CLASSIC_APP_OVERRIDES).do(1, { type: 'callThunee' })
    expect(t.game.phase).toMatchObject({ kind: 'playing', turn: 2, play: { thunee: { caller: 1 }, trump: null } })
  })
})
