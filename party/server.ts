import type * as Party from 'partykit/server'
import { chooseAction, chooseJodhi, fallbackAction } from '../src/ai/choose'
import {
  type Action,
  type Actor,
  type Game,
  type GameEvent,
  type Seat,
  FORMAT_VERSION,
  apply,
  checkInvariants,
  createGame,
  isAiControlled,
  nextDeadline,
  seatsToAct,
  teamOf,
  viewFor,
} from '../src/engine'
import {
  type NumberedEvent,
  type ServerMessage,
  MAX_TOKEN_LENGTH,
  MIN_TOKEN_LENGTH,
  PING,
  PONG,
  TOKEN_PARAM,
  clientMessageSchema,
} from '../src/protocol'

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

interface Deps {
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
type ConnState = { token: string }

export default class ThuneeRoom implements Party.Server {
  private saved: Saved = fresh()
  /** Serialises all work so two messages can never interleave. */
  private queue: Promise<void> = Promise.resolve()

  constructor(
    readonly room: Party.Room,
    private readonly deps: Deps = defaultDeps,
  ) {}

  async onStart() {
    const stored = await this.room.storage.get<Saved>(STORAGE_KEY)
    if (stored && stored.game?.formatVersion === FORMAT_VERSION) {
      this.saved = stored
      // Nobody is connected to a room that has just started.
      for (const seat of this.saved.game.seats) if (seat.kind === 'human') seat.connected = false
      this.saved.emptySince = emptySince(this.saved.game, stored.emptySince ?? null, this.deps.now())
      await this.room.storage.put(STORAGE_KEY, this.saved)
    }
    await this.armAlarm()
  }

  onConnect(conn: Party.Connection<ConnState>, ctx: Party.ConnectionContext) {
    const given = new URL(ctx.request.url).searchParams.get(TOKEN_PARAM) ?? ''
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

  onClose(conn: Party.Connection<ConnState>) {
    return this.enqueue(async () => {
      const seat = this.seatOf(conn)
      if (seat === null) return
      const token = conn.state?.token
      const others = [...this.room.getConnections<ConnState>()].some((c) => c.id !== conn.id && c.state?.token === token)
      if (!others) await this.act('system', { type: 'setConnected', seat, connected: false })
    })
  }

  onMessage(message: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection<ConnState>) {
    if (message === PING) return void sender.send(PONG)
    return this.enqueue(async () => {
      const parsed = parse(message)
      if (parsed === null) return this.sendTo(sender, { type: 'rejected', reason: 'malformed' })
      await this.act(this.seatOf(sender), parsed, sender)
      await this.drive()
    })
  }

  onAlarm() {
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

  /** Applies one action: validate, check, save, then tell everyone. Returns whether it was applied. */
  private async act(actor: Actor, action: Action, sender?: Party.Connection<ConnState>): Promise<boolean> {
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
    await this.room.storage.put(STORAGE_KEY, this.saved)
    for (const conn of this.room.getConnections<ConnState>()) this.send(conn, events)
    await this.armAlarm()

    await this.aiJodhi(result.events)
    return true
  }

  /** Resolves every deadline and AI turn that is due. */
  private async drive(): Promise<void> {
    for (let guard = 0; guard < 100; guard++) {
      const game = this.saved.game
      const now = this.deps.now()
      const phase = game.phase
      if (this.saved.emptySince !== null && now >= this.saved.emptySince + ABANDONED_AFTER_MS) {
        await this.reset()
        break
      }
      if ('deadline' in phase && phase.deadline <= now) {
        await this.act('system', { type: 'tick' })
        continue
      }
      if (game.aiActAt !== null && game.aiActAt <= now) {
        const seat = seatsToAct(game).find((s) => isAiControlled(game, s))
        if (seat === undefined) break
        const view = viewFor(game, seat)
        if (!(await this.act(seat, chooseAction(view))) && !(await this.act(seat, fallbackAction(view)))) {
          throw new Error(`AI seat ${seat} has no acceptable action in ${phase.kind}`)
        }
        continue
      }
      break
    }
    // An alarm that fired early, or nothing due: make sure the next deadline still has one.
    await this.armAlarm()
  }

  /** AI seats claim a Jodhi they really hold as soon as their team wins a trick. */
  private async aiJodhi(events: GameEvent[]): Promise<void> {
    const won = events.find((e) => e.type === 'trickWon')
    if (!won || won.type !== 'trickWon') return
    const game = this.saved.game
    for (let seat = 0; seat < game.playerCount; seat++) {
      if (!isAiControlled(game, seat) || teamOf(seat) !== teamOf(won.seat)) continue
      const claim = chooseJodhi(viewFor(this.saved.game, seat))
      if (claim) await this.act(seat, claim)
    }
  }

  /** Throws away an abandoned game. Versions keep rising so connected clients accept the new view. */
  private async reset(): Promise<void> {
    this.saved = { ...fresh(), version: this.saved.version + 1, eventCount: this.saved.eventCount }
    await this.room.storage.put(STORAGE_KEY, this.saved)
    for (const conn of this.room.getConnections<ConnState>()) this.send(conn, [])
  }

  private async armAlarm(): Promise<void> {
    const expiry = this.saved.emptySince === null ? null : this.saved.emptySince + ABANDONED_AFTER_MS
    const times = [nextDeadline(this.saved.game), expiry].filter((t): t is number => t !== null)
    const deadline = times.length > 0 ? Math.min(...times) : null
    if (deadline === null) await this.room.storage.deleteAlarm()
    else await this.room.storage.setAlarm(Math.max(deadline, this.deps.now() + 1))
  }

  // ── Connections ────────────────────────────────────────────────────────

  private seatOf(conn: Party.Connection<ConnState>): Seat | null {
    const token = conn.state?.token
    return token !== undefined && token in this.saved.tokens ? this.saved.tokens[token] : null
  }

  private send(conn: Party.Connection<ConnState>, events: NumberedEvent[]) {
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

  private sendTo(conn: Party.Connection<ConnState>, message: ServerMessage) {
    conn.send(JSON.stringify(message))
  }

  private broadcast(message: ServerMessage) {
    for (const conn of this.room.getConnections<ConnState>()) this.sendTo(conn, message)
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
