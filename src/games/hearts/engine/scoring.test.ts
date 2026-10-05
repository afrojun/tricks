import { describe, expect, test } from 'vitest'
import { availableActions } from './available'
import { MOON, SPREAD, VOID } from './deals'
import type { RuleOverrides } from './rules'
import { Table } from './testing'
import type { Game } from './types'
import { viewFor } from './view'

const summaryOf = (game: Game) => {
  if (game.phase.kind !== 'roundResult' && game.phase.kind !== 'gameOver') throw new Error(game.phase.kind)
  return game.phase.summary
}

/** A round without passing, dealt `hands`, starting from `scores`, played out with the first legal card. */
function round(hands: string[], overrides: RuleOverrides = {}, scores = [0, 0, 0, 0]) {
  const t = new Table({ passing: 'none', ...overrides }).do(0, { type: 'start' })
  t.game = { ...t.game, scores }
  return t.deal(hands).autoPlay('roundResult', 'gameOver')
}

describe('scoring a round', () => {
  test('each heart is a point and the queen of spades thirteen: 26 in every normal round, to whoever took them', () => {
    const t = new Table({ passing: 'none' }).deal(SPREAD)
    t.autoPlay('trickPause')
    for (let trick = 1; trick < 13; trick++) t.endPause().autoPlay('trickPause')
    const taken = (viewFor(t.game, 0).phase as { taken: number[] }).taken
    t.endPause()
    const summary = summaryOf(t.game)
    expect(summary).toMatchObject({ roundNumber: 1, reason: 'normal', moon: null })
    expect(summary.points).toEqual(taken)
    expect(summary.points.reduce((a, b) => a + b)).toBe(26)
    expect(summary.scoresAfter).toEqual(t.game.scores)
    expect(t.events).toContainEqual({ type: 'roundScored', summary })
  })

  test('a seat that takes all 26 shoots the moon: everyone else scores 26', () => {
    const summary = summaryOf(round(MOON).game)
    expect(summary).toMatchObject({ reason: 'moon', moon: 0, points: [0, 26, 26, 26], scoresAfter: [0, 26, 26, 26] })
  })

  test('with the shooter subtracting, the shooter scores -26 and everyone else nothing', () => {
    const summary = summaryOf(round(MOON, { moon: 'shooterSubtracts' }).game)
    expect(summary).toMatchObject({ reason: 'moon', moon: 0, points: [-26, 0, 0, 0] })
  })

  test('the jack of diamonds is worth -10 to whoever takes it, only under its rule', () => {
    const plain = summaryOf(round(SPREAD).game)
    const omnibus = round(SPREAD, { jackOfDiamonds: true }).game
    const jack = summaryOf(omnibus)
    expect(plain.reason).toBe('normal')
    expect(jack.points.reduce((a, b) => a + b)).toBe(16)
    const taker = jack.points.findIndex((p, seat) => p === plain.points[seat] - 10)
    expect(taker).toBeGreaterThanOrEqual(0)
    expect(jack.points.filter((p, seat) => p !== plain.points[seat])).toHaveLength(1)
  })

  test('the jack of diamonds does not count toward the moon, and its taker keeps it whatever happens', () => {
    expect(summaryOf(round(MOON, { jackOfDiamonds: true }).game)).toMatchObject({ reason: 'moon', moon: 0, points: [-10, 26, 26, 26] })
    // Scores may go below zero.
    const below = summaryOf(round(MOON, { jackOfDiamonds: true, moon: 'shooterSubtracts' }).game)
    expect(below).toMatchObject({ points: [-36, 0, 0, 0], scoresAfter: [-36, 0, 0, 0] })
  })
})

describe('the end of the game', () => {
  test('when a round ends with any score at 100 or more, the lowest score wins', () => {
    const t = round(MOON, {}, [90, 99, 50, 60])
    expect(t.game.scores).toEqual([90, 125, 76, 86])
    expect(t.game.phase).toMatchObject({ kind: 'gameOver', winner: 2 })
    expect(t.events).toContainEqual({ type: 'gameOver', winner: 2 })
  })

  test('while the lowest score is shared, another round is played', () => {
    const t = round(MOON, {}, [90, 99, 50, 50])
    expect(t.game.scores).toEqual([90, 125, 76, 76])
    expect(t.game.phase.kind).toBe('roundResult')
    t.do(0, { type: 'nextRound' })
    expect(t.game.roundNumber).toBe(2)
  })

  test('the end score is a house rule', () => {
    expect(round(MOON, { gameEndsAt: 50 }, [0, 0, 0, 0]).game.phase.kind).toBe('roundResult')
    expect(round(MOON, { gameEndsAt: 50 }, [0, 30, 0, 0]).game.phase).toMatchObject({ kind: 'gameOver', winner: 0 })
    expect(round(MOON, { gameEndsAt: 200 }, [90, 99, 50, 60]).game.phase.kind).toBe('roundResult')
  })

  test('any seated human starts the next round; nobody else, and not before the round ends', () => {
    const t = round(VOID)
    expect(t.try(null, { type: 'nextRound' })).toBe('notSeated')
    expect(t.try(0, { type: 'rematch' })).toBe('wrongPhase')
    t.game = { ...t.game, seats: t.game.seats.map((s, seat) => (seat === 3 ? { ...s, kind: 'ai' as const } : s)) }
    expect(t.try(3, { type: 'nextRound' })).toBe('notAllowed')
    t.do(2, { type: 'nextRound' })
    expect(t.try(2, { type: 'nextRound' })).toBe('wrongPhase')
  })

  test('only the host starts a rematch, which resets the scores and deals a first round', () => {
    const t = round(MOON, { passing: 'rotating' }, [90, 99, 50, 60])
    expect(availableActions(viewFor(t.game, 0)).rematch).toBe(true)
    expect(availableActions(viewFor(t.game, 1)).rematch).toBe(false)
    expect(t.try(1, { type: 'rematch' })).toBe('notHost')
    t.do(0, { type: 'rematch' })
    expect(t.game).toMatchObject({ scores: [0, 0, 0, 0], roundNumber: 1 })
    expect(t.game.phase).toMatchObject({ kind: 'passing', direction: 'left' })
    expect(t.events).toContainEqual({ type: 'dealt', roundNumber: 1, direction: 'left' })
  })
})
