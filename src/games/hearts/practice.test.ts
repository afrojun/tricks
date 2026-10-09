import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cardId, cardText } from '../../kit/cards'
import type { Note } from '../../kit/coach'
import { PracticeGame, practiceKey } from '../../practice/game'
import { openPracticeSession, seenKey } from '../../practice/session'
import { playPractice } from '../../practice/testing'
import { heartsCoach } from './coach'
import { type Action, type Card, type Game, type GameEvent, type RoundSummary, STANDARD, type View, availableActions } from './engine'
import { heartsPractice } from './practice'
import { dwell } from './ui/dwell'

type HeartsPracticeGame = PracticeGame<Game, Action, GameEvent, View, Note, Card[][], RoundSummary>

/** Moving on between rounds, and otherwise taking the coach's hint. */
function learner(p: HeartsPracticeGame): Action | null {
  if (p.game.phase.kind === 'roundResult') return { type: 'nextRound' }
  return heartsCoach.advise(p.coachView())?.action ?? null
}

class MemoryStorage {
  private data = new Map<string, string>()
  getItem(key: string) {
    return this.data.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.data.set(key, value)
  }
  removeItem(key: string) {
    this.data.delete(key)
  }
  keys() {
    return [...this.data.keys()]
  }
}

describe('Hearts practice', () => {
  test('you, and three honest computers named by where they sit, under Standard rules', () => {
    const p = PracticeGame.start(heartsPractice, 4, 1, 'You')
    expect(p.game.seats.map((s) => s.name)).toEqual(['You', 'Left', 'Across', 'Right'])
    expect(p.game.seats.slice(1).every((s) => s.kind === 'ai' && s.persona === 'straight')).toBe(true)
    expect(p.game.rules).toEqual(STANDARD)
    expect(p.game.phase.kind).toBe('passing')
    expect(heartsPractice.opening(p.game)).toEqual({ type: 'dealt', roundNumber: 1, direction: 'left' })
  })

  test('whole games, taking every hint; each round keeps its deal, with or without passing', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const p = PracticeGame.start(heartsPractice, 4, seed, 'You')
      const rounds: { direction: string; dealt: Card[][][]; decisions: number }[] = []
      playPractice(p, 20_000, learner, () => {
        const summary = heartsPractice.summary(p.view())
        if (summary !== null && rounds.length < summary.roundNumber) {
          rounds.push({ direction: p.view().direction, dealt: p.round.dealt, decisions: p.round.decisions.length })
        }
      })
      expect(p.game.phase.kind).toBe('gameOver')
      expect(rounds.length).toBeGreaterThanOrEqual(4)
      for (const round of rounds) {
        expect(round.dealt).toHaveLength(1)
        const cards = round.dealt[0].flat().map(cardId)
        expect(round.dealt[0].map((h) => h.length)).toEqual([13, 13, 13, 13])
        expect(new Set(cards).size).toBe(52)
        // An honest player is never accused, so every round is played out: the pass, if any, and thirteen cards.
        expect(round.decisions).toBe(round.direction === 'none' ? 13 : 14)
      }
      expect(rounds.some((r) => r.direction === 'none')).toBe(true)
    }
  })

  test('there is a hint exactly when the table waits on the player to pass or play', () => {
    const p = PracticeGame.start(heartsPractice, 4, 2, 'You')
    let hinted = 0
    playPractice(p, 4000, learner, () => {
      const hint = heartsCoach.advise(p.coachView())
      expect(hint !== null, p.game.phase.kind).toBe(heartsPractice.module.seatsToAct(p.game).includes(0))
      if (hint) hinted++
    })
    expect(hinted).toBeGreaterThan(50)
  })

  test('nothing the coach says during a round names a card it could not know the place of', () => {
    const p = PracticeGame.start(heartsPractice, 4, 4, 'You')
    let checked = 0
    playPractice(p, 4000, learner, () => {
      const view = p.coachView()
      const phase = p.game.phase
      const hands = phase.kind === 'passing' ? phase.hands : phase.kind === 'playing' || phase.kind === 'trickPause' ? phase.play.hands : null
      if (hands === null) return
      const gave = view.phase.kind === 'playing' || view.phase.kind === 'trickPause' ? view.phase.gave.map(cardId) : []
      const hidden = hands.slice(1).flat().filter((c) => !gave.includes(cardId(c)))
      const advice = heartsCoach.advise(view)
      const notes = [heartsCoach.situation(view), advice?.note, advice ? heartsCoach.check(view, advice.action) : null].filter((n) => n)
      const said = notes.map((n) => `${n!.title} ${n!.body}`).join(' ')
      for (const c of hidden) expect(said, `${cardText(c)} is hidden`).not.toContain(cardText(c))
      checked += notes.length
    })
    expect(checked).toBeGreaterThan(100)
  })

  test('a save loads under Hearts’ own key and version, and plays on identically', () => {
    expect(practiceKey(heartsPractice.module.id)).toBe('tricks-hearts-practice')
    expect(seenKey(heartsPractice.module.id)).toBe('tricks-hearts-coach-seen')
    const p = PracticeGame.start(heartsPractice, 4, 6, 'You')
    playPractice(p, 60, learner)
    const q = PracticeGame.load(heartsPractice, p.save())!
    expect(q.view()).toEqual(p.view())
    expect(q.round).toEqual(p.round)
    expect(playPractice(q, 400, learner).view()).toEqual(playPractice(p, 400, learner).view())
    const saved = JSON.parse(p.save())
    expect(saved.game.formatVersion).toBe(heartsPractice.module.formatVersion)
    expect(PracticeGame.load(heartsPractice, JSON.stringify({ ...saved, game: { ...saved.game, formatVersion: 99 } }))).toBeNull()
  })

  describe('through the practice session', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    test('the coach describes the pass and a play and hints at each; whole games are played and saved', () => {
      const storage = new MemoryStorage()
      const s = openPracticeSession(heartsPractice, dwell, { playerCount: 4, storage, seed: 3 })
      vi.runOnlyPendingTimers()
      const view = () => s.store.getState().view!
      const coach = () => s.coach.getState()

      expect(view().phase.kind).toBe('passing')
      // A new game opens with the aim, then passing; each holds the clock until it is read.
      expect(coach().topic).toBe('aim')
      s.coach.dismissTopic()
      expect(coach().topic).toBe('passing')
      s.coach.dismissTopic()
      expect(coach().topic).toBeNull()
      expect(coach().waiting).toBe(true)
      expect(coach().situation?.body).toMatch(/^Choose three cards to pass to the left\./)
      expect(coach().advice?.action.type).toBe('choosePass')
      expect(coach().advice?.note.title).toMatch(/^Pass /)
      s.send(coach().advice!.action)

      let play: { situation: string; hint: string } | null = null
      for (let guard = 0; guard < 20_000 && view().phase.kind !== 'gameOver'; guard++) {
        const state = coach()
        if (state.topic !== null) s.coach.dismissTopic()
        else if (state.trickPaused) s.coach.continueTrick()
        else if (view().phase.kind === 'roundResult') s.send({ type: 'nextRound' })
        else if (state.advice && state.version === s.store.getState().version) {
          if (state.advice.action.type === 'playCard' && play === null) play = { situation: state.situation!.body, hint: state.advice.note.title }
          s.send(state.advice.action)
        }
        vi.advanceTimersByTime(500)
      }
      expect(view().phase.kind).toBe('gameOver')
      expect(play?.hint).toMatch(/^Play /)
      expect(play?.situation).not.toBe('')
      expect(storage.getItem('tricks-hearts-practice')).not.toBeNull()
      expect(storage.keys().every((k) => k.startsWith('tricks-hearts-'))).toBe(true)
      const last = view()
      s.close()

      const again = openPracticeSession(heartsPractice, dwell, { playerCount: null, storage })
      vi.runOnlyPendingTimers()
      expect(again.store.getState().view).toEqual(last)
      again.close()
    })

    test('a whole round teaches every lesson it reaches, none skipped behind another', () => {
      for (const seed of [3, 50]) {
        const s = openPracticeSession(heartsPractice, dwell, { playerCount: 4, storage: new MemoryStorage(), seed })
        vi.runOnlyPendingTimers()
        const shown: string[] = []
        let followedFirst = false
        for (let guard = 0; guard < 5000 && s.store.getState().view!.phase.kind !== 'roundResult'; guard++) {
          const state = s.coach.getState()
          const phase = s.store.getState().view!.phase
          if (phase.kind === 'playing' && phase.turn === 0 && phase.tricks.length === 0 && phase.current.length > 0) followedFirst = true
          if (state.topic !== null) {
            shown.push(state.topic)
            s.coach.dismissTopic()
          } else if (state.trickPaused) s.coach.continueTrick()
          else if (state.advice && state.version === s.store.getState().version) s.send(state.advice.action)
          vi.advanceTimersByTime(500)
        }
        expect(s.store.getState().view!.phase.kind).toBe('roundResult')
        // Every heart and the queen are played by the round's end, so each of these is reached; the
        // first trick only by a player who follows the two of clubs.
        const reached = ['aim', 'passing', 'tricks', 'heartsBroken', 'queen', 'challenge', ...(followedFirst ? ['firstTrick'] : [])]
        expect(shown, `seed ${seed}`).toEqual(expect.arrayContaining(reached))
        expect(new Set(shown).size, `seed ${seed}`).toBe(shown.length)
        s.close()
      }
    })

    test('a hint is there for each of the player’s plays, and the situation with it', () => {
      const s = openPracticeSession(heartsPractice, dwell, { playerCount: 4, storage: new MemoryStorage(), seed: 5 })
      vi.runOnlyPendingTimers()
      s.send(s.coach.getState().advice!.action)
      let plays = 0
      for (let guard = 0; guard < 2000 && plays < 13; guard++) {
        const state = s.coach.getState()
        const v = s.store.getState().view!
        const mine = v.phase.kind === 'playing' && v.phase.turn === 0 && state.version === s.store.getState().version
        if (state.topic !== null) s.coach.dismissTopic()
        else if (state.trickPaused) s.coach.continueTrick()
        else if (mine) {
          expect(state.situation?.title).toBe('Your move')
          expect(state.advice?.action.type).toBe('playCard')
          expect(availableActions(v).legal).toContainEqual((state.advice!.action as { card: Card }).card)
          s.send(state.advice!.action)
          plays++
        }
        vi.advanceTimersByTime(500)
      }
      expect(plays).toBe(13)
      s.close()
    })
  })
})
