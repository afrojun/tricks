import { describe, expect, test } from 'vitest'
import { type GameEvent, type View, createGame, viewFor } from '../games/thunee/engine'
import type { NumberedEvent, ServerMessage } from '../protocol'
import { dwell } from '../games/thunee/ui/dwell'
import { MAX_WAITING, Playback } from './playback'

const view = viewFor(createGame(), null)
let n = 0
const sync = (version: number, ...events: GameEvent[]): ServerMessage<View, GameEvent> => ({
  type: 'sync',
  version,
  now: 0,
  seat: null,
  view,
  events: events.map((e) => ({ ...e, n: ++n }) as NumberedEvent<GameEvent>),
})
const played: GameEvent = { type: 'cardPlayed', seat: 0, card: { suit: 'hearts', rank: 'J' } }
const passed: GameEvent = { type: 'passed', seat: 1 }
const thunee: GameEvent = { type: 'thuneeCalled', seat: 2 }

/** A playback wired to a hand-cranked clock. */
function harness(dwellOf: (event: GameEvent) => number = dwell) {
  let now = 1000
  let timer: { at: number; run: () => void } | null = null
  const delivered: { version: number | string; receivedAt: number; at: number }[] = []
  const playback = new Playback<View, GameEvent>(
    (message, receivedAt) => delivered.push({ version: message.type === 'sync' ? message.version : message.type, receivedAt, at: now }),
    dwellOf,
    {
      now: () => now,
      setTimer: (run, ms) => void (timer = { at: now + ms, run }),
      clearTimer: () => void (timer = null),
    },
  )
  const advance = (ms: number) => {
    const end = now + ms
    while (timer && timer.at <= end) {
      const due = timer
      timer = null
      now = due.at
      due.run()
    }
    now = end
  }
  return { playback, delivered, advance, versions: () => delivered.map((d) => d.version) }
}

describe('playback', () => {
  test('a message that arrives when nothing is held is delivered at once', () => {
    const h = harness()
    h.playback.push(sync(1, played))
    expect(h.delivered).toEqual([{ version: 1, receivedAt: 1000, at: 1000 }])
  })

  test('the next message waits for the previous one’s dwell', () => {
    const h = harness()
    h.playback.push(sync(1, played)) // dwell 450
    h.playback.push(sync(2, passed)) // dwell 300
    h.playback.push(sync(3))
    expect(h.versions()).toEqual([1])
    h.advance(449)
    expect(h.versions()).toEqual([1])
    h.advance(1)
    expect(h.versions()).toEqual([1, 2])
    h.advance(300)
    expect(h.versions()).toEqual([1, 2, 3])
    expect(h.delivered.map((d) => d.at)).toEqual([1000, 1450, 1750])
  })

  test('dwell is the largest among a message’s events, and a message without events holds nothing', () => {
    const h = harness()
    h.playback.push(sync(1, passed, thunee)) // 1800
    h.playback.push(sync(2))
    h.playback.push(sync(3, played))
    h.advance(1799)
    expect(h.versions()).toEqual([1])
    h.advance(1)
    expect(h.versions()).toEqual([1, 2, 3]) // 2 has no dwell, so 3 follows immediately
  })

  test('after the hold has passed, a new message is immediate again', () => {
    const h = harness()
    h.playback.push(sync(1, played))
    h.advance(5000)
    h.playback.push(sync(2, played))
    expect(h.delivered.map((d) => d.at)).toEqual([1000, 6000])
  })

  test('the store is told when a message arrived, not when it was shown', () => {
    const h = harness()
    h.playback.push(sync(1, thunee))
    h.advance(200)
    h.playback.push(sync(2))
    h.advance(5000)
    expect(h.delivered[1]).toMatchObject({ version: 2, receivedAt: 1200, at: 2800 })
  })

  test('rejections and errors bypass the queue', () => {
    const h = harness()
    h.playback.push(sync(1, thunee))
    h.playback.push(sync(2))
    h.playback.push({ type: 'rejected', reason: 'notYourTurn' })
    h.playback.push({ type: 'error', message: 'x' })
    expect(h.versions()).toEqual([1, 'rejected', 'error'])
  })

  test('a lift waits behind the views still to be shown, and holds nothing itself', () => {
    const { playback, delivered, advance } = harness()
    playback.push({ type: 'lift', seat: 1, up: true })
    expect(delivered.map((d) => d.version)).toEqual(['lift'])
    playback.push(sync(1, played))
    playback.push(sync(2, played))
    playback.push({ type: 'lift', seat: 1, up: false })
    playback.push(sync(3))
    expect(delivered.map((d) => d.version)).toEqual(['lift', 1])
    advance(dwell(played))
    expect(delivered.map((d) => d.version)).toEqual(['lift', 1, 2])
    advance(dwell(played))
    expect(delivered.map((d) => d.version)).toEqual(['lift', 1, 2, 'lift', 3])
  })

  test('a skipped backlog puts down every lifted card, since the views that would have said who left are gone', () => {
    const shown: ServerMessage<View, GameEvent>[] = []
    const playback = new Playback<View, GameEvent>((m) => shown.push(m), dwell)
    playback.push(sync(1, thunee))
    playback.push({ type: 'lift', seat: 2, up: true })
    for (let v = 2; v <= MAX_WAITING + 2; v++) playback.push(sync(v, thunee))
    playback.push({ type: 'lift', seat: 3, up: true })
    // Seat 2's lift came with nothing waiting, so at once; seat 3's comes after the jump, and stands.
    expect(shown.map((m) => (m.type === 'sync' ? m.version : m.type === 'lift' ? `${m.seat}${m.up ? 'up' : 'down'}` : m.type))).toEqual([
      1,
      '2up',
      ...view.seats.map((_, seat) => `${seat}down`),
      MAX_WAITING + 2,
      '3up',
    ])
    playback.reset()
  })

  test('a backlog is skipped: only the newest message is delivered', () => {
    const h = harness()
    h.playback.push(sync(1, thunee))
    for (let v = 2; v <= MAX_WAITING + 2; v++) h.playback.push(sync(v, played))
    const views = () => h.versions().filter((v) => v !== 'lift')
    expect(views()).toEqual([1, MAX_WAITING + 2])
    h.advance(10_000)
    expect(views()).toEqual([1, MAX_WAITING + 2])
  })

  test('release shows everything waiting at once, so the reply to the player’s own action is not held', () => {
    const h = harness()
    h.playback.push(sync(1, thunee)) // would hold for 1800
    h.advance(100)
    h.playback.release() // the player acts
    h.playback.push(sync(2, played)) // the server's reply
    expect(h.delivered.map((d) => d.at)).toEqual([1000, 1100])
    h.playback.push(sync(3, played)) // the next player's move is paced again
    h.advance(449)
    expect(h.versions()).toEqual([1, 2])
    h.advance(1)
    expect(h.versions()).toEqual([1, 2, 3])
  })

  test('reset drops what is waiting and delivers the next message at once', () => {
    const h = harness()
    h.playback.push(sync(1, thunee))
    h.playback.push(sync(2, played))
    h.playback.reset()
    h.playback.push(sync(9))
    h.advance(10_000)
    expect(h.versions()).toEqual([1, 9])
  })

  test('the game says how long each of its events holds the screen', () => {
    const seen: string[] = []
    const h = harness((e) => {
      seen.push(e.type)
      return e.type === 'passed' ? 1000 : 10
    })
    h.playback.push(sync(1, played, passed)) // 1000, the longer of the two
    h.playback.push(sync(2, played)) // 10
    h.playback.push(sync(3))
    h.advance(999)
    expect(h.versions()).toEqual([1])
    h.advance(1)
    expect(h.versions()).toEqual([1, 2])
    h.advance(10)
    expect(h.versions()).toEqual([1, 2, 3])
    expect(seen).toEqual(['cardPlayed', 'passed', 'cardPlayed'])
  })
})
