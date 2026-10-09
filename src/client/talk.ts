import type { Said, Say } from '../kit/talk'
import type { Seat } from '../kit/table'

/** How long each kind of talk stays on screen, its exit included. */
export const SHOW_MS: Record<Say['kind'], number> = { line: 2800, emote: 2500, throw: 640 + 2500 }

/** Something on the table now: a line or emote at `seat`, or a throw from `seat` at `say.at`. */
export interface Showing {
  /** New for every arrival, so the same line twice is shown twice. */
  key: number
  seat: Seat
  say: Say
}

interface Timers {
  set: (run: () => void, ms: number) => unknown
  clear: (handle: unknown) => void
}

const browserTimers: Timers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

/**
 * What has been said at the table and is still showing, for any game. Fed by the session, never
 * saved: talk is presentation, so its timers are the browser's and nothing waits on them. A seat
 * shows one line or emote at a time; a new one replaces it. Throws are each their own.
 */
export class TalkStore {
  private showing: readonly Showing[] = []
  private listeners = new Set<() => void>()
  private saidListeners = new Set<(said: Said) => void>()
  private handles = new Set<unknown>()
  private keys = 0
  private closed = false

  constructor(private readonly timers: Timers = browserTimers) {}

  getState = (): readonly Showing[] => this.showing

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Called as each thing said appears, for its sound. */
  onSaid(listener: (said: Said) => void): () => void {
    this.saidListeners.add(listener)
    return () => this.saidListeners.delete(listener)
  }

  receive(said: Said): void {
    if (said.after) this.later(() => this.show(said), said.after)
    else this.show(said)
  }

  /** Stops every timer: the table is gone. */
  close(): void {
    this.closed = true
    for (const handle of this.handles) this.timers.clear(handle)
    this.handles.clear()
  }

  private show({ seat, say }: Said): void {
    if (this.closed) return
    const item: Showing = { key: ++this.keys, seat, say }
    const replaced = say.kind === 'throw' ? this.showing : this.showing.filter((s) => s.say.kind === 'throw' || s.seat !== seat)
    this.set([...replaced, item])
    for (const listener of this.saidListeners) listener({ seat, say })
    this.later(() => this.set(this.showing.filter((s) => s.key !== item.key)), SHOW_MS[say.kind])
  }

  private later(run: () => void, ms: number): void {
    const handle = this.timers.set(() => {
      this.handles.delete(handle)
      run()
    }, ms)
    this.handles.add(handle)
  }

  private set(showing: readonly Showing[]): void {
    this.showing = showing
    for (const listener of this.listeners) listener()
  }
}
