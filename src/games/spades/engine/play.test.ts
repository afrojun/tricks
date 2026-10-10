import { describe, expect, test } from 'vitest'
import { cardId } from '../../../kit/cards'
import { availableActions } from './available'
import { createDeck, strength, suitOf } from './cards'
import { ALL_SPADES, FOUR, JOKERS, THREE, TWO, VOID } from './deals'
import { Table, card, cards, playOf } from './testing'
import { viewFor } from './view'

const ids = (text: string) => cards(text).map(cardId)
const legalOf = (t: Table) => availableActions(viewFor(t.game, t.turn)).legal.map(cardId)

describe('the deck', () => {
  test('52 cards; with jokers the twos of clubs and hearts leave and two jokers join', () => {
    expect(createDeck(false)).toHaveLength(52)
    const jokers = createDeck(true).map(cardId)
    expect(jokers).toHaveLength(52)
    expect(jokers).toContain('BJ-spades')
    expect(jokers).not.toContain('2-clubs')
    expect(jokers).not.toContain('2-hearts')
  })

  test('with jokers, the trump order is the big joker, the little, the two of diamonds, the two of spades, then the ace', () => {
    const order = strength(true)
    const top = cards('BJ LJ 2d 2s As Ks 3s')
    expect(top.map(order)).toEqual([...top.map(order)].sort((a, b) => b - a))
    expect(suitOf(true)(card('2d'))).toBe('spades')
    expect(suitOf(false)(card('2d'))).toBe('diamonds')
  })
})

describe('starting', () => {
  test('four play thirteen each; the dealer is drawn, and the player on their left calls first', () => {
    const t = new Table(4).begin()
    const phase = t.game.phase
    if (phase.kind !== 'calling') throw new Error(phase.kind)
    expect(phase.hands.map((h) => h.length)).toEqual([13, 13, 13, 13])
    expect(phase.turn).toBe((t.game.dealer + 1) % 4)
    expect(t.game.scores).toEqual([0, 0])
  })

  test('three play seventeen each, and the card left over is set aside unseen', () => {
    const t = new Table(3).begin()
    const phase = t.game.phase
    if (phase.kind !== 'calling') throw new Error(phase.kind)
    expect(phase.hands.map((h) => h.length)).toEqual([17, 17, 17])
    expect(phase.out.setAside).not.toBeNull()
    const set = cardId(phase.out.setAside!)
    for (const seat of [0, 1, 2, null]) expect(JSON.stringify(viewFor(t.game, seat))).not.toContain(set)
    expect(t.game.scores).toEqual([0, 0, 0])
  })
})

describe('drawing, with two', () => {
  test('each sees the top card on its own turn, keeps it or the next, and remembers what it discarded', () => {
    const t = new Table(2).begin()
    let phase = t.game.phase
    if (phase.kind !== 'drawing') throw new Error(phase.kind)
    const first = phase.turn
    const other = 1 - first
    const [top, next] = phase.stock
    expect(viewFor(t.game, first).phase).toMatchObject({ top, stockCount: 52 })
    expect(viewFor(t.game, other).phase).toMatchObject({ top: null })
    expect(availableActions(viewFor(t.game, other)).draw).toBe(false)
    expect(t.try(other, { type: 'draw', keep: true })).toBe('notYourTurn')

    t.do(first, { type: 'draw', keep: true })
    expect(viewFor(t.game, first).phase).toMatchObject({ hand: [top], discards: [next], top: null })
    expect(JSON.stringify(viewFor(t.game, other))).not.toContain(cardId(next))
    phase = t.game.phase
    if (phase.kind !== 'drawing') throw new Error(phase.kind)
    const [top2, next2] = phase.stock
    t.do(other, { type: 'draw', keep: false })
    expect(viewFor(t.game, other).phase).toMatchObject({ hand: [next2], discards: [top2] })
  })

  test('after thirteen turns each, both hold thirteen and calling begins', () => {
    const t = new Table(2).begin()
    for (let i = 0; i < 26; i++) t.do(t.turn, { type: 'draw', keep: i % 3 === 0 })
    const phase = t.game.phase
    if (phase.kind !== 'calling') throw new Error(phase.kind)
    expect(phase.hands.map((h) => h.length)).toEqual([13, 13])
    expect(phase.out.discards.map((d) => d.length)).toEqual([13, 13])
    expect(phase.looked).toEqual([true, true])
    // Each still remembers its discards.
    expect(viewFor(t.game, 0).phase).toMatchObject({ discards: phase.out.discards[0] })
  })
})

describe('calling', () => {
  test('in turn from the dealer’s left: 1 up to the hand size, or Nil', () => {
    const t = new Table(4).deal(FOUR, 3)
    expect(t.turn).toBe(0)
    expect(availableActions(viewFor(t.game, 0)).calls).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
    expect(availableActions(viewFor(t.game, 1)).calls).toEqual([])
    expect(t.try(1, { type: 'call', tricks: 3 })).toBe('notYourTurn')
    expect(t.try(0, { type: 'call', tricks: 14 })).toBe('badCall')
    t.call(4, 'nil', 3, 2)
    const play = playOf(t.game)
    expect(play.calls.map((c) => c.tricks)).toEqual([4, 0, 3, 2])
    expect(viewFor(t.game, 0).phase).toMatchObject({ contracts: [7, 2] })
  })

  test('without the Nil rule, the least is 1', () => {
    const t = new Table(4, { nil: false }).deal(FOUR, 3)
    expect(availableActions(viewFor(t.game, 0)).calls[0]).toBe(1)
    expect(t.try(0, { type: 'call', tricks: 0 })).toBe('badCall')
  })

  test('with three, up to seventeen', () => {
    const t = new Table(3).deal(THREE, 2)
    expect(availableActions(viewFor(t.game, 0)).calls.at(-1)).toBe(17)
  })
})

describe('Blind nil', () => {
  const behind = [100, 250]

  test('only a side 100 behind every other sees its cards face down, and may call it before looking', () => {
    const t = new Table(4, { blindNil: true }).deal(FOUR, 3, behind)
    const phase = t.game.phase
    if (phase.kind !== 'calling') throw new Error(phase.kind)
    expect(phase.looked).toEqual([false, true, false, true])
    expect(viewFor(t.game, 0).phase).toMatchObject({ hand: [], handCounts: [13, 13, 13, 13] })
    expect(viewFor(t.game, 0, 'full').phase).toMatchObject({ hand: [] })
    expect(availableActions(viewFor(t.game, 0))).toMatchObject({ blindNil: true, look: true, calls: [] })
    // Seat 2 may look before its turn.
    t.do(2, { type: 'lookAtHand' })
    expect(viewFor(t.game, 2).phase).toMatchObject({ hand: cards(FOUR[2]) })
    expect(t.try(2, { type: 'lookAtHand' })).toBe('notAllowed')
  })

  test('a side not far enough behind, or the rule off, sees its cards at once', () => {
    expect(new Table(4, { blindNil: true }).deal(FOUR, 3, [100, 199]).game.phase).toMatchObject({ looked: [true, true, true, true] })
    expect(new Table(4).deal(FOUR, 3, behind).game.phase).toMatchObject({ looked: [true, true, true, true] })
  })

  test('calling it turns the hand up; the partner may not call it too; then the two exchange two cards each', () => {
    const t = new Table(4, { blindNil: true }).deal(FOUR, 3, behind)
    t.do(0, { type: 'callBlindNil' })
    expect(viewFor(t.game, 0).phase).toMatchObject({ hand: cards(FOUR[0]) })
    t.call(4)
    expect(availableActions(viewFor(t.game, 2))).toMatchObject({ blindNil: false, look: true, calls: [] })
    expect(t.try(2, { type: 'callBlindNil' })).toBe('badCall')
    t.call(5, 4)
    expect(t.game.phase.kind).toBe('exchanging')
    // The Blind nil player gives first; its partner sees the two cards, and nobody else does.
    expect(t.try(2, { type: 'giveCards', cards: cards('8s 7s') })).toBe('notYourTurn')
    expect(t.try(0, { type: 'giveCards', cards: cards('As As') })).toBe('badChoice')
    t.do(0, { type: 'giveCards', cards: cards('As Ks') })
    expect(viewFor(t.game, 2).phase).toMatchObject({ exchange: { blind: 0, gave: cards('As Ks'), returned: null } })
    expect(viewFor(t.game, 1).phase).toMatchObject({ exchange: { blind: 0, gave: null, returned: null } })
    expect(JSON.stringify(viewFor(t.game, 1))).not.toContain('{"suit":"spades","rank":"K"}')
    t.do(2, { type: 'giveCards', cards: cards('8d 9d') })
    const play = playOf(t.game)
    expect(play.hands[0].map(cardId)).toContain('8-diamonds')
    expect(play.hands[2].map(cardId)).toContain('A-spades')
    expect(viewFor(t.game, 0).phase).toMatchObject({ exchange: { gave: cards('As Ks'), returned: cards('8d 9d') } })
    expect(viewFor(t.game, 3).phase).toMatchObject({ exchange: { gave: null, returned: null } })
  })

  test('with three it is called the same way, with no exchange; with two it never is', () => {
    const t = new Table(3, { blindNil: true }).deal(THREE, 2, [0, 100, 150])
    expect(t.game.phase).toMatchObject({ looked: [false, true, true] })
    t.do(0, { type: 'callBlindNil' }).call(5, 5)
    expect(t.game.phase.kind).toBe('playing')
    expect(new Table(2, { blindNil: true }).deal(TWO, 1, [0, 300]).game.phase).toMatchObject({ looked: [true, true] })
  })
})

describe('play', () => {
  test('the player left of the dealer leads, any card but a spade', () => {
    const t = new Table(4).deal(FOUR, 3).call(3, 3, 3, 3)
    expect(t.turn).toBe(0)
    expect(legalOf(t)).not.toContain('A-spades')
    expect(t.try(0, { type: 'playCard', card: card('As') })).toBeNull() // cheating on: accepted and recorded
    expect(playOf(t.game).current[0].broke).toEqual(['spadesLead'])
    expect(playOf(t.game).spadesBroken).toBe(true)
  })

  test('with cheating off, a rule-breaking card is refused', () => {
    const t = new Table(4, { allowCheating: false }).deal(FOUR, 3).call(3, 3, 3, 3)
    expect(t.try(0, { type: 'playCard', card: card('As') })).toBe('illegalCard')
    t.play('2c')
    expect(t.try(1, { type: 'playCard', card: card('5d') })).toBe('illegalCard')
  })

  test('a hand of nothing but spades may lead one', () => {
    const t = new Table(4).deal(ALL_SPADES, 3).call(13, 'nil', 'nil', 'nil')
    expect(legalOf(t)).toEqual(ids(ALL_SPADES[0]))
  })

  test('a void may trump; the highest spade wins, and spades are then broken', () => {
    const t = new Table(4).deal(VOID, 3).call(3, 4, 3, 3)
    t.play('2c')
    expect(legalOf(t)).toEqual(ids(VOID[1])) // void in clubs: anything
    t.play('Qs 9c Ac')
    expect(t.game.phase.kind).toBe('trickPause')
    expect(playOf(t.game).tricks[0].winner).toBe(1)
    expect(playOf(t.game).spadesBroken).toBe(true)
    t.endPause()
    expect(t.turn).toBe(1)
    expect(legalOf(t)).toContain('A-spades')
  })

  test('with three, whoever holds the lowest club in play leads it', () => {
    const t = new Table(3).deal(THREE, 0).call(5, 5, 5)
    expect(t.turn).toBe(2)
    expect(legalOf(t)).toEqual(['3-clubs'])
    expect(availableActions(viewFor(t.game, 2)).play.map(cardId)).toEqual(['3-clubs'])
  })

  test('with four and the lowest-club lead, the two of clubs leads; with jokers, the three', () => {
    const t = new Table(4, { firstLead: 'lowestClub' }).deal(FOUR, 0).call(3, 3, 3, 3)
    expect(t.turn).toBe(0)
    expect(legalOf(t)).toEqual(['2-clubs'])
    const j = new Table(4, { firstLead: 'lowestClub', jokers: true }).deal(JOKERS, 0).call(3, 3, 3, 3)
    expect(j.turn).toBe(2)
    expect(legalOf(j)).toEqual(['3-clubs'])
  })

  test('with jokers, the two of diamonds is a spade: it cannot follow diamonds, nor lead before spades are broken', () => {
    const t = new Table(4, { jokers: true }).deal(JOKERS, 3).call(3, 3, 3, 3)
    t.play('3d 6d')
    expect(legalOf(t)).not.toContain('2-diamonds')
    expect(legalOf(t)).toContain('9-diamonds')
    const lead = new Table(4, { jokers: true }).deal(JOKERS, 1).call(3, 3, 3, 3)
    expect(lead.turn).toBe(2)
    expect(legalOf(lead)).not.toContain('2-diamonds')
    lead.play('2d')
    expect(playOf(lead.game).current[0].broke).toEqual(['spadesLead'])
    expect(playOf(lead.game).spadesBroken).toBe(true)
  })

  test('the round ends after the last trick and is scored', () => {
    const t = new Table(4).deal(FOUR, 3).call(3, 3, 3, 3)
    t.autoPlay('roundResult')
    const phase = t.game.phase
    if (phase.kind !== 'roundResult') throw new Error(phase.kind)
    expect(phase.summary.sides).toHaveLength(2)
    expect(phase.summary.sides[0].tricks + phase.summary.sides[1].tricks).toBe(13)
    expect(t.events.some((e) => e.type === 'roundScored')).toBe(true)
    // The next round moves the deal on.
    const dealer = t.game.dealer
    t.do(0, { type: 'nextRound' })
    expect(t.game.dealer).toBe((dealer + 1) % 4)
  })

  test('events: a Nil’s first trick, and the trick that makes a contract', () => {
    const t = new Table(4).deal(VOID, 3).call(3, 'nil', 3, 3)
    t.play('2c Qs 9c Ac').endPause()
    expect(t.events).toContainEqual({ type: 'nilBroken', seat: 1 })
    const t2 = new Table(4).deal(VOID, 3).call(1, 1, 1, 'nil')
    t2.play('2c As 9c Ac')
    expect(t2.events).toContainEqual({ type: 'contractMade', side: 1 })
  })
})
