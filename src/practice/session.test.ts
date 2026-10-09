import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { availableActions } from '../games/thunee/engine'
import { check } from '../games/thunee/coach/check'
import type { Note } from '../games/thunee/coach/note'
import { dwell } from '../games/thunee/ui/dwell'
import { type ThuneePracticeSession, thuneePractice } from '../games/thunee/practice'
import { playPractice } from '../games/thunee/testing'
import { PracticeGame, practiceKey } from './game'
import { DRILL_OVER } from './contract'
import { drillsKey, openPracticeSession, passedDrills, shouldHold } from './session'

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
}

let open: ThuneePracticeSession[] = []
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  for (const s of open) s.close()
  open = []
  vi.useRealTimers()
})

/** A new four-player session whose player may make the first call. */
function callingSession(storage = new MemoryStorage()) {
  for (let seed = 1; seed < 50; seed++) {
    const s = openPracticeSession(thuneePractice, dwell, { playerCount: 4, storage, seed })
    open.push(s)
    vi.runOnlyPendingTimers()
    const view = s.store.getState().view!
    if (availableActions(view).calls[0] === 10) return { s, storage }
    s.close()
  }
  throw new Error('no seed lets seat 0 call')
}

/** A four-player session played on with the advice until the player may outcall the other side by more than their hand is worth. */
function overcallSession(storage = new MemoryStorage()) {
  for (let seed = 1; seed < 50; seed++) {
    const s = openPracticeSession(thuneePractice, dwell, { playerCount: 4, storage, seed })
    open.push(s)
    for (let i = 0; i < 400; i++) {
      vi.advanceTimersByTime(500)
      const view = s.store.getState().view!
      const amount = availableActions(view).calls[0]
      if (view.phase.kind === 'calling' && amount !== undefined && check(view, { type: 'call', amount })?.rule === 'overcall') {
        return { s, storage, amount, before: view.phase.call }
      }
      const c = s.coach.getState()
      if (c.topic) s.coach.dismissTopic()
      else if (c.warning) s.coach.confirm()
      else if (c.trickPaused) s.coach.continueTrick()
      else if (c.advice) s.send(c.advice.action)
      else if (view.phase.kind === 'roundResult') s.send({ type: 'nextRound' })
    }
    s.close()
  }
  throw new Error('no seed lets seat 0 outcall')
}

describe('holding an action behind a warning', () => {
  test('a high call waits for the player to confirm', () => {
    const { s, amount, before } = overcallSession()
    const heard: unknown[] = []
    s.store.onEvent((e) => heard.push(e))
    s.send({ type: 'call', amount })
    vi.runOnlyPendingTimers()
    expect(s.coach.getState().warning?.note.rule).toBe('overcall')
    expect(s.store.getState().view!.phase).toMatchObject({ kind: 'calling', call: before })
    s.coach.confirm()
    vi.runOnlyPendingTimers()
    expect(s.coach.getState().warning).toBeNull()
    expect(heard).toContainEqual(expect.objectContaining({ type: 'called', seat: 0, amount }))
  })

  test('choosing again drops it', () => {
    const { s, amount, before } = overcallSession()
    s.send({ type: 'call', amount })
    s.coach.cancel()
    vi.runOnlyPendingTimers()
    expect(s.coach.getState().warning).toBeNull()
    expect(s.store.getState().view!.phase).toMatchObject({ kind: 'calling', call: before })
  })

  test('a reload while a warning is open has no warning and nothing applied', () => {
    const { s, storage, amount, before } = overcallSession()
    s.send({ type: 'call', amount })
    s.close()
    const again = openPracticeSession(thuneePractice, dwell, { playerCount: null, storage })
    open.push(again)
    vi.runOnlyPendingTimers()
    expect(again.coach.getState().warning).toBeNull()
    expect(again.store.getState().view!.phase).toMatchObject({ kind: 'calling', call: before })
  })

  test('a broken follow-suit rule is already confirmed by the hand, so it is not held again', () => {
    const illegal: Note = { tone: 'warn', title: '', body: '', rule: 'illegal' }
    expect(shouldHold(illegal)).toBe(false)
    expect(shouldHold({ ...illegal, rule: 'givePoints' })).toBe(true)
    expect(shouldHold(null)).toBe(false)
  })
})

describe('the coach state', () => {
  test('a new game opens with the first topic and a hint ready but hidden', () => {
    const { s } = callingSession()
    const c = s.coach.getState()
    expect(c.topic).toBe('cards')
    expect(c.advice).not.toBeNull()
    expect(c.showHint).toBe(false)
    expect(c.waiting).toBe(true)
  })

  test('a topic, once dismissed, is not shown again on this device', () => {
    const { s, storage } = callingSession()
    s.coach.dismissTopic()
    expect(s.coach.getState().topic).toBe('calling')
    s.coach.dismissTopic()
    expect(s.coach.getState().topic).toBeNull()
    const again = openPracticeSession(thuneePractice, dwell, { playerCount: 4, storage, seed: 2 })
    open.push(again)
    expect(again.coach.getState().topic).toBeNull()
  })

  test('the game is saved for the next visit', () => {
    const { storage } = callingSession()
    expect(storage.getItem(practiceKey('thunee'))).not.toBeNull()
  })

  test('at game over, the player’s Again starts the next game: they are the whole table', () => {
    const storage = new MemoryStorage()
    const p = PracticeGame.start(thuneePractice, 4, 5, 'You')
    playPractice(p, 20_000)
    expect(p.game.phase.kind).toBe('gameOver')
    storage.setItem(practiceKey('thunee'), p.save())
    const s = openPracticeSession(thuneePractice, dwell, { playerCount: null, storage })
    open.push(s)
    vi.runOnlyPendingTimers()
    expect(availableActions(s.store.getState().view!).again).toBe(true)
    s.send({ type: 'rematch' })
    vi.runAllTimers()
    expect(s.store.getState().view!.phase.kind).not.toBe('gameOver')
  })

  test('what the player says shows at once', () => {
    const { s } = callingSession()
    s.say({ kind: 'line', id: 'aweh' })
    expect(s.talk.getState()).toMatchObject([{ seat: 0, say: { kind: 'line', id: 'aweh' } }])
  })

  test('reopening on a round result still shows the review and the hands', () => {
    const storage = new MemoryStorage()
    const p = PracticeGame.start(thuneePractice, 4, 5, 'You')
    playPractice(p, 3000, undefined, (g) => g.game.phase.kind === 'roundResult')
    storage.setItem(practiceKey('thunee'), p.save())
    const s = openPracticeSession(thuneePractice, dwell, { playerCount: null, storage })
    open.push(s)
    expect(s.coach.getState().review?.length).toBeGreaterThan(0)
    expect(s.coach.getState().dealt?.length).toBeGreaterThan(0)
  })

})

describe('checkpoint C', () => {
  test('two open sheets hold the clock until both close', () => {
    const { s } = callingSession()
    s.coach.dismissTopic()
    s.coach.dismissTopic()
    s.send({ type: 'pass' })
    s.coach.setReading('menu', true)
    s.coach.setReading('log', true)
    s.coach.setReading('menu', false)
    expect(s.coach.getState().waiting).toBe(true)
    s.coach.setReading('log', false)
    expect(s.coach.getState().waiting).toBe(false)
  })

  test('a new game after a restart still plays its events', () => {
    const { s } = callingSession()
    let heard = 0
    s.store.onEvent(() => heard++)
    const drive = () => {
      const c = s.coach.getState()
      if (c.topic) s.coach.dismissTopic()
      else if (c.warning) s.coach.confirm()
      else if (c.trickPaused) s.coach.continueTrick()
      else if (c.advice) s.send(c.advice.action)
      else if (s.store.getState().view?.phase.kind === 'roundResult') s.send({ type: 'nextRound' })
      vi.advanceTimersByTime(2000)
    }
    // Play long enough that the first game's event numbers are well ahead of a fresh game's.
    for (let i = 0; i < 300 && heard < 60; i++) drive()
    expect(heard).toBeGreaterThanOrEqual(60)
    heard = 0
    s.coach.restart(4)
    vi.runOnlyPendingTimers()
    for (let i = 0; i < 20; i++) drive()
    expect(heard).toBeGreaterThan(5)
    expect(heard).toBeGreaterThan(0)
  })

  test('the coach always speaks about the state the table is showing', () => {
    const { s } = callingSession()
    for (let i = 0; i < 300; i++) {
      expect(s.coach.getState().version).toBe(s.store.getState().version)
      const c = s.coach.getState()
      if (c.topic) s.coach.dismissTopic()
      else if (c.warning) s.coach.confirm()
      else if (c.trickPaused) s.coach.continueTrick()
      else if (c.advice) s.send(c.advice.action)
      vi.advanceTimersByTime(137)
    }
  })

  test('reopening a game nobody has started learning from shows the opening topics', () => {
    const storage = new MemoryStorage()
    storage.setItem(practiceKey('thunee'), PracticeGame.start(thuneePractice, 4, 3, 'You').save())
    const s = openPracticeSession(thuneePractice, dwell, { playerCount: null, storage })
    open.push(s)
    expect(s.coach.getState().topic).toBe('cards')
  })

  test('time spent reading is not taken off a running countdown', () => {
    const { s } = callingSession()
    s.coach.dismissTopic()
    s.coach.dismissTopic()
    s.send({ type: 'pass' })
    vi.runOnlyPendingTimers()
    const left = () => {
      const phase = s.store.getState().view!.phase
      return 'deadline' in phase && phase.deadline !== null ? phase.deadline - s.store.serverNow(Date.now()) : null
    }
    const before = left()
    if (before === null) return
    s.coach.setReading('log', true)
    vi.advanceTimersByTime(60_000)
    s.coach.setReading('log', false)
    expect(Math.abs(left()! - before)).toBeLessThan(50)
  })
})


describe('a drill', () => {
  test('its brief holds the clock, its verdict stops it, and a pass is kept without touching the saved game', () => {
    const storage = new MemoryStorage()
    storage.setItem(practiceKey('thunee'), 'the saved game')
    const s = openPracticeSession(thuneePractice, dwell, { playerCount: null, drill: 'jodhi', storage, seed: 1 })
    open.push(s)
    vi.runOnlyPendingTimers()
    expect(s.coach.getState()).toMatchObject({ waiting: true, topic: null, drill: { id: 'jodhi', briefing: true, verdict: null, next: { id: 'khanaak' } } })
    expect(s.coach.getState().guide?.title).toBe('Win the first trick')

    s.coach.startDrill()
    expect(s.coach.getState().drill?.briefing).toBe(false)
    s.send({ type: 'playCard', card: { rank: 'J', suit: 'clubs' } })
    vi.advanceTimersByTime(60_000)
    expect(s.store.getState().view!.phase.kind).toBe('trickPause')
    expect(s.coach.getState().guide?.title).toBe('Call Jodhi now')

    s.send({ type: 'claimJodhi', suit: 'spades', withJack: false })
    vi.advanceTimersByTime(60_000)
    const state = s.coach.getState()
    expect(state.drill?.verdict?.passed).toBe(true)
    expect(state).toMatchObject({ waiting: true, advice: null, guide: null })
    // The clock stays stopped: nobody leads the next trick.
    expect(s.store.getState().view!.phase).toMatchObject({ kind: 'trickPause' })
    expect([...passedDrills('thunee', storage)]).toEqual(['jodhi'])
    expect(storage.getItem(practiceKey('thunee'))).toBe('the saved game')

    // Nothing more is played once the drill is over, even with its verdict closed.
    const ended = s.store.getState().view
    s.send({ type: 'challengePlay', seat: 1 })
    vi.advanceTimersByTime(60_000)
    expect(s.store.getState().rejection?.reason).toBe(DRILL_OVER)
    s.coach.continueTrick()
    vi.advanceTimersByTime(60_000)
    expect(s.store.getState().view).toEqual(ended)
    expect(s.coach.getState().drill?.verdict?.passed).toBe(true)
  })

  test('another drill starts afresh, and a new practice game leaves drills behind', () => {
    const storage = new MemoryStorage()
    const s = openPracticeSession(thuneePractice, dwell, { playerCount: null, drill: 'thunee', storage, seed: 1 })
    open.push(s)
    vi.runOnlyPendingTimers()
    s.coach.startDrill()
    s.send({ type: 'pass' })
    vi.advanceTimersByTime(10_000)
    expect(s.coach.getState().drill?.verdict?.passed).toBe(false)
    expect(storage.getItem(drillsKey('thunee'))).toBeNull()

    s.coach.openDrill('challenge')
    vi.runOnlyPendingTimers()
    expect(s.coach.getState().drill).toMatchObject({ id: 'challenge', briefing: true, verdict: null, next: null })
    expect(s.coach.getState().log).toEqual([])

    s.coach.restart(4)
    vi.runOnlyPendingTimers()
    expect(s.coach.getState().drill).toBeNull()
    expect(storage.getItem(practiceKey('thunee'))).not.toBeNull()
  })

  test('an unknown drill opens practice as usual', () => {
    const s = openPracticeSession(thuneePractice, dwell, { playerCount: 4, drill: 'nonsense', storage: new MemoryStorage(), seed: 1 })
    open.push(s)
    vi.runOnlyPendingTimers()
    expect(s.coach.getState().drill).toBeNull()
    expect(s.store.getState().view!.phase.kind).toBe('calling')
  })
})

describe('a drill that ends before its moment', () => {
  test('a round ended early is a miss, with a way on', () => {
    const s = openPracticeSession(thuneePractice, dwell, { playerCount: null, drill: 'jodhi', storage: new MemoryStorage(), seed: 1 })
    open.push(s)
    vi.runOnlyPendingTimers()
    s.coach.startDrill()
    s.send({ type: 'playCard', card: { rank: 'J', suit: 'clubs' } })
    vi.advanceTimersByTime(3_000)
    // A challenge against an honest player, which the coach warns of, ends the round.
    s.send({ type: 'challengePlay', seat: 1 })
    s.coach.confirm()
    vi.advanceTimersByTime(60_000)
    expect(s.store.getState().view!.phase.kind).toBe('roundResult')
    expect(s.coach.getState().drill?.verdict).toMatchObject({ passed: false, note: { title: 'The round ended first' } })
  })
})
