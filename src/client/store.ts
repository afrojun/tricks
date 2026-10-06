import type { Seat } from '../kit/table'
import type { NumberedEvent, ServerMessage } from '../protocol'

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting'

export interface ClientState<V> {
  connection: ConnectionStatus
  seat: Seat | null
  /** The latest view from the server; null until the first sync. */
  view: V | null
  version: number
  /** The most recent rejection, with a counter so repeats are distinguishable. */
  rejection: { reason: string; id: number } | null
  error: string | null
}

type EventListener<V, E> = (event: NumberedEvent<E>, view: V, seat: Seat | null) => void

/**
 * Holds what the server last told this client. Components read it; nothing
 * else keeps a copy of game state. Events are handed to listeners exactly
 * once, in order, and are never derived by comparing views. The game supplies
 * the view and event types.
 */
export class GameStore<V, E> {
  private state: ClientState<V> = {
    connection: 'connecting',
    seat: null,
    view: null,
    version: 0,
    rejection: null,
    error: null,
  }
  private listeners = new Set<() => void>()
  private eventListeners = new Set<EventListener<V, E>>()
  private lastEvent = 0
  private rejections = 0
  /** After a (re)connect the next sync is taken as-is, whatever its version. */
  private awaitingFirstSync = true
  /** Server clock minus local clock, measured at the last sync. */
  private clockOffset = 0

  getState = (): ClientState<V> => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Registers a consumer for game events (sounds, toasts, animations). */
  onEvent(listener: EventListener<V, E>): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  setConnection(connection: ConnectionStatus): void {
    if (connection !== 'open') this.awaitingFirstSync = true
    this.update({ connection })
  }

  receive(message: ServerMessage<V, E>, localNow: number): void {
    if (message.type === 'rejected') {
      this.update({ rejection: { reason: message.reason, id: ++this.rejections } })
      return
    }
    if (message.type === 'error') {
      this.update({ error: message.message })
      return
    }
    if (!this.awaitingFirstSync && message.version < this.state.version) return // stale
    this.clockOffset = message.now - localNow

    const numbers = message.events.map((e) => e.n)
    // The first sync after connecting only sets the baseline, for events as for the view: nothing is
    // replayed, and later events count from its own. The room tells a new connection only of events
    // after it, so nothing seen before can come again; and a room that was reset numbers from one.
    const toPlay = this.awaitingFirstSync ? [] : message.events.filter((e) => e.n > this.lastEvent)
    this.lastEvent = Math.max(this.awaitingFirstSync ? 0 : this.lastEvent, ...numbers)
    this.awaitingFirstSync = false

    this.update({ seat: message.seat, view: message.view, version: message.version, error: null })
    for (const event of toPlay) {
      for (const listener of this.eventListeners) listener(event, message.view, message.seat)
    }
  }

  /** The server's clock, for countdowns that must not depend on this device's clock. */
  serverNow(localNow: number): number {
    return localNow + this.clockOffset
  }

  clearRejection(): void {
    if (this.state.rejection !== null) this.update({ rejection: null })
  }

  private update(patch: Partial<ClientState<V>>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }
}
