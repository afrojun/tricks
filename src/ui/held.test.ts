import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { HeldPresentations } from './held'

describe('presentations held back by after', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test('one without after shows at once; one with after shows when it passes', () => {
    const shown: string[] = []
    const held = new HeldPresentations((p) => p.toast && shown.push(p.toast))
    held.take({ toast: 'now' }, 'gameOver')
    held.take({ toast: 'later', after: 1000 }, 'gameOver')
    expect(shown).toEqual(['now'])
    vi.advanceTimersByTime(999)
    expect(shown).toEqual(['now'])
    vi.advanceTimersByTime(1)
    expect(shown).toEqual(['now', 'later'])
  })

  test('a held one is dropped, with its sound, when the table moves to another phase first; a same-phase event keeps it', () => {
    const shown: string[] = []
    const cancel = vi.fn()
    const held = new HeldPresentations((p) => p.toast && shown.push(p.toast))
    held.take({ toast: 'win', after: 3000, cancel }, 'gameOver')
    held.take({}, 'gameOver') // someone left their seat
    vi.advanceTimersByTime(1000)
    expect(cancel).not.toHaveBeenCalled()
    held.take({ toast: 'dealt' }, 'calling') // the rematch's deal
    expect(cancel).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5000)
    expect(shown).toEqual(['dealt'])
  })

  test('a phase seen without an event, as after a reconnect, drops what was held for the old one', () => {
    const shown: string[] = []
    const cancel = vi.fn()
    const held = new HeldPresentations((p) => p.toast && shown.push(p.toast))
    held.take({ toast: 'win', after: 3000, cancel }, 'gameOver')
    held.moved('gameOver')
    vi.advanceTimersByTime(1000)
    held.moved('calling')
    expect(cancel).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5000)
    expect(shown).toEqual([])
  })

  test('clearing drops everything held and takes back the sounds', () => {
    const shown: string[] = []
    const cancel = vi.fn()
    const held = new HeldPresentations((p) => p.toast && shown.push(p.toast))
    held.take({ toast: 'win', after: 500, cancel }, 'gameOver')
    held.clear()
    vi.advanceTimersByTime(1000)
    expect(shown).toEqual([])
    expect(cancel).toHaveBeenCalledTimes(1)
  })
})
