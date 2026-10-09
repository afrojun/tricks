/** Players muted here: by seat, for this table and this page only. They are not told. */
import { useSyncExternalStore } from 'react'
import type { Seat } from '../../kit/table'

export class Mutes {
  private seats: ReadonlySet<Seat> = new Set()
  private listeners = new Set<() => void>()

  getState = (): ReadonlySet<Seat> => this.seats

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  toggle(seat: Seat): void {
    const seats = new Set(this.seats)
    if (!seats.delete(seat)) seats.add(seat)
    this.seats = seats
    this.listeners.forEach((listener) => listener())
  }
}

/** One set per table: kept beside its session, and gone with it. */
const bySession = new WeakMap<object, Mutes>()

export function mutesFor(session: object): Mutes {
  let mutes = bySession.get(session)
  if (!mutes) bySession.set(session, (mutes = new Mutes()))
  return mutes
}

export function useMuted(mutes: Mutes): ReadonlySet<Seat> {
  return useSyncExternalStore(mutes.subscribe, mutes.getState)
}
