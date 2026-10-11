import { describe, expect, test } from 'vitest'
import { type GameEvent, type View, createGame, viewFor } from '../games/thunee/engine'
import type { NumberedEvent, ServerMessage } from '../protocol'
import { GameStore } from './store'

const view = viewFor(createGame(), null)
const event = (n: number): NumberedEvent<GameEvent> => ({ type: 'passed', seat: n % 4, n })
const sync = (version: number, events: NumberedEvent<GameEvent>[] = [], now = 5000, rate?: number): ServerMessage<View, GameEvent> => ({
  type: 'sync',
  version,
  now,
  ...(rate !== undefined && { rate }),
  seat: null,
  view: { ...view, roundNumber: version },
  events,
})

function connected() {
  const store = new GameStore()
  const played: number[] = []
  store.onEvent((e) => played.push(e.n))
  store.setConnection('open')
  store.receive(sync(1), 5000)
  return { store, played }
}

describe('game store', () => {
  test('a sync replaces the view and plays each new event once, in order', () => {
    const { store, played } = connected()
    store.receive(sync(2, [event(1), event(2)]), 5000)
    expect(store.getState()).toMatchObject({ version: 2, view: { roundNumber: 2 } })
    store.receive(sync(3, [event(2), event(3)]), 5000) // 2 arrives again
    expect(played).toEqual([1, 2, 3])
  })

  test('a lift is kept per seat until put back, and forgotten when the connection drops', () => {
    const { store, played } = connected()
    store.receive({ type: 'lift', seat: 1, up: true }, 5000)
    store.receive({ type: 'lift', seat: 3, up: true }, 5000)
    store.receive({ type: 'lift', seat: 1, up: true }, 5000)
    expect(store.getState().lifted).toEqual([3, 1])
    store.receive({ type: 'lift', seat: 3, up: false }, 5000)
    expect(store.getState()).toMatchObject({ lifted: [1], version: 1 })
    store.setConnection('reconnecting')
    expect(store.getState().lifted).toEqual([])
    expect(played).toEqual([])
  })

  test('a lift is dropped when its seat is no longer a person connected at the table', () => {
    const { store } = connected()
    const seats = view.seats.map((s) => ({ ...s, kind: 'human' as const, connected: true }))
    const at = (version: number, change: (s: (typeof seats)[number], i: number) => object) => ({
      ...sync(version),
      view: { ...view, seats: seats.map((s, i) => ({ ...s, ...change(s, i) })) },
    })
    store.receive(at(2, () => ({})), 5000)
    for (const seat of [1, 2, 3]) store.receive({ type: 'lift', seat, up: true }, 5000)
    store.receive(at(3, (_, i) => (i === 1 ? { connected: false } : i === 2 ? { standIn: true } : {})), 5000)
    expect(store.getState().lifted).toEqual([3])
    // Back again, the seat has nothing lifted until its player lifts a card anew.
    store.receive(at(4, () => ({})), 5000)
    expect(store.getState().lifted).toEqual([3])
  })

  test('a recap is kept to be read, never played, until cleared; an empty one is nothing', () => {
    const { store, played } = connected()
    store.receive({ type: 'recap', events: [] }, 5000)
    expect(store.getState().recap).toBeNull()
    store.receive({ type: 'recap', events: [event(3), event(4)] }, 5000)
    expect(store.getState().recap?.events.map((e) => e.n)).toEqual([3, 4])
    expect(played).toEqual([])
    store.clearRecap()
    expect(store.getState().recap).toBeNull()
  })

  test('a stale version is ignored', () => {
    const { store, played } = connected()
    store.receive(sync(5, [event(1)]), 5000)
    store.receive(sync(4, [event(9)]), 5000)
    expect(store.getState().version).toBe(5)
    expect(played).toEqual([1])
  })

  test('the first sync after a reconnect sets the view without replaying anything', () => {
    const { store, played } = connected()
    store.receive(sync(2, [event(1)]), 5000)
    store.setConnection('reconnecting')
    store.setConnection('open')
    // Events 2-4 happened while away; the server sends the current view only.
    store.receive(sync(6, []), 5000)
    store.receive(sync(7, [event(5)]), 5000)
    expect(played).toEqual([1, 5])
    expect(store.getState().version).toBe(7)
  })

  test('a reconnect to a room that reset accepts a lower version', () => {
    const { store } = connected()
    store.receive(sync(40), 5000)
    store.setConnection('reconnecting')
    store.setConnection('open')
    store.receive(sync(0), 5000)
    expect(store.getState().version).toBe(0)
  })

  test('a reconnect to a room that reset plays its new events, numbered from one again', () => {
    const { store, played } = connected()
    store.receive(sync(40, Array.from({ length: 75 }, (_, i) => event(i + 1))), 5000)
    expect(played).toHaveLength(75)
    store.setConnection('reconnecting')
    store.setConnection('open')
    store.receive(sync(0, []), 5000) // the reset room's lobby: a lower version and no events
    store.receive(sync(1, [event(1)]), 5000)
    expect(store.getState().version).toBe(1)
    expect(played.slice(75)).toEqual([1])
  })

  test('the first sync after a reconnect is the baseline for events too: its own are not played, then or again', () => {
    const { store, played } = connected()
    store.receive(sync(2, [event(1)]), 5000)
    store.setConnection('reconnecting')
    store.setConnection('open')
    store.receive(sync(5, [event(3), event(4)]), 5000) // a broadcast that reached the new socket first
    store.receive(sync(5, []), 5000)
    store.receive(sync(6, [event(4), event(5)]), 5000) // 4 arrives again
    expect(played).toEqual([1, 5])
  })

  test('countdowns follow the server clock even when this device is 30 seconds off', () => {
    const store = new GameStore()
    store.setConnection('open')
    const serverTime = 1_000_000
    const deviceTime = serverTime + 30_000 // device runs fast
    store.receive(sync(1, [], serverTime), deviceTime)
    const deadline = serverTime + 10_000
    expect(deadline - store.serverNow(deviceTime)).toBe(10_000)
    expect(deadline - store.serverNow(deviceTime + 4000)).toBe(6000)
  })

  test('countdowns follow a development table that runs at a pace', () => {
    const store = new GameStore()
    store.setConnection('open')
    store.receive(sync(1, [], 1_000_000, 4), 5000)
    expect(store.serverNow(6000)).toBe(1_004_000)
    expect(store.clockRate).toBe(4)
    store.receive(sync(2, [], 1_004_000), 6000) // a sync without a rate is real time again
    expect(store.serverNow(7000)).toBe(1_005_000)
  })

  test('each rejection surfaces once and can be cleared; listeners are notified', () => {
    const { store } = connected()
    let notified = 0
    store.subscribe(() => notified++)
    store.receive({ type: 'rejected', reason: 'notYourTurn' }, 5000)
    const first = store.getState().rejection
    store.receive({ type: 'rejected', reason: 'notYourTurn' }, 5000)
    expect(store.getState().rejection).not.toEqual(first)
    const second = store.getState().rejection!
    store.clearRejection()
    expect(store.getState().rejection).toBeNull()
    expect(notified).toBe(3)
    // Ids keep rising after a clear, so a repeated rejection is a new toast.
    store.receive({ type: 'rejected', reason: 'notYourTurn' }, 5000)
    expect(store.getState().rejection!.id).toBeGreaterThan(second.id)
  })
})
