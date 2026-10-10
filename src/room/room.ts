import type { z } from 'zod'
import { gameOf } from '../games'
import type { AnyGameModule } from '../kit/module'
import { NUDGE_GAP_MS, type Said, type Say, TALK_GAP_MS, answerThrow } from '../kit/talk'
import { type Actor, type Seat, type TableAction, type TableState, type TableView, isTableAction } from '../kit/table'
import {
  type ClientMessage,
  type NumberedEvent,
  type ServerMessage,
  MAX_TOKEN_LENGTH,
  MIN_TOKEN_LENGTH,
  PING,
  PONG,
  REPLACED_CLOSE_CODE,
  ROOM_FULL_CLOSE_CODE,
  TOKEN_PARAM,
  TOO_MANY_MESSAGES_CLOSE_CODE,
  UNKNOWN_ROOM_CLOSE_CODE,
  clientMessageSchema,
} from '../protocol'

/** What a socket keeps through the host sleeping: its device token, the address it came from, and when it opened. */
export interface ConnState {
  token: string
  /** The client's address as the edge saw it; null where there is no edge, as in development. */
  ip: string | null
  at: number
}

/** One socket to the room. */
export interface RoomConnection {
  readonly id: string
  state: ConnState | null
  setState(state: ConnState): void
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
    /** Forgets everything the room saved. */
    deleteAll(): Promise<void>
  }
  connections(): Iterable<RoomConnection>
}

/** A game's event, as the room passes it along. */
type Event = { type: string }
type Message = ServerMessage<TableView, Event>

/** Everything the room persists. Timers live inside `game` as deadlines. */
interface Saved {
  game: TableState
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
/** A device's sockets to one room: a new one past this closes its oldest, which may be a dead one a phone left behind. */
export const MAX_SOCKETS_PER_DEVICE = 4
/** Sockets that hold no seat (watchers, and people yet to sit), in all and from one address. A seated device is always let in. */
export const MAX_WATCHERS = 16
export const MAX_WATCHERS_PER_ADDRESS = 8
/** Each socket may send this many messages at once, and this many a second after that; past twice the burst it is closed. */
export const MESSAGE_BURST = 30
export const MESSAGES_PER_SECOND = 5

/**
 * A room: the game its name holds, found again on every wake, and that game's table. The game
 * is read from the name and never saved, so a room that names no known game holds nothing and
 * refuses every connection.
 */
export class TableRoom {
  private table: Table | null = null

  constructor(
    private readonly host: RoomHost,
    private readonly deps: Deps = defaultDeps,
  ) {}

  async onStart(): Promise<void> {
    const module = gameOf(this.host.name)
    this.table = module && new Table(module, this.host, this.deps)
    await this.table?.start()
  }

  onConnect(conn: RoomConnection, url: string, ip: string | null = null): Promise<void> {
    if (this.table === null) {
      conn.close(UNKNOWN_ROOM_CLOSE_CODE, 'Unknown room')
      return Promise.resolve()
    }
    return this.table.onConnect(conn, url, ip)
  }

  onClose(conn: RoomConnection): Promise<void> {
    return this.table?.onClose(conn) ?? Promise.resolve()
  }

  onMessage(message: string | ArrayBuffer | ArrayBufferView, sender: RoomConnection): Promise<void> | void {
    if (message === PING) return void sender.send(PONG)
    return this.table?.onMessage(message, sender)
  }

  onAlarm(): Promise<void> {
    return this.table?.onAlarm() ?? Promise.resolve()
  }
}

/**
 * A table of one game: identity, persistence, the alarm and the computers. It keeps nothing in
 * memory that is not also in storage or in a connection's state, so the host may drop it at any
 * moment and build another. It knows the game only through its module and the kit's table.
 */
class Table {
  private saved: Saved
  /** Serialises all work so two messages can never interleave. */
  private queue: Promise<void> = Promise.resolve()
  private readonly messages: z.ZodType<ClientMessage<unknown>>
  /**
   * When each seat last talked, and last nudged each other seat. The only thing the room keeps in
   * memory, and not a fact of the game: the limits are best effort, and a restart that forgets them
   * forgets only a few seconds of them.
   */
  private readonly talked = new Map<Seat, number>()
  private readonly nudged = new Map<string, number>()
  /** What each socket may still send, refilled with time. In memory too: a wake starts every socket afresh. */
  private readonly allowance = new Map<string, { left: number; at: number }>()

  constructor(
    private readonly module: AnyGameModule,
    private readonly host: RoomHost,
    private readonly deps: Deps,
  ) {
    this.saved = fresh(module)
    this.messages = clientMessageSchema(module.actionSchema)
  }

  async start(): Promise<void> {
    const stored = await this.host.storage.get<Saved>(STORAGE_KEY)
    if (stored && stored.game?.formatVersion === this.module.formatVersion) {
      this.saved = stored
      await this.matchConnections()
    }
    // Who is here may have changed while the room slept, which may be all an Again vote waited for.
    await this.enqueue(() => this.drive())
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

  onConnect(conn: RoomConnection, url: string, ip: string | null): Promise<void> {
    const given = new URL(url).searchParams.get(TOKEN_PARAM) ?? ''
    const valid = given.length >= MIN_TOKEN_LENGTH && given.length <= MAX_TOKEN_LENGTH
    // A connection without a usable token is an anonymous spectator.
    conn.setState({ token: valid ? given : `anon-${conn.id}`, ip, at: this.deps.now() })
    return this.enqueue(async () => {
      if (!this.admit(conn)) return
      this.send(conn, []) // the current view, with no events to replay
      const seat = this.seatOf(conn)
      if (seat !== null && !this.saved.game.seats[seat].connected) await this.setConnected(seat, true)
      await this.drive()
    })
  }

  onClose(conn: RoomConnection): Promise<void> {
    this.allowance.delete(conn.id)
    return this.enqueue(async () => {
      const seat = this.seatOf(conn)
      // A close that woke the room may already have been settled by `matchConnections`.
      if (seat === null || !this.saved.game.seats[seat].connected) return
      const token = conn.state?.token
      const others = [...this.host.connections()].some((c) => c.id !== conn.id && c.state?.token === token)
      if (!others) await this.setConnected(seat, false)
      // A seat leaving may complete an Again vote: the rest have all said it.
      await this.drive()
    })
  }

  onMessage(message: string | ArrayBuffer | ArrayBufferView, sender: RoomConnection): Promise<void> {
    if (!this.allow(sender)) return Promise.resolve()
    const parsed = this.parse(message)
    // Talk changes nothing and is saved nowhere, so it is never queued behind the game.
    if (parsed !== null && 'say' in parsed) return Promise.resolve(this.talk(sender, parsed.say))
    return this.enqueue(async () => {
      if (parsed === null) return this.sendTo(sender, { type: 'rejected', reason: 'malformed' })
      if ('lift' in parsed) return this.lift(sender, parsed.lift)
      await this.act(this.seatOf(sender), parsed.action, sender)
      await this.drive()
    })
  }

  /**
   * Makes room for a new socket, or refuses it. A device keeps its newest few sockets. A seated one
   * is then always let in; anyone else only while the room, and their address, have watchers to spare.
   */
  private admit(conn: RoomConnection): boolean {
    const others = [...this.host.connections()].filter((c) => c.id !== conn.id)
    const mine = others.filter((c) => c.state?.token === conn.state?.token).sort((a, b) => (a.state?.at ?? 0) - (b.state?.at ?? 0))
    const replaced = mine.slice(0, Math.max(0, mine.length - (MAX_SOCKETS_PER_DEVICE - 1)))
    for (const old of replaced) this.close(old, REPLACED_CLOSE_CODE, 'Opened again elsewhere')
    if (this.seatOf(conn) !== null) return true
    const watchers = others.filter((c) => !replaced.includes(c) && this.seatOf(c) === null)
    const ip = conn.state?.ip ?? null
    const fromHere = ip === null ? 0 : watchers.filter((c) => c.state?.ip === ip).length
    if (watchers.length < MAX_WATCHERS && fromHere < MAX_WATCHERS_PER_ADDRESS) return true
    this.close(conn, ROOM_FULL_CLOSE_CODE, 'Room is full')
    return false
  }

  /**
   * Spends one of a socket's messages. Past its allowance a message is dropped unread, and a socket
   * that keeps sending regardless is closed.
   */
  private allow(conn: RoomConnection): boolean {
    const now = this.deps.now()
    const given = this.allowance.get(conn.id) ?? { left: MESSAGE_BURST, at: now }
    const left = Math.min(MESSAGE_BURST, given.left + ((now - given.at) / 1000) * MESSAGES_PER_SECOND) - 1
    this.allowance.set(conn.id, { left, at: now })
    if (left >= 0) return true
    if (left < -MESSAGE_BURST) this.close(conn, TOO_MANY_MESSAGES_CLOSE_CODE, 'Too many messages')
    return false
  }

  private close(conn: RoomConnection, code: number, reason: string): void {
    this.allowance.delete(conn.id)
    try {
      conn.close(code, reason)
    } catch (error) {
      console.error(`room close of ${conn.id} failed`, error)
    }
  }

  /** Relays what a seated person says to everyone, within the limits; anything else is dropped without a word. */
  private talk(sender: RoomConnection, say: Say): void {
    const seat = this.seatOf(sender)
    if (seat === null) return
    const game = this.saved.game
    const now = this.deps.now()
    if (now - (this.talked.get(seat) ?? -Infinity) < TALK_GAP_MS) return
    if (say.kind === 'throw') {
      if (say.at === seat || (game.seats[say.at]?.kind ?? 'empty') === 'empty') return
      if (say.id === 'nudge') {
        // Only someone the table is waiting on may be hurried, and not over and over.
        const key = `${seat}>${say.at}`
        if (!this.module.seatsToAct(game).includes(say.at) || now - (this.nudged.get(key) ?? -Infinity) < NUDGE_GAP_MS) return
        this.nudged.set(key, now)
      }
    }
    this.talked.set(seat, now)
    const said: Said[] = [{ seat, say }]
    const answer = say.kind === 'throw' ? answerThrow(game, say.at, say.id, this.deps.rng) : null
    if (answer) said.push(answer)
    for (const s of said) this.broadcast({ type: 'said', ...s })
  }

  onAlarm(): Promise<void> {
    return this.enqueue(() => this.drive())
  }

  // ── Core ───────────────────────────────────────────────────────────────

  private enqueue(work: () => Promise<void> | void): Promise<void> {
    this.queue = this.queue.then(work).catch((error) => {
      console.error('room error', error)
      this.broadcast({ type: 'error', message: 'Something went wrong on the server.' })
    })
    return this.queue
  }

  /** Who is connected is a table action, the same in every game. */
  private setConnected(seat: Seat, connected: boolean): Promise<boolean> {
    return this.act('system', { type: 'setConnected', seat, connected } satisfies TableAction)
  }

  /** Applies one action: validate, check, save, then tell everyone. Returns whether it was applied. */
  private async act(actor: Actor, action: unknown, sender?: RoomConnection): Promise<boolean> {
    const before = this.saved.game
    const result = this.module.apply(before, actor, action, { now: this.deps.now(), rng: this.deps.rng })
    if ('rejected' in result) {
      if (sender) this.sendTo(sender, { type: 'rejected', reason: result.rejected })
      return false
    }
    this.module.checkInvariants(result.game) // throws on an engine bug; the previous state is kept

    const entries = Object.entries(this.saved.tokens)
    const senderToken = sender?.state?.token
    // Sitting down is a table action, the same in every game.
    if (isTableAction(action) && action.type === 'sit' && senderToken) entries.push([senderToken, action.seat])
    // Built from entries, every token is an own property, whatever its name; a later entry for a token wins.
    const tokens = Object.fromEntries(entries.filter(([, seat]) => result.game.seats[seat]?.kind === 'human'))

    const events: NumberedEvent<Event>[] = result.events.map((e, i) => ({ ...e, n: this.saved.eventCount + i + 1 }))
    this.saved = {
      game: result.game,
      tokens,
      version: this.saved.version + 1,
      eventCount: this.saved.eventCount + events.length,
      emptySince: emptySince(result.game, this.saved.emptySince, this.deps.now()),
    }
    await this.host.storage.put(STORAGE_KEY, this.saved)
    await this.armAlarm()
    const said = this.module.banter?.(this.saved.game, result.events, this.deps.rng) ?? []
    for (const conn of this.host.connections()) this.send(conn, events, said)

    for (const ask of this.module.reactions(this.saved.game, result.events)) {
      const step = ask(this.saved.game)
      if (step) await this.act(step.actor, step.action)
    }
    return true
  }

  /**
   * A seated player lifted a card in their hand, or put it back: the others are told, and nothing is
   * kept, so a room that sleeps forgets it. Their table shows it only while that seat is choosing a card.
   */
  private lift(sender: RoomConnection, up: boolean): void {
    const seat = this.seatOf(sender)
    if (seat === null) return
    for (const conn of this.host.connections()) if (conn.id !== sender.id) this.sendTo(conn, { type: 'lift', seat, up })
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
      const step = this.module.dueStep(game, now)
      if (step === null) break
      const applied = (await this.act(step.actor, step.action)) || (step.fallback !== undefined && (await this.act(step.actor, step.fallback)))
      if (!applied && step.fallback !== undefined) throw new Error(`AI seat ${step.actor} has no acceptable action in ${game.phase.kind}`)
    }
    // An alarm that fired early, or nothing due: make sure the next deadline still has one.
    await this.armAlarm()
  }

  /**
   * Throws away an abandoned game. With nobody connected the room keeps nothing at all; otherwise
   * versions keep rising so connected clients accept the new view.
   */
  private async reset(): Promise<void> {
    if ([...this.host.connections()].length === 0) {
      this.saved = fresh(this.module)
      await this.host.storage.deleteAll()
      return
    }
    this.saved = { ...fresh(this.module), version: this.saved.version + 1, eventCount: this.saved.eventCount }
    await this.host.storage.put(STORAGE_KEY, this.saved)
    for (const conn of this.host.connections()) this.send(conn, [])
  }

  private async armAlarm(): Promise<void> {
    const expiry = this.saved.emptySince === null ? null : this.saved.emptySince + ABANDONED_AFTER_MS
    const times = [this.module.nextDeadline(this.saved.game), expiry].filter((t): t is number => t !== null)
    const deadline = times.length > 0 ? Math.min(...times) : null
    if (deadline === null) await this.host.storage.deleteAlarm()
    else await this.host.storage.setAlarm(Math.max(deadline, this.deps.now() + 1))
  }

  private parse(message: string | ArrayBuffer | ArrayBufferView): ClientMessage<unknown> | null {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE_LENGTH) return null
    try {
      const result = this.messages.safeParse(JSON.parse(message))
      return result.success ? result.data : null
    } catch {
      return null
    }
  }

  // ── Connections ────────────────────────────────────────────────────────

  /**
   * The seat a connection's token was given, if a human still holds it. Only the room's own tokens
   * count: a token named like a property every object inherits, such as `constructor`, is a stranger.
   */
  private seatOf(conn: RoomConnection): Seat | null {
    const token = conn.state?.token
    if (token === undefined || !Object.hasOwn(this.saved.tokens, token)) return null
    const seat = this.saved.tokens[token]
    return Number.isInteger(seat) && this.saved.game.seats[seat]?.kind === 'human' ? seat : null
  }

  private send(conn: RoomConnection, events: NumberedEvent<Event>[], said: Said[] = []) {
    this.deliver(conn, () => {
      const seat = this.seatOf(conn)
      return {
        type: 'sync',
        version: this.saved.version,
        now: this.deps.now(),
        seat,
        view: this.module.viewFor(this.saved.game, seat),
        events,
        ...(said.length > 0 ? { said } : {}),
      }
    })
  }

  private sendTo(conn: RoomConnection, message: Message) {
    this.deliver(conn, () => message)
  }

  /**
   * Tells one connection, on its own: if building its message or sending it fails, that is logged and
   * goes no further, so everyone else is still told and nothing after the broadcast is skipped.
   */
  private deliver(conn: RoomConnection, message: () => Message) {
    try {
      conn.send(JSON.stringify(message()))
    } catch (error) {
      console.error(`room send to ${conn.id} failed`, error)
    }
  }

  private broadcast(message: Message) {
    for (const conn of this.host.connections()) this.sendTo(conn, message)
  }
}

function fresh(module: AnyGameModule): Saved {
  return { game: module.createGame(), tokens: {}, version: 0, eventCount: 0, emptySince: null }
}

/**
 * Starts, keeps or clears the abandonment clock for the game as it now stands. It runs whenever no
 * seated person is connected, a lobby nobody sits in included, so every saved room is dropped in time.
 */
function emptySince(game: TableState, previous: number | null, now: number): number | null {
  if (game.seats.some((s) => s.kind === 'human' && s.connected)) return null
  return previous ?? now
}
