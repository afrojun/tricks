import { describe, expect, test } from 'vitest'
import { availableActions } from './available'
import { MOON, VOID } from './deals'
import type { RuleOverrides } from './rules'
import { Table, card, playOf } from './testing'
import type { Game } from './types'
import { viewFor } from './view'

const start = (hands = VOID, overrides: RuleOverrides = {}) => new Table({ passing: 'none', ...overrides }).deal(hands)
const can = (t: Table, seat: number) => availableActions(viewFor(t.game, seat))
const summaryOf = (game: Game) => {
  if (game.phase.kind !== 'roundResult' && game.phase.kind !== 'gameOver') throw new Error(game.phase.kind)
  return game.phase.summary
}

describe('accusations', () => {
  test('a guilty accused scores 26 and everyone else nothing; the round ends at once', () => {
    // Seat 2 holds clubs but throws a diamond on the opening trick.
    const t = start().play('2c 4d 8d').do(3, { type: 'challengePlay', seat: 2 })
    expect(t.events).toContainEqual({ type: 'challengeResolved', challenger: 3, accused: 2, guilty: true })
    expect(summaryOf(t.game)).toEqual({
      roundNumber: 1,
      reason: 'challenge',
      points: [0, 0, 26, 0],
      scoresAfter: [0, 0, 26, 0],
      moon: null,
      challenge: { challenger: 3, accused: 2, guilty: true, rule: 'followSuit', card: card('8d') },
    })
  })

  test('accusing an honest player costs the accuser 26', () => {
    const t = start().play('2c 4d 9c').do(0, { type: 'challengePlay', seat: 2 })
    expect(t.events).toContainEqual({ type: 'challengeResolved', challenger: 0, accused: 2, guilty: false })
    expect(summaryOf(t.game)).toMatchObject({
      reason: 'challenge',
      points: [26, 0, 0, 0],
      challenge: { challenger: 0, accused: 2, guilty: false, rule: null, card: card('9c') },
    })
  })

  test('every play the accused made this round is checked, and the summary names the first rule broken', () => {
    const t = start().play('2c 4d 8h Ac  Qc 3c 5d 9c').do(0, { type: 'challengePlay', seat: 2 })
    expect(summaryOf(t.game).challenge).toMatchObject({ guilty: true, rule: 'followSuit', card: card('8h') })
  })

  test('tricks already taken do not count', () => {
    // Seat 3 takes a heart and the queen of spades before seat 2 is caught.
    const t = start().play('2c 4d 9c Ac  Qc 3c Qs 10c  Kc 4c 4h 8d').endPause()
    expect(playOf(t.game).tricks.map((x) => x.winner)).toEqual([3, 3, 3])
    t.do(1, { type: 'challengePlay', seat: 2 })
    expect(summaryOf(t.game).points).toEqual([0, 0, 26, 0])
  })

  test('nobody shoots the moon in a challenged round, even from the last trick’s pause', () => {
    const t = start(MOON).autoPlay('trickPause')
    while (playOf(t.game).tricks.length < 13) t.endPause().autoPlay('trickPause')
    expect(viewFor(t.game, 1).phase).toMatchObject({ kind: 'trickPause', taken: [26, 0, 0, 0] })
    t.do(1, { type: 'challengePlay', seat: 0 })
    expect(summaryOf(t.game)).toMatchObject({ reason: 'challenge', moon: null, points: [0, 26, 0, 0] })
  })

  test('any player may accuse any other who has played a card this round, during play or the pause', () => {
    const t = start().play('2c')
    expect(can(t, 1).challengePlay).toEqual([0])
    expect(can(t, 0).challengePlay).toEqual([])
    expect(t.try(1, { type: 'challengePlay', seat: 2 })).toBe('notAllowed')
    expect(t.try(0, { type: 'challengePlay', seat: 0 })).toBe('notAllowed')
    expect(t.try(null, { type: 'challengePlay', seat: 0 })).toBe('notSeated')
    t.play('4d 9c Ac')
    expect(t.game.phase.kind).toBe('trickPause')
    expect(can(t, 0).challengePlay).toEqual([1, 2, 3])
    expect(can(t, 2).challengePlay).toEqual([0, 1, 3])
    t.do(2, { type: 'challengePlay', seat: 1 })
    expect(summaryOf(t.game).challenge).toMatchObject({ challenger: 2, accused: 1, guilty: false })
  })

  test('nobody accuses while cards are passed or between rounds', () => {
    const passing = new Table().deal(VOID)
    expect(can(passing, 0).challengePlay).toEqual([])
    expect(passing.try(0, { type: 'challengePlay', seat: 1 })).toBe('wrongPhase')
    const over = start().play('2c 4d 8d').do(3, { type: 'challengePlay', seat: 2 })
    expect(over.try(3, { type: 'challengePlay', seat: 2 })).toBe('wrongPhase')
  })

  test('with cheating off, nobody may accuse', () => {
    const t = start(VOID, { allowCheating: false }).play('2c 4d 9c Ac')
    for (const seat of [0, 1, 2, 3]) expect(can(t, seat).challengePlay).toEqual([])
    expect(t.try(0, { type: 'challengePlay', seat: 1 })).toBe('notAllowed')
  })

  describe('with the jack of diamonds already taken', () => {
    // Seat 2 holds clubs but throws the jack of diamonds on the opening trick; seat 3 takes it with the ace.
    const jackTaken = (scores = [0, 0, 0, 0]) => {
      const t = new Table({ passing: 'none', jackOfDiamonds: true }).do(0, { type: 'start' })
      t.game = { ...t.game, scores }
      t.deal(VOID).play('2c 4d Jd Ac')
      expect(t.events).toContainEqual({ type: 'trickWon', seat: 3, points: -10, queen: false })
      expect(viewFor(t.game, 0).phase).toMatchObject({ taken: [0, 0, 0, -10] })
      return t
    }

    test('a guilty verdict scores only the penalty: the jack scores nothing', () => {
      const t = jackTaken().do(1, { type: 'challengePlay', seat: 2 })
      expect(summaryOf(t.game)).toMatchObject({
        reason: 'challenge',
        points: [0, 0, 26, 0],
        challenge: { accused: 2, guilty: true, rule: 'followSuit', card: card('Jd') },
      })
    })

    test('a not-guilty verdict scores only the penalty too', () => {
      const t = jackTaken().do(0, { type: 'challengePlay', seat: 1 })
      expect(summaryOf(t.game)).toMatchObject({ reason: 'challenge', points: [26, 0, 0, 0], challenge: { guilty: false } })
    })

    test('even when the jack’s taker is the seat penalised', () => {
      const t = jackTaken().do(3, { type: 'challengePlay', seat: 1 })
      expect(summaryOf(t.game).points).toEqual([0, 0, 0, 26])
    })

    test('so the end of the game is judged on the penalty alone', () => {
      const t = jackTaken([90, 50, 60, 55]).do(0, { type: 'challengePlay', seat: 1 })
      expect(t.game.scores).toEqual([116, 50, 60, 55])
      expect(t.game.phase).toMatchObject({ kind: 'gameOver', winner: 1 })
    })
  })

  test('a challenge can end the game', () => {
    // Seat 0 holds clubs but throws a diamond on seat 3's club lead.
    const t = new Table({ passing: 'none' }).do(0, { type: 'start' })
    t.game = { ...t.game, scores: [90, 80, 50, 60] }
    t.deal(VOID).play('2c 4d 9c Ac  Qc 2d').do(1, { type: 'challengePlay', seat: 0 })
    expect(t.game.scores).toEqual([116, 80, 50, 60])
    expect(t.game.phase).toMatchObject({ kind: 'gameOver', winner: 2 })
  })
})
