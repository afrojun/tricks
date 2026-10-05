import { dueStep, reactions } from '../ai/drive'
import {
  type Action,
  type Actor,
  type Game,
  type Seat,
  apply,
  FORMAT_VERSION,
  checkInvariants,
  createGame,
  nextDeadline,
  viewFor,
} from '../engine'
import {
  type NumberedEvent,
  type ServerMessage,
  MAX_TOKEN_LENGTH,
  MIN_TOKEN_LENGTH,
  PING,
  PONG,
  TOKEN_PARAM,
  UNKNOWN_ROOM_CLOSE_CODE,
  clientMessageSchema,
  isRoomName,
} from '../protocol'

/** One socket to the room. Its state holds the device token and must survive the host sleeping. */
export interface RoomConnection {
  readonly id: string
  state: { token: string } | null
  setState(state: { token: string }): void
  send(text: string): void
  close(code: number, reason: string): void
}

/** What the room needs from wherever it runs: Cloudflare, or a test. */
export interface RoomHost {
  /** The room's name, `<game>-<CODE>`. Available on every wake, including an alarm. */
  readonly name: string
  storage: {
    get<T>(key: string): Promise<T | undefined>
    put(key: string, value: unknown): Promise<void>
    setAlarm(at: number): Promise<void>
    deleteAlarm(): Promise<void>
  }
  connections(): Iterable<RoomConnection>
}

/** Everything the room persists. Timers live inside `game` as deadlines. */
interface Saved {
  game: Game
  /** Secret device token → seat. Never sent to clients. */
  tokens: Record<string, Seat>
  version: number
  eventCount: number
  /** When the last seated human disconnected; null while one is present or the room is unused. */
  emptySince: number | null
}

export interface Deps {
  now: () => number
  rng: () => number
}

const defaultDeps: Deps = {
  now: () => Date.now(),
  rng: () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32,
}

const STORAGE_KEY = 'state'
/** A room no seated human has been connected to for this long is reset to an empty lobby. */
export const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000
const MAX_MESSAGE_LENGTH = 2000

/**
 * A table of one game: identity, persistence, the alarm and the computers. It keeps nothing in
 * memory that is not also in storage or in a connection's state, so the host may drop it at any
 * moment and build another.
 */
export class TableRoom {
  private saved: Saved = fresh()
  /** Serialises all work so two messages can never interleave. */
  private queue: Promise<void> = Promise.resolve()

  constructor(
    private readonly host: RoomHost,
    private readonly deps: Deps = defaultDeps,
  ) {}

  async onStart(): Promise<void> {
    const stored = await this.host.storage.get<Saved>(STORAGE_KEY)
    if (stored && stored.game?.formatVersion === FORMAT_VERSION) {
      this.saved = stored
      await this.matchConnections()
    }
    await this.armAlarm()
  }

  /**
   * A human seat is connected exactly when an open socket's token maps to it. After a restart
   * there are no sockets, so every human seat is disconnected; after a wake from hibernation the
   * sockets are still open and their seats stay connected. Writes and tells the table only on a change.
   */
  private async matchConnections(): Promise<void> {
    const present = new Set([...this.host.connections()].map((conn) => this.seatOf(conn)))
    let changed = false
    this.saved.game.seats.forEach((seat, i) => {
      if (seat.kind !== 'human' || seat.connected === present.has(i)) return
      seat.connected = present.has(i)
      changed = true
    })
    const since = emptySince(this.saved.game, this.saved.emptySince ?? null, this.deps.now())
    if (!changed && since === this.saved.emptySince) return
    this.saved = { ...this.saved, emptySince: since, version: this.saved.version + 1 }
    await this.host.storage.put(STORAGE_KEY, this.saved)
    for (const conn of this.host.connections()) this.send(conn, [])
  }

  onConnect(conn: RoomConnection, url: string): Promise<void> {
    // The game is read from the name, so a room that names none is refused outright.
    if (!this.named()) {
      conn.close(UNKNOWN_ROOM_CLOSE_CODE, 'Unknown room')
      return Promise.resolve()
    }
    const given = new URL(url).searchParams.get(TOKEN_PARAM) ?? ''
    const valid = given.length >= MIN_TOKEN_LENGTH && given.length <= MAX_TOKEN_LENGTH
    // A connection without a usable token is an anonymous spectator.
    conn.setState({ token: valid ? given : `anon-${conn.id}` })
    return this.enqueue(async () => {
      this.send(conn, []) // the current view, with no events to replay
      const seat = this.seatOf(conn)
      if (seat !== null && !this.saved.game.seats[seat].connected) {
        await this.act('system', { type: 'setConnected', seat, connected: true })
      }
    })
  }

  onClose(conn: RoomConnection): Promise<void> {
    return this.enqueue(async () => {
      const seat = this.seatOf(conn)
      // A close that woke the room may already have been settled by `matchConnections`.
      if (seat === null || !this.saved.game.seats[seat].connected) return
      const token = conn.state?.token
      const others = [...this.host.connections()].some((c) => c.id !== conn.id && c.state?.token === token)
      if (!others) await this.act('system', { type: 'setConnected', seat, connected: false })
    })
  }

  onMessage(message: string | ArrayBuffer | ArrayBufferView, sender: RoomConnection): Promise<void> | void {
    if (message === PING) return void sender.send(PONG)
    if (!this.named()) return
    return this.enqueue(async () => {
      const parsed = parse(message)
      if (parsed === null) return this.sendTo(sender, { type: 'rejected', reason: 'malformed' })
      await this.act(this.seatOf(sender), parsed, sender)
      await this.drive()
    })
  }

  onAlarm(): Promise<void> {
    return this.enqueue(() => this.drive())
  }

  // ── Core ───────────────────────────────────────────────────────────────

  /** Whether this room's name is a known game and a code. */
  private named(): boolean {
    return isRoomName(this.host.name)
  }

  private enqueue(work: () => Promise<void> | void): Promise<void> {
    this.queue = this.queue.then(work).catch((error) => {
      console.error('room error', error)
      this.broadcast({ type: 'error', message: 'Something went wrong on the server.' })
    })
    return this.queue
  }

  /** Applies one action: validate, check, save, then tell everyone. Returns whether it was applied. */
  private async act(actor: Actor, action: Action, sender?: RoomConnection): Promise<boolean> {
    const before = this.saved.game
    const result = apply(before, actor, action, { now: this.deps.now(), rng: this.deps.rng })
    if ('rejected' in result) {
      if (sender) this.sendTo(sender, { type: 'rejected', reason: result.rejected })
      return false
    }
    checkInvariants(result.game) // throws on an engine bug; the previous state is kept

    const tokens = { ...this.saved.tokens }
    const senderToken = sender?.state?.token
    if (action.type === 'sit' && senderToken) tokens[senderToken] = action.seat
    for (const [token, seat] of Object.entries(tokens)) {
      if (result.game.seats[seat]?.kind !== 'human') delete tokens[token]
    }

    const events: NumberedEvent[] = result.events.map((e, i) => ({ ...e, n: this.saved.eventCount + i + 1 }))
    this.saved = {
      game: result.game,
      tokens,
      version: this.saved.version + 1,
      eventCount: this.saved.eventCount + events.length,
      emptySince: emptySince(result.game, this.saved.emptySince, this.deps.now()),
    }
    await this.host.storage.put(STORAGE_KEY, this.saved)
    for (const conn of this.host.connections()) this.send(conn, events)
    await this.armAlarm()

    for (const ask of reactions(this.saved.game, result.events)) {
      const step = ask(this.saved.game)
      if (step) await this.act(step.actor, step.action)
    }
    return true
  }

  /** Resolves every deadline and AI turn that is due. */
  private async drive(): Promise<void> {
    for (let guard = 0; guard < 100; guard++) {
      const game = this.saved.game
      const now = this.deps.now()
      if (this.saved.emptySince !== null && now >= this.saved.emptySince + ABANDONED_AFTER_MS) {
        await this.reset()
        break
      }
      const step = dueStep(game, now)
      if (step === null) break
      const applied = (await this.act(step.actor, step.action)) || (step.fallback !== undefined && (await this.act(step.actor, step.fallback)))
      if (!applied && step.fallback !== undefined) throw new Error(`AI seat ${step.actor} has no acceptable action in ${game.phase.kind}`)
    }
    // An alarm that fired early, or nothing due: make sure the next deadline still has one.
    await this.armAlarm()
  }

  /** Throws away an abandoned game. Versions keep rising so connected clients accept the new view. */
  private async reset(): Promise<void> {
    this.saved = { ...fresh(), version: this.saved.version + 1, eventCount: this.saved.eventCount }
    await this.host.storage.put(STORAGE_KEY, this.saved)
    for (const conn of this.host.connections()) this.send(conn, [])
  }

  private async armAlarm(): Promise<void> {
    const expiry = this.saved.emptySince === null ? null : this.saved.emptySince + ABANDONED_AFTER_MS
    const times = [nextDeadline(this.saved.game), expiry].filter((t): t is number => t !== null)
    const deadline = times.length > 0 ? Math.min(...times) : null
    if (deadline === null) await this.host.storage.deleteAlarm()
    else await this.host.storage.setAlarm(Math.max(deadline, this.deps.now() + 1))
  }

  // ── Connections ────────────────────────────────────────────────────────

  private seatOf(conn: RoomConnection): Seat | null {
    const token = conn.state?.token
    return token !== undefined && token in this.saved.tokens ? this.saved.tokens[token] : null
  }

  private send(conn: RoomConnection, events: NumberedEvent[]) {
    const seat = this.seatOf(conn)
    this.sendTo(conn, {
      type: 'sync',
      version: this.saved.version,
      now: this.deps.now(),
      seat,
      view: viewFor(this.saved.game, seat),
      events,
    })
  }

  private sendTo(conn: RoomConnection, message: ServerMessage) {
    conn.send(JSON.stringify(message))
  }

  private broadcast(message: ServerMessage) {
    for (const conn of this.host.connections()) this.sendTo(conn, message)
  }
}

function fresh(): Saved {
  return { game: createGame(), tokens: {}, version: 0, eventCount: 0, emptySince: null }
}

/** Starts, keeps or clears the abandonment clock for the game as it now stands. */
function emptySince(game: Game, previous: number | null, now: number): number | null {
  const unused = game.phase.kind === 'lobby' && game.seats.every((s) => s.kind === 'empty')
  const humanPresent = game.seats.some((s) => s.kind === 'human' && s.connected)
  if (unused || humanPresent) return null
  return previous ?? now
}

function parse(message: string | ArrayBuffer | ArrayBufferView): Action | null {
  if (typeof message !== 'string' || message.length > MAX_MESSAGE_LENGTH) return null
  try {
    const result = clientMessageSchema.safeParse(JSON.parse(message))
    return result.success ? result.data.action : null
  } catch {
    return null
  }
}
