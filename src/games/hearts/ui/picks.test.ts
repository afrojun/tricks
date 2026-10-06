import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { openPracticeSession } from '../../../practice/session'
import { NO_PICKS, type Picks, pickFrom, pickedFrom } from '../../../ui/hands'
import { type Card, PASS_SIZE, type View } from '../engine'
import { heartsPractice } from '../practice'
import { dwell } from './dwell'

class MemoryStorage {
  private items = new Map<string, string>()
  getItem = (key: string) => this.items.get(key) ?? null
  setItem = (key: string, value: string) => void this.items.set(key, value)
  removeItem = (key: string) => void this.items.delete(key)
}

describe('the cards picked to pass, in a practice game', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test('are not carried into a new practice game, where the pass is picked and sent afresh', () => {
    // No seed: a new game deals afresh, as it does for a player.
    const s = openPracticeSession(heartsPractice, dwell, { playerCount: 4, storage: new MemoryStorage() })
    vi.runOnlyPendingTimers()
    const view = (): View => s.store.getState().view!
    const hand = (): Card[] => {
      const phase = view().phase
      if (phase.kind !== 'passing') throw new Error(`expected passing, got ${phase.kind}`)
      return phase.hand
    }
    const pickThree = () => hand().slice(0, PASS_SIZE).reduce<Picks<Card>>((p, c) => pickFrom(p, hand(), c, PASS_SIZE), NO_PICKS)

    const before = pickThree()
    expect(pickedFrom(before, hand())).toHaveLength(PASS_SIZE)
    s.coach.restart(4)
    vi.runOnlyPendingTimers()
    expect(view().phase.kind).toBe('passing')
    expect(pickedFrom(before, hand())).toEqual([])

    const rejected: string[] = []
    s.store.subscribe(() => {
      const r = s.store.getState().rejection
      if (r) rejected.push(r.reason)
    })
    const after = pickThree()
    s.send({ type: 'choosePass', cards: pickedFrom(after, hand()) })
    vi.runOnlyPendingTimers()
    expect(rejected).toEqual([])
    const phase = view().phase
    expect(phase.kind === 'passing' ? phase.choice : 'exchanged').not.toBeNull()
  })
})
