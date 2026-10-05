import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { availableActions } from '../engine'
import type { Note } from '../coach/note'
import { PRACTICE_KEY, PracticeGame } from './game'
import { playPractice } from './testing'
import { type PracticeSession, openPracticeSession, shouldHold } from './session'

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

let open: PracticeSession[] = []
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  for (const s of open) s.close()
  open = []
  vi.useRealTimers()
})

/** A new four-player session whose player may call at the start. */
function callingSession(storage = new MemoryStorage()) {
  for (let seed = 1; seed < 50; seed++) {
    const s = openPracticeSession({ playerCount: 4, storage, seed })
    open.push(s)
    vi.runOnlyPendingTimers()
    const view = s.store.getState().view!
    if (availableActions(view).calls.includes(104)) return { s, storage }
    s.close()
  }
  throw new Error('no seed lets seat 0 call')
}

describe('holding an action behind a warning', () => {
  test('a high call waits for the player to confirm', () => {
    const { s } = callingSession()
    s.send({ type: 'call', amount: 104 })
    vi.runOnlyPendingTimers()
    expect(s.coach.getState().warning?.note.rule).toBe('overcall')
    expect(s.store.getState().view!.phase).toMatchObject({ kind: 'calling', call: null })
    s.coach.confirm()
    vi.runOnlyPendingTimers()
    expect(s.coach.getState().warning).toBeNull()
    // 104 is the top call, so calling ends and you choose trump.
    expect(s.store.getState().view!.phase).toMatchObject({ kind: 'trumpSelection', trumper: 0, callAmount: 104 })
  })

  test('choosing again drops it', () => {
    const { s } = callingSession()
    s.send({ type: 'call', amount: 104 })
    s.coach.cancel()
    vi.runOnlyPendingTimers()
    expect(s.coach.getState().warning).toBeNull()
    expect(s.store.getState().view!.phase).toMatchObject({ kind: 'calling', call: null })
  })

  test('a reload while a warning is open has no warning and nothing applied', () => {
    const { s, storage } = callingSession()
    s.send({ type: 'call', amount: 104 })
    s.close()
    const again = openPracticeSession({ playerCount: null, storage })
    open.push(again)
    vi.runOnlyPendingTimers()
    expect(again.coach.getState().warning).toBeNull()
    expect(again.store.getState().view!.phase).toMatchObject({ kind: 'calling', call: null })
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
    const again = openPracticeSession({ playerCount: 4, storage, seed: 2 })
    open.push(again)
    expect(again.coach.getState().topic).toBeNull()
  })

  test('the game is saved for the next visit', () => {
    const { storage } = callingSession()
    expect(storage.getItem(PRACTICE_KEY)).not.toBeNull()
  })

  test('reopening on a round result still shows the review and the hands', () => {
    const storage = new MemoryStorage()
    const p = PracticeGame.start(4, 5, 'You')
    playPractice(p, 3000, undefined, (g) => g.game.phase.kind === 'roundResult')
    storage.setItem(PRACTICE_KEY, p.save())
    const s = openPracticeSession({ playerCount: null, storage })
    open.push(s)
    expect(s.coach.getState().review?.length).toBeGreaterThan(0)
    expect(s.coach.getState().dealt?.length).toBeGreaterThan(0)
  })
})
