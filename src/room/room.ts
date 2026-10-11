import type { z } from 'zod'
import { gameOf } from '../games'
import type { AnyGameModule, Step } from '../kit/module'
import { tableTitle } from '../kit/words'
import { type PushMessage, type PushResult, isPushEndpoint } from './webpush'
import { NUDGE_GAP_MS, type Said, type Say, TALK_GAP_MS, answerThrow } from '../kit/talk'
import { type Actor, type Seat, type TableAction, type TableSettings, type TableState, type TableView, isTableAction, standInDeadline, standInDue } from '../kit/table'
import {
  type ClientMessage,
  type NumberedEvent,
  type PushTarget,
  type RoomStatus,
  splitRoomName,
  type ServerMessage,
  MAX_TOKEN_LENGTH,
  MIN_TOKEN_LENGTH,
  PACE_PARAM,
  PING,
  PONG,
  REPLACED_CLOSE_CODE,
  ROOM_FULL_CLOSE_CODE,
  SINCE_PARAM,
  TOKEN_PARAM,
  TOO_MANY_MESSAGES_CLOSE_CODE,
  UNKNOWN_ROOM_CLOSE_CODE,
  clientMessageSchema,
  paceOf,
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
  /**
   * Sends one notification to one device, where the host can (Cloudflare with its signing key). Never
   * throws. The room does not wait for it: what comes of it is the host's to keep going.
   */
  push?(target: PushTarget, message: PushMessage): Promise<PushResult>
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
  /**
   * A development room's clock, `rate` times faster than real time since it was asked to run so (`PACE_PARAM`):
   * the table's time was `table` at real time `real`. Without it the table's time is real time.
   */
  clock?: { rate: number; real: number; table: number }
  /** Secret device token → where its notifications go, for a seated device that asked for them. Never sent to clients. */
  pushes?: Record<string, PushTarget>
  /** The newest events, up to `LOG_SIZE`, for a device coming back to tell it what it missed. Every event is sent to everyone, so none is secret. */
  log?: NumberedEvent<Event>[]
}

/** How many of the newest events a room keeps for its recaps. */
export const LOG_SIZE = 200
/** The table's own events a recap may carry, in every game. */
const TABLE_RECAP = ['paceChanged']

export interface Deps {
  now: () => number
  rng: () => number
  /** Whether a connection may set the room's pace, as only the development server's rooms allow. */
  paced?: boolean
}

export const defaultDeps: Deps = {
  now: () => Date.now(),
  rng: () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32,
}

const STORAGE_KEY = 'state'
/** A room no seated human has been connected to for this long is reset to an empty lobby. */
export const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000
/** The same for a table playing over days, where nobody being connected is the usual state. */
export const ASYNC_ABANDONED_AFTER_MS = 14 * 24 * 60 * 60 * 1000
const MAX_MESSAGE_LENGTH = 2000
/** A device's sockets to one room: a new one past this closes its oldest, which may be a dead one a phone left behind. */
export const MAX_SOCKETS_PER_DEVICE = 4
/**
 * Sockets that hold no seat (watchers, and people yet to sit), in all and from one address. A new
 * socket always gets in: past either limit the oldest watcher goes, so a crowd cannot keep a friend from a seat.
 */
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

  /** What the room says of the seat a device token holds, or null when the token holds none here. */
  status(token: string | null): Promise<RoomStatus | null> {
    return this.table?.status(token) ?? Promise.resolve(null)
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
      // A room saved at a pace under `pnpm dev` and opened where pace is not allowed (`pnpm preview` shares its
      // storage) runs on at real time, its clock carrying on from where the table's time had got to.
      const clock = stored.clock
      if (!this.deps.paced && clock && clock.rate !== 1) {
        this.saved = { ...stored, clock: { rate: 1, real: this.deps.now(), table: this.now() } }
        await this.host.storage.put(STORAGE_KEY, this.saved)
      }
      await this.matchConnections()
    } else {
      // A room that has saved nothing may still hold what its host keeps (partyserver keeps its
      // name), so it too is cleared once nobody has sat in it for a day. It saves when it was
      // first seen, or every wake would put that day off again.
      this.saved = { ...fresh(this.module), emptySince: this.deps.now() }
      await this.host.storage.put(STORAGE_KEY, this.saved)
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
    const since = emptySince(this.saved.game, this.saved.emptySince ?? null, this.now())
    if (!changed && since === this.saved.emptySince) return
    this.saved = { ...this.saved, emptySince: since, version: this.saved.version + 1 }
    await this.host.storage.put(STORAGE_KEY, this.saved)
    for (const conn of this.host.connections()) this.send(conn, [])
  }

  onConnect(conn: RoomConnection, url: string, ip: string | null): Promise<void> {
    const query = new URL(url).searchParams
    const given = query.get(TOKEN_PARAM) ?? ''
    const valid = given.length >= MIN_TOKEN_LENGTH && given.length <= MAX_TOKEN_LENGTH
    // A connection without a usable token is an anonymous spectator.
    conn.setState({ token: valid ? given : `anon-${conn.id}`, ip, at: this.deps.now() })
    return this.enqueue(async () => {
      if (this.deps.paced) await this.pace(query.get(PACE_PARAM))
      this.admit(conn)
      this.recap(conn, query.get(SINCE_PARAM))
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
      if ('push' in parsed) return this.setPush(sender, parsed.push)
      await this.act(this.seatOf(sender), parsed.action, sender)
      await this.drive()
    })
  }

  /**
   * A device keeps its newest few sockets: a new one past them closes its oldest. Connection ids
   * are the Worker's own, so no two sockets share one.
   */
  private admit(conn: RoomConnection): void {
    const mine = [...this.host.connections()].filter((c) => c.id !== conn.id && c.state?.token === conn.state?.token).sort(byAge)
    for (const old of mine.slice(0, Math.max(0, mine.length - (MAX_SOCKETS_PER_DEVICE - 1)))) this.close(old, REPLACED_CLOSE_CODE, 'Opened again elsewhere')
  }

  /**
   * Holds the watchers to their limits, each address's and the room's, by closing the oldest.
   * Run after every change: a newcomer, someone standing up and a reset all make watchers. A
   * newcomer is the newest, so it gets in; a seated socket is never closed here.
   */
  private trimWatchers(): void {
    const watchers = [...this.host.connections()].filter((c) => this.seatOf(c) === null).sort(byAge)
    const byAddress = new Map<string, RoomConnection[]>()
    for (const c of watchers) if (c.state?.ip) byAddress.set(c.state.ip, [...(byAddress.get(c.state.ip) ?? []), c])
    const out = new Set([...byAddress.values()].flatMap((group) => group.slice(0, Math.max(0, group.length - MAX_WATCHERS_PER_ADDRESS))))
    const left = watchers.filter((c) => !out.has(c))
    for (const c of left.slice(0, Math.max(0, left.length - MAX_WATCHERS))) out.add(c)
    for (const c of out) this.close(c, ROOM_FULL_CLOSE_CODE, 'Room is full')
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
    // Rare, and the signal worth keeping: a device opening too many, a crowd, a flood. No token or address.
    console.log(JSON.stringify({ room: this.host.name, closed: code }))
    // The page is told first, if it can be: closed from another socket's event, as a device's oldest
    // or a crowded-out watcher is, a socket's close frame never reaches it (workerd, 2026-10).
    this.deliver(conn, () => ({ type: 'closing', code }))
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
        // Over days the one nudged is most likely away: the nudge reaches them as a notification.
        const target = game.seats[say.at]
        if (game.settings.pace === 'async' && target.kind === 'human' && !target.connected) this.pushTo(say.at, `${game.seats[seat].name} nudged you`)
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

  /** Answered in turn with the game's changes, so it reads the game as one of them left it. */
  async status(token: string | null): Promise<RoomStatus | null> {
    let answer: RoomStatus | null = null
    await this.enqueue(() => {
      const valid = token !== null && token.length >= MIN_TOKEN_LENGTH && token.length <= MAX_TOKEN_LENGTH
      const seat = valid ? this.seatOfToken(token) : null
      if (seat === null) return
      const game = this.saved.game
      const kind = game.phase.kind
      const toAct = this.module.seatsToAct(game)
      answer = {
        stage: kind === 'lobby' || kind === 'gameOver' ? kind : kind === 'roundResult' ? 'roundOver' : 'playing',
        seat,
        names: game.seats.map((s) => (s.kind === 'empty' ? '' : s.name)),
        waitingOn: toAct.filter((s) => game.seats[s].kind === 'human' && !game.seats[s].standIn),
        yourTurn: toAct.includes(seat),
        standIn: game.seats[seat].standIn,
        pace: game.settings.pace,
      }
    })
    return answer
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
    const result = this.module.apply(before, actor, action, { now: this.now(), rng: this.deps.rng })
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
      ...this.saved,
      game: result.game,
      tokens,
      // A device that no longer holds a seat here hears nothing more of it.
      pushes: Object.fromEntries(Object.entries(this.saved.pushes ?? {}).filter(([token]) => Object.hasOwn(tokens, token))),
      version: this.saved.version + 1,
      eventCount: this.saved.eventCount + events.length,
      log: events.length > 0 ? [...(this.saved.log ?? []), ...events].slice(-LOG_SIZE) : this.saved.log,
      emptySince: emptySince(result.game, this.saved.emptySince, this.now()),
    }
    await this.host.storage.put(STORAGE_KEY, this.saved)
    await this.armAlarm()
    const said = this.module.banter?.(this.saved.game, result.events, this.deps.rng) ?? []
    for (const conn of this.host.connections()) this.send(conn, events, said)
    this.notify(before, this.saved.game)

    for (const ask of this.module.reactions(this.saved.game, result.events)) {
      const step = ask(this.saved.game)
      if (step) await this.act(step.actor, step.action)
    }
    return true
  }

  /**
   * Tells a connection coming back what it missed: the events after the last one it saw, if the room
   * still has every one of them. A room that has moved on further, or been reset, says nothing.
   */
  private recap(conn: RoomConnection, since: string | null): void {
    // Only for a player coming back to their seat: a watcher has nothing to have missed.
    if (this.seatOf(conn) === null) return
    const seen = since === null || !/^\d{1,9}$/.test(since) ? null : Number(since)
    const log = this.saved.log ?? []
    if (seen === null || seen >= this.saved.eventCount || log.length === 0 || log[0].n > seen + 1) return
    // Only what the game says a recap may tell: never a card played, which the view hides once its trick is past.
    const told = new Set<string>([...this.module.recapEvents, ...TABLE_RECAP])
    this.sendTo(conn, { type: 'recap', events: log.filter((e) => e.n > seen && told.has(e.type)) })
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

  // ── Notifications ──────────────────────────────────────────────────────

  /** A seated device says where its notifications go, or that it wants none. Kept with the seat's token, and saved. */
  private async setPush(sender: RoomConnection, target: PushTarget | null): Promise<void> {
    const token = sender.state?.token
    if (token === undefined || this.seatOf(sender) === null) return
    if (target !== null && !isPushEndpoint(target.endpoint)) return
    const pushes = { ...this.saved.pushes }
    if (target === null) delete pushes[token]
    else pushes[token] = { endpoint: target.endpoint, keys: { p256dh: target.keys.p256dh, auth: target.keys.auth } }
    this.saved = { ...this.saved, pushes }
    await this.host.storage.put(STORAGE_KEY, this.saved)
  }

  /**
   * Over days, tells each person away what a change asks of them: their turn has come, the computer
   * has started playing for them, or a round is over and waits for anyone to start the next. One
   * notification a person a change; nothing to anyone connected, or while the table plays together.
   */
  private notify(before: TableState, after: TableState): void {
    if (this.host.push === undefined || after.settings.pace !== 'async') return
    const person = (game: TableState, seat: Seat) => game.seats[seat]?.kind === 'human'
    const playing = (game: TableState, seat: Seat) => person(game, seat) && !game.seats[seat].standIn
    // A table that has just gone over days tells everyone it already waits on, as if the wait were new.
    const waited = new Set(before.settings.pace === 'async' ? this.module.seatsToAct(before).filter((seat) => playing(before, seat)) : [])
    const told = new Map<Seat, string>()
    after.seats.forEach((s, seat) => {
      if (!person(after, seat) || s.connected) return
      if (s.standIn && !before.seats[seat]?.standIn) told.set(seat, 'The computer is playing for you')
      else if (after.phase.kind === 'roundResult' && before.phase.kind !== 'roundResult') told.set(seat, 'Round over')
    })
    for (const seat of this.module.seatsToAct(after)) {
      if (playing(after, seat) && !after.seats[seat].connected && !waited.has(seat) && !told.has(seat)) told.set(seat, 'Your turn')
    }
    for (const [seat, title] of told) this.pushTo(seat, title)
  }

  /** Sends one notification to every device that holds `seat` and asked for them, and forgets any its service no longer knows. */
  private pushTo(seat: Seat, title: string): void {
    const push = this.host.push
    const room = splitRoomName(this.host.name)
    if (push === undefined || room === null) return
    const game = this.saved.game
    const message: PushMessage = {
      title,
      body: tableTitle(this.module.name, room.code, game.seats.map((s) => (s.kind === 'empty' ? '' : s.name)), seat),
      url: `/${room.game}/${room.code}`,
      tag: this.host.name,
    }
    for (const [token, target] of Object.entries(this.saved.pushes ?? {})) {
      if (this.saved.tokens[token] !== seat) continue
      void push(target, message).then((result) => {
        if (result !== 'gone') return
        // Forgotten only if the device has not given another since.
        return this.enqueue(async () => {
          if (this.saved.pushes?.[token]?.endpoint !== target.endpoint) return
          const pushes = { ...this.saved.pushes }
          delete pushes[token]
          this.saved = { ...this.saved, pushes }
          await this.host.storage.put(STORAGE_KEY, this.saved)
        })
      })
    }
  }

  /** Resolves every deadline and AI turn that is due. */
  private async drive(): Promise<void> {
    for (let guard = 0; guard < 100; guard++) {
      const game = this.saved.game
      const now = this.now()
      const expiry = this.expiry()
      if (expiry !== null && now >= expiry) {
        await this.reset()
        break
      }
      // Over days, a person who has left their turn for too long is stood in for by the computer.
      const late = standInDue(game, now)
      const standIn: Step<unknown> | null = late === null ? null : { actor: 'system', action: { type: 'standIn', seat: late } satisfies TableAction }
      const step = this.module.dueStep(game, now) ?? standIn
      if (step === null) break
      const applied = (await this.act(step.actor, step.action)) || (step.fallback !== undefined && (await this.act(step.actor, step.fallback)))
      if (!applied && step.fallback !== undefined) throw new Error(`AI seat ${step.actor} has no acceptable action in ${game.phase.kind}`)
    }
    // An alarm that fired early, or nothing due: make sure the next deadline still has one.
    await this.armAlarm()
    this.trimWatchers()
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
    // The clock runs on, so the room is cleared once the watchers go too.
    const { version, eventCount, clock } = this.saved
    this.saved = { ...fresh(this.module), version: version + 1, eventCount, emptySince: this.now(), ...(clock && { clock }) }
    await this.host.storage.put(STORAGE_KEY, this.saved)
    for (const conn of this.host.connections()) this.send(conn, [])
  }

  /** When the room is reset if nobody seated connects before then; null while someone is. */
  private expiry(): number | null {
    return this.saved.emptySince === null ? null : this.saved.emptySince + abandonedAfter(this.saved.game.settings)
  }

  private async armAlarm(): Promise<void> {
    const times = [this.module.nextDeadline(this.saved.game), standInDeadline(this.saved.game), this.expiry()].filter((t): t is number => t !== null)
    const deadline = times.length > 0 ? Math.min(...times) : null
    if (deadline === null) await this.host.storage.deleteAlarm()
    else await this.host.storage.setAlarm(Math.max(Math.ceil(this.realAt(deadline)), this.deps.now() + 1))
  }

  /** The table's time: real time, unless a development room runs its clock faster. */
  private now(): number {
    const clock = this.saved.clock
    return clock ? clock.table + (this.deps.now() - clock.real) * clock.rate : this.deps.now()
  }

  /** The real time at which the table's clock reaches `at`. */
  private realAt(at: number): number {
    const clock = this.saved.clock
    return clock ? clock.real + (at - clock.table) / clock.rate : at
  }

  /** Runs a development room's clock at the pace a connection asks for, carrying on from the table's time now. */
  private async pace(asked: string | null): Promise<void> {
    const rate = paceOf(asked)
    if (asked === null || rate === (this.saved.clock?.rate ?? 1)) return
    this.saved = { ...this.saved, clock: { rate, real: this.deps.now(), table: this.now() } }
    await this.host.storage.put(STORAGE_KEY, this.saved)
    await this.armAlarm()
    // Everyone's countdowns follow the clock, so everyone is told its new rate.
    for (const conn of this.host.connections()) this.send(conn, [])
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
    return conn.state ? this.seatOfToken(conn.state.token) : null
  }

  private seatOfToken(token: string): Seat | null {
    if (!Object.hasOwn(this.saved.tokens, token)) return null
    const seat = this.saved.tokens[token]
    return Number.isInteger(seat) && this.saved.game.seats[seat]?.kind === 'human' ? seat : null
  }

  private send(conn: RoomConnection, events: NumberedEvent<Event>[], said: Said[] = []) {
    this.deliver(conn, () => {
      const seat = this.seatOf(conn)
      return {
        type: 'sync',
        version: this.saved.version,
        now: this.now(),
        ...(this.saved.clock && this.saved.clock.rate !== 1 && { rate: this.saved.clock.rate }),
        seat,
        view: this.module.viewFor(this.saved.game, seat),
        events,
        ...(said.length > 0 ? { said } : {}),
        lastEvent: this.saved.eventCount,
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

/** Oldest socket first. */
function byAge(a: RoomConnection, b: RoomConnection): number {
  return (a.state?.at ?? 0) - (b.state?.at ?? 0)
}

/** How long a room may go with nobody seated connected before it is reset: a day, or two weeks over days. */
export function abandonedAfter(settings: TableSettings): number {
  return settings.pace === 'async' ? ASYNC_ABANDONED_AFTER_MS : ABANDONED_AFTER_MS
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
