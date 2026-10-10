import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { hearts } from '../games/hearts'
import { type Action, type Card, type Game, type GameEvent, type RoundSummary, type View, availableActions } from '../games/hearts/engine'
import type { GameCoach, GamePractice, Note } from './contract'
import { PracticeGame, practiceKey } from './game'
import { openPracticeSession, seenKey } from './session'
import { playPractice } from './testing'

/** A coach that says nothing: practice must not need one that does. */
const silent: GameCoach<View, Action, GameEvent, Note, Card[][], RoundSummary> = {
  situation: () => null,
  advise: () => null,
  check: () => null,
  narrate: () => null,
  topicsFor: () => [],
  review: () => [],
}

/** Hearts, which has no practice of its own yet, set up for one here. */
const heartsPractice: GamePractice<Game, Action, GameEvent, View, Note, Card[][], RoundSummary> = {
  module: hearts,
  setup: () => [1, 2, 3].map((seat) => ({ type: 'addAi', seat })),
  pauseId: (game) => (game.phase.kind === 'trickPause' ? `${game.roundNumber}:${game.phase.play.tricks.length}` : null),
  isDecision: (action) => action.type === 'choosePass' || action.type === 'playCard',
  roundBegins: (events) => events.some((e) => e.type === 'dealt'),
  dealInPlay: (game) => (game.phase.kind === 'passing' ? { index: 0, hands: game.phase.hands.map((h) => [...h]) } : null),
  opening: (game) => (game.roundNumber === 1 ? { type: 'dealt', roundNumber: 1, direction: 'left' } : null),
  summary: (view) => (view.phase.kind === 'roundResult' || view.phase.kind === 'gameOver' ? view.phase.summary : null),
  coach: silent,
  drills: [],
}

/** Moving on between rounds, passing the first three cards, and playing the first legal card. */
function learner(p: PracticeGame<Game, Action, GameEvent, View, Note, Card[][], RoundSummary>): Action | null {
  if (p.game.phase.kind === 'roundResult') return { type: 'nextRound' }
  const can = availableActions(p.view())
  if (can.pass.length > 0) return { type: 'choosePass', cards: can.pass.slice(0, 3) }
  return can.legal.length > 0 ? { type: 'playCard', card: can.legal[0] } : null
}

describe('practice for any game', () => {
  test('a game with only a module and a silent coach is set up, played to its end, and logged', () => {
    const p = PracticeGame.start(heartsPractice, 4, 5, 'You')
    expect(p.game.seats[0].name).toBe('You')
    expect(new Set(p.game.seats.map((s) => s.name)).size).toBe(4)
    expect(p.game.seats.slice(1).every((s) => s.kind === 'ai')).toBe(true)
    expect(p.game.phase.kind).toBe('passing')
    expect(p.round.dealt[0]).toHaveLength(4)
    let decisions = 0
    playPractice(p, 20_000, learner, () => (decisions = Math.max(decisions, p.round.decisions.length)))
    expect(p.game.phase.kind).toBe('gameOver')
    expect(decisions).toBe(14) // a round with passing logs the pass and all thirteen cards
  })

  test('its save loads under its own key and plays on identically', () => {
    expect(practiceKey(heartsPractice.module.id)).toBe('tricks-hearts-practice')
    expect(seenKey(heartsPractice.module.id)).toBe('tricks-hearts-coach-seen')
    const p = PracticeGame.start(heartsPractice, 4, 6, 'You')
    playPractice(p, 40, learner)
    const q = PracticeGame.load(heartsPractice, p.save())!
    expect(q.view()).toEqual(p.view())
    expect(playPractice(q, 300, learner).view()).toEqual(playPractice(p, 300, learner).view())
    expect(PracticeGame.load(heartsPractice, JSON.stringify({ ...JSON.parse(p.save()), game: { ...p.game, formatVersion: 99 } }))).toBeNull()
  })

  describe('a session', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    test('waits for the player, plays the computers, and saves under the game’s key', () => {
      const storage = new Map<string, string>()
      const s = openPracticeSession(heartsPractice, () => 0, {
        playerCount: null,
        seed: 3,
        storage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v), removeItem: (k) => void storage.delete(k) },
      })
      vi.runOnlyPendingTimers()
      const view = () => s.store.getState().view!
      expect(view().phase.kind).toBe('passing')
      expect(s.coach.getState()).toMatchObject({ waiting: true, topic: null, advice: null })
      s.send({ type: 'choosePass', cards: availableActions(view()).pass.slice(0, 3) })
      vi.advanceTimersByTime(10_000)
      expect(view().phase.kind).toBe('playing')
      expect(storage.has('tricks-hearts-practice')).toBe(true)
      expect([...storage.keys()].some((k) => k.startsWith('tricks-thunee'))).toBe(false)
      s.close()
    })
  })
})
