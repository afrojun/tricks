import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { MAX_ROOMS, ROOM_KEPT_MS, forgetRoom, keepRoom, keptRooms } from './rooms'

describe('the rooms a device sits in', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('are kept newest first, once each, and forgotten', () => {
    keepRoom('thunee', 'AAAAAA', 1000)
    keepRoom('hearts', 'BBBBBB', 2000)
    keepRoom('thunee', 'AAAAAA', 3000)
    expect(keptRooms(3000)).toEqual([
      { game: 'thunee', code: 'AAAAAA', seen: 3000 },
      { game: 'hearts', code: 'BBBBBB', seen: 2000 },
    ])
    forgetRoom('thunee', 'AAAAAA', 3000)
    expect(keptRooms(3000).map((r) => r.code)).toEqual(['BBBBBB'])
  })

  test('an answer about an older seat does not forget a room kept again since', () => {
    keepRoom('thunee', 'AAAAAA', 1000)
    const asked = keptRooms(1000)[0]
    keepRoom('thunee', 'AAAAAA', 2000)
    forgetRoom(asked.game, asked.code, 2000, asked.seen)
    expect(keptRooms(2000)).toEqual([{ game: 'thunee', code: 'AAAAAA', seen: 2000 }])
    forgetRoom('thunee', 'AAAAAA', 2000, 2000)
    expect(keptRooms(2000)).toEqual([])
  })

  test('only the newest few, and none unseen for a month', () => {
    for (let i = 0; i < MAX_ROOMS + 5; i++) keepRoom('spades', `R${i}`, i)
    expect(keptRooms(MAX_ROOMS + 5)).toHaveLength(MAX_ROOMS)
    expect(keptRooms(MAX_ROOMS + 5)[0].code).toBe(`R${MAX_ROOMS + 4}`)
    expect(keptRooms(MAX_ROOMS + 4 + ROOM_KEPT_MS)).toEqual([])
  })

  test('a list that is not one reads as empty', () => {
    localStorage.setItem('tricks-rooms', '{"game":1}')
    expect(keptRooms()).toEqual([])
    localStorage.setItem('tricks-rooms', 'not json')
    expect(keptRooms()).toEqual([])
    localStorage.setItem('tricks-rooms', '[null, {"game":"thunee"}, {"game":"thunee","code":"AAAAAA","seen":5}]')
    expect(keptRooms(10)).toEqual([{ game: 'thunee', code: 'AAAAAA', seen: 5 }])
  })
})
