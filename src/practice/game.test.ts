import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { TRADITIONAL, TRICK_PAUSE_MS, availableActions, checkInvariants } from '../games/thunee/engine'
import { seededRng } from '../games/thunee/engine/testing'
import { thuneePractice } from '../games/thunee/practice'
import { type ThuneePracticeGame, playPractice } from '../games/thunee/testing'
import { PRACTICE_FORMAT, PracticeGame, practiceKey } from './game'
import { rng } from './rng'

describe('rng', () => {
  test('draws what the test generator draws, and its state carries on', () => {
    const a = rng(5)
    const b = seededRng(5)
    for (let i = 0; i < 5; i++) expect(a.next()).toBe(b())
    const resumed = rng(a.state)
    for (let i = 0; i < 5; i++) expect(resumed.next()).toBe(b())
  })
})

describe('starting', () => {
  test('four players: you, and three honest computers named by where they sit', () => {
    const p = PracticeGame.start(thuneePractice, 4, 1, 'Ann')
    const seats = p.game.seats
    expect(seats.map((s) => s.name)).toEqual(['Ann', 'Right', 'Partner', 'Left'])
    expect(seats.slice(1).every((s) => s.kind === 'ai' && s.persona === 'straight')).toBe(true)
    expect(p.game.rules).toEqual(TRADITIONAL)
    expect(p.game.phase.kind).toBe('calling')
  })

  test('two players: you and an opponent', () => {
    const p = PracticeGame.start(thuneePractice, 2, 1, 'Ann')
    expect(p.game.seats.map((s) => s.name)).toEqual(['Ann', 'Opponent'])
  })
})

describe('the clock waits for you', () => {
  test('nothing moves while you have not decided whether to call', () => {
    const p = PracticeGame.start(thuneePractice, 4, 2, 'Ann')
    expect(p.waiting(false)).toBe(true)
    expect(p.advance(60_000, false).events).toEqual([])
    expect(p.game.phase.kind).toBe('calling')
  })

  test('after you pass, the call window runs out and play moves on', () => {
    const p = PracticeGame.start(thuneePractice, 4, 2, 'Ann')
    expect(p.act({ type: 'pass' }, null)).not.toHaveProperty('rejected')
    p.advance(60_000, false)
    expect(p.game.phase.kind).not.toBe('calling')
  })

  test('an open sheet holds the clock too', () => {
    const p = PracticeGame.start(thuneePractice, 4, 2, 'Ann')
    p.act({ type: 'pass' }, null)
    expect(p.waiting(true)).toBe(true)
    p.advance(60_000, true)
    expect(p.game.phase.kind).toBe('calling')
  })

  test('after your card the computers play on until the trick is done, then the trick waits for Continue', () => {
    const p = toYourCard(4, 2)
    const card = availableCard(p)
    p.act({ type: 'playCard', card }, null)
    p.advance(10_000, false)
    expect(p.game.phase.kind).toBe('trickPause')
    expect(p.waiting(false)).toBe(true)
    p.advance(60_000, false)
    expect(p.game.phase.kind).toBe('trickPause')
    p.continueTrick()
    p.advance(TRICK_PAUSE_MS, false)
    expect(p.game.phase.kind).not.toBe('trickPause')
  })
})

describe('saving', () => {
  test('a saved game loads to the same view and plays on identically', () => {
    const p = toYourCard(4, 3)
    const q = PracticeGame.load(thuneePractice, p.save())!
    expect(q.view()).toEqual(p.view())
    const a = playPractice(p, 60)
    const b = playPractice(q, 60)
    expect(b.view()).toEqual(a.view())
  })

  test('a reload during a trick pause still waits for Continue', () => {
    const p = toYourCard(4, 4)
    p.act({ type: 'playCard', card: availableCard(p) }, null)
    p.advance(10_000, false)
    expect(p.game.phase.kind).toBe('trickPause')
    const q = PracticeGame.load(thuneePractice, p.save())!
    expect(q.waiting(false)).toBe(true)
  })

  test('another format, or garbage, is not loaded', () => {
    const saved = JSON.parse(PracticeGame.start(thuneePractice, 4, 1, 'Ann').save())
    expect(PracticeGame.load(thuneePractice, JSON.stringify({ ...saved, format: PRACTICE_FORMAT + 1 }))).toBeNull()
    expect(PracticeGame.load(thuneePractice, JSON.stringify({ ...saved, game: { ...saved.game, formatVersion: -1 } }))).toBeNull()
    expect(PracticeGame.load(thuneePractice, '{oops')).toBeNull()
    const { phase: _phase, ...noPhase } = saved.game
    expect(PracticeGame.load(thuneePractice, JSON.stringify({ ...saved, game: noPhase }))).toBeNull()
    const { eventCount: _count, ...noCount } = saved
    expect(PracticeGame.load(thuneePractice, JSON.stringify(noCount))).toBeNull()
    expect(PracticeGame.load(thuneePractice, null)).toBeNull()
  })

  test('a game saved in an earlier Thunee format is not loaded', () => {
    // Written by the Thunee-only practice, in Thunee's format 3, before calling could wait without a timer.
    const before = readFileSync(new URL('./saved-before-generic.json', import.meta.url), 'utf8')
    expect(JSON.parse(before).game.formatVersion).not.toBe(thuneePractice.module.formatVersion)
    expect(PracticeGame.load(thuneePractice, before)).toBeNull()
  })

  test('a save keeps its shape, under the game’s own key', () => {
    expect(practiceKey('thunee')).toBe('tricks-thunee-practice')
    const saved = JSON.parse(toYourCard(4, 3).save())
    expect(Object.keys(saved).sort()).toEqual(['continued', 'eventCount', 'format', 'game', 'rng', 'round', 'virtualNow'])
    expect(Object.keys(saved.round).sort()).toEqual(['dealt', 'decisions'])
    expect(saved).toMatchObject({ format: PRACTICE_FORMAT, game: { formatVersion: thuneePractice.module.formatVersion } })
  })
})

describe('the round log', () => {
  test('a redealt hand leaves no decision behind', () => {
    // Four players, seed 75: in round 1 the counting side holds no trump, found once the Thunee window closes.
    const p = PracticeGame.start(thuneePractice, 4, 75, 'Ann')
    playPractice(p, 300, undefined, (g) => g.game.phase.kind === 'thuneeWindow')
    expect(p.game.roundNumber).toBe(1)
    playPractice(p, 300, undefined, (g) => g.game.phase.kind === 'calling')
    expect(p.game.roundNumber).toBe(1)
    expect(p.round.decisions).toEqual([])
  })

})

describe('whole games', () => {
  const GAMES = Number(process.env.SIM_GAMES ?? 6)
  for (const players of [2, 4] as const) {
    test(`${players} players, following the computer's own advice, always finish`, () => {
      for (let seed = 1; seed <= GAMES; seed++) {
        const p = PracticeGame.start(thuneePractice, players, seed, 'Ann')
        playPractice(p, 20_000, () => checkInvariants(p.game))
        expect(p.game.phase.kind, `seed ${seed}`).toBe('gameOver')
        expect(p.round.dealt.length).toBeGreaterThan(0)
      }
    })
  }
})

/** A game advanced to the player's first card. */
function toYourCard(players: 2 | 4, seed: number): ThuneePracticeGame {
  const p = PracticeGame.start(thuneePractice, players, seed, 'Ann')
  playPractice(p, 500, undefined, (g) => g.game.phase.kind === 'playing' && g.game.phase.turn === 0)
  expect(p.game.phase).toMatchObject({ kind: 'playing', turn: 0 })
  return p
}

function availableCard(p: ThuneePracticeGame) {
  return availableActions(p.view()).legal[0]
}
