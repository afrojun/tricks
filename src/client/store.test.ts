import { describe, expect, test } from 'vitest'
import { createGame, viewFor } from '../engine'
import type { NumberedEvent, ServerMessage } from '../protocol'
import { GameStore } from './store'

const view = viewFor(createGame(), null)
const event = (n: number): NumberedEvent => ({ type: 'passed', seat: n % 4, n })
const sync = (version: number, events: NumberedEvent[] = [], now = 5000): ServerMessage => ({
  type: 'sync',
  version,
  now,
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

  test('each rejection surfaces once and can be cleared; listeners are notified', () => {
    const { store } = connected()
    let notified = 0
    store.subscribe(() => notified++)
    store.receive({ type: 'rejected', reason: 'notYourTurn' }, 5000)
    const first = store.getState().rejection
    store.receive({ type: 'rejected', reason: 'notYourTurn' }, 5000)
    expect(store.getState().rejection).not.toEqual(first)
    store.clearRejection()
    expect(store.getState().rejection).toBeNull()
    expect(notified).toBe(3)
  })
})
