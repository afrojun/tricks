import { describe, expect, test } from 'vitest'
import { cardId, hasCard } from '../../../kit/cards'
import { brokenRules, playProofs } from '../../../kit/integrity'
import { seededRng } from '../../../kit/testing'
import { availableActions } from './available'
import { JACK_OF_DIAMONDS, QUEEN_OF_SPADES } from './cards'
import { LEAD, VOID } from './deals'
import { type Situation, excusesFor, seenPlays } from './excuses'
import { OMNIBUS, STANDARD, resolveRules } from './rules'
import { Table, card, playOf } from './testing'
import type { Game } from './types'
import { viewFor } from './view'

const at = (led: Situation['led'], firstTrick = false, heartsBroken = false): Situation => ({ led, firstTrick, heartsBroken })
const rules = (c: string, situation: Situation, set = STANDARD) => excusesFor(card(c), situation, set).map((e) => e.rule)

describe('excuses', () => {
  test('a card off the led suit needs a hand without the led suit', () => {
    expect(rules('8d', at('clubs'))).toEqual(['followSuit'])
    expect(rules('9c', at('clubs'))).toEqual([])
    expect(rules('8d', at(null))).toEqual([])
    const [excuse] = excusesFor(card('8d'), at('clubs'), STANDARD)
    expect(excuse.without(card('2c'))).toBe(true)
    expect(excuse.without(card('2d'))).toBe(false)
  })

  test('on the first trick, a heart or the queen of spades needs a hand of nothing but those', () => {
    expect(rules('5h', at('clubs', true))).toEqual(['followSuit', 'firstTrickPoints'])
    expect(rules('Qs', at('clubs', true))).toEqual(['followSuit', 'firstTrickPoints'])
    expect(rules('Ks', at('clubs', true))).toEqual(['followSuit'])
    expect(rules('Jd', at('clubs', true), OMNIBUS)).toEqual(['followSuit'])
    expect(rules('5h', at('clubs', true), resolveRules({ pointsOnFirstTrick: true }))).toEqual(['followSuit'])
    expect(rules('5h', at('clubs', false))).toEqual(['followSuit'])
    const excuse = excusesFor(card('5h'), at('clubs', true), STANDARD)[1]
    expect(excuse.without(card('2d'))).toBe(true)
    expect(excuse.without(JACK_OF_DIAMONDS)).toBe(true)
    expect(excuse.without(QUEEN_OF_SPADES)).toBe(false)
    expect(excuse.without(card('Ah'))).toBe(false)
  })

  test('leading a heart before hearts are broken needs a hand of nothing but hearts', () => {
    expect(rules('5h', at(null))).toEqual(['heartsLead'])
    expect(rules('5h', at(null, false, true))).toEqual([])
    expect(rules('5h', at('hearts'))).toEqual([])
    expect(rules('Qs', at(null))).toEqual([])
    const [excuse] = excusesFor(card('5h'), at(null), STANDARD)
    expect(excuse.without(QUEEN_OF_SPADES)).toBe(true)
    expect(excuse.without(card('2h'))).toBe(false)
  })
})

/**
 * Plays whole rounds of random accepted cards, rule-breaking ones included,
 * and checks after every card that legality, the hidden record and what an
 * observer can derive all agree.
 */
function agreeingRound(seed: number) {
  const t = new Table({ passing: 'none', queenBreaksHearts: seed % 2 === 0, pointsOnFirstTrick: seed % 3 === 0 }, seed).do(0, { type: 'start' })
  const rng = seededRng(seed)
  let broken = 0
  for (;;) {
    t.endPause()
    if (t.game.phase.kind !== 'playing') break
    const seat = t.turn
    const can = availableActions(viewFor(t.game, seat))
    const c = rng() < 0.3 ? can.play[Math.floor(rng() * can.play.length)] : can.legal[Math.floor(rng() * can.legal.length)]
    t.play(`${c.rank}${c.suit[0]}`)
    const play = playOf(t.game)
    const records = [...play.tricks.flatMap((x) => x.plays), ...play.current]
    const record = records[records.length - 1]
    // Legal before the play exactly when the record says nothing was broken.
    expect(record.broke.length === 0).toBe(hasCard(can.legal, c))
    if (record.broke.length > 0) broken++
    checkSeen(t.game)
  }
  return broken
}

function checkSeen(game: Game) {
  const play = playOf(game)
  const records = [...play.tricks.flatMap((x) => x.plays), ...play.current]
  // With full memory every seat sees the same plays.
  const seen = seenPlays(viewFor(game, (records.length * 7) % 4, 'full'))
  expect(seen.map((p) => `${p.seat}:${cardId(p.card)}`)).toEqual(records.map((r) => `${r.seat}:${cardId(r.card)}`))
  expect(records.map((r, i) => brokenRules(r.handBefore, seen[i].excuses))).toEqual(records.map((r) => r.broke))
}

describe('one description of each rule', () => {
  test('legality, the record and what an observer sees all come from the excuses', () => {
    let broken = 0
    for (let seed = 1; seed <= 12; seed++) broken += agreeingRound(seed)
    // The random cards must actually break rules, or this proves little.
    expect(broken).toBeGreaterThan(20)
  })

  test('an observer proves a renege from public cards alone', () => {
    // Seat 2 throws a diamond on the opening club trick, then follows clubs on the next.
    const t = new Table({ passing: 'none' }).deal(VOID).play('2c 4d 8d Ac  Qc 3c 5d 9c')
    expect(playOf(t.game).tricks[0].plays[2].broke).toEqual(['followSuit'])
    expect(playProofs(seenPlays(viewFor(t.game, 1, 'full')), (s) => s !== 1)).toEqual([
      { id: 'followSuit:2:0:1', accused: 2, rule: 'followSuit', claim: null, gap: 0, salience: 1 },
    ])
  })

  test('an honest round holds no proof', () => {
    const t = new Table({ passing: 'none' }).do(0, { type: 'start' })
    while (t.game.phase.kind !== 'roundResult') {
      if (t.game.phase.kind === 'playing' || t.game.phase.kind === 'trickPause') {
        for (const seat of [0, 1, 2, 3]) expect(playProofs(seenPlays(viewFor(t.game, seat, 'full')), (s) => s !== seat)).toEqual([])
      }
      t.autoPlay('roundResult', 'trickPause')
      if (t.game.phase.kind === 'trickPause') t.endPause()
    }
  })

  test('with table memory an observer sees only the cards still on view, and never assumes hearts unbroken', () => {
    // Seat 1 leads a heart before hearts are broken; the trick after it, the first trick is turned down.
    const t = new Table({ passing: 'none' }).deal(LEAD).play('2c Ac 6c Jc  5h Jh Kh 2h')
    const full = seenPlays(viewFor(t.game, 0, 'full'))
    const table = seenPlays(viewFor(t.game, 0))
    expect(full).toHaveLength(8)
    expect(full[4].excuses.map((e) => e.rule)).toEqual(['heartsLead'])
    expect(table.map((p) => p.trick)).toEqual([1, 1, 1, 1])
    expect(table[0].excuses).toEqual([])
    expect(seenPlays(viewFor(new Table().game, 0))).toEqual([])
  })
})
