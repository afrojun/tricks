/**
 * The table every game shares: seats, the lobby, the host, stand-ins, and who
 * the game is waiting on. Each game's `Game` extends `TableState` and each
 * game's view extends `TableView`; the game calls these functions from its
 * own `apply`.
 */
import { z } from 'zod'
import { PERSONAS, type Persona } from './mind'

/** Seats are numbered in play order; `nextSeat` is always the next number. */
export type Seat = number

/** Who is acting: a seated player, an unseated connection, or the server. */
export type Actor = Seat | null | 'system'

export interface Ctx {
  now: number
  rng: () => number
}

export interface SeatInfo {
  name: string
  kind: 'empty' | 'human' | 'ai'
  connected: boolean
  /** A human seat temporarily played by the computer. */
  standIn: boolean
  /** Only matters for computer seats; human and empty seats carry 'straight'. */
  persona: Persona
  /** Chosen by "Surprise me": kept out of views until the game is over. */
  personaHidden: boolean
}

/** A seat as a view shows it: a hidden persona is null. */
export type ViewSeat = Omit<SeatInfo, 'persona'> & { persona: Persona | null }

/** A seat the table is waiting on with no deadline, and since when. */
export interface Waiting {
  seat: Seat
  since: number
}

export interface TableState {
  formatVersion: number
  playerCount: number
  seats: SeatInfo[]
  host: Seat | null
  /** Seats the table is waiting on with no deadline, and since when each has been waited on. */
  waiting: Waiting[]
  /** When the next AI-controlled seat should act, if any needs to. */
  aiActAt: number | null
  /** Hidden: seeds the computer players' chance rolls for this round. Never in a view. */
  aiSalt: number
  /** 'lobby' is every game's first phase, 'gameOver' its last. */
  phase: { kind: string }
}

export interface TableView {
  /** The viewer's seat; null for a spectator. */
  seat: Seat | null
  seats: ViewSeat[]
  /** Who may use the host's powers now: the owner, or a stand-in while they are away. */
  host: Seat | null
  /** The seat the host role belongs to. */
  owner: Seat | null
  playerCount: number
  waiting: Waiting[]
  phase: { kind: string }
}

/** Actions every game has. `tick` and `setConnected` come only from the system. */
export type TableAction =
  | { type: 'sit'; seat: Seat; name: string }
  | { type: 'leaveSeat' }
  | { type: 'rename'; name: string }
  | { type: 'addAi'; seat: Seat; persona?: Persona | 'surprise' }
  | { type: 'clearSeat'; seat: Seat }
  | { type: 'setPlayerCount'; playerCount: number }
  | { type: 'start' }
  | { type: 'replaceWithAi'; seat: Seat }
  | { type: 'reclaimSeat' }
  | { type: 'tick' }
  | { type: 'setConnected'; seat: Seat; connected: boolean }

export type TableReject =
  | 'notAllowed'
  | 'wrongPhase'
  | 'notHost'
  | 'seatTaken'
  | 'alreadySeated'
  | 'notSeated'
  | 'badName'
  | 'badSeat'
  | 'seatsNotFilled'
  | 'badChoice'

export type TableEvent = { type: 'seatChanged' }

const TABLE_ACTIONS: readonly string[] = [
  'sit',
  'leaveSeat',
  'rename',
  'addAi',
  'clearSeat',
  'setPlayerCount',
  'start',
  'replaceWithAi',
  'reclaimSeat',
  'tick',
  'setConnected',
] satisfies TableAction['type'][]

/**
 * Whether a value has an action's envelope: an object with a string `type`.
 * A game checks this before reading anything else, so `apply` refuses rather
 * than throws whatever a client sends.
 */
export function isAction(value: unknown): value is { type: string } {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string'
}

export function isTableAction(action: unknown): action is TableAction {
  return isAction(action) && TABLE_ACTIONS.includes(action.type)
}

/**
 * Whether an actor can be at this table: the system, a spectator, or one of its seats. A game
 * refuses any other before reading a seat, so `apply` never throws on, say, seat 2 of two.
 */
export function isActor(game: Pick<TableState, 'playerCount'>, actor: unknown): actor is Actor {
  return actor === 'system' || actor === null || (Number.isInteger(actor) && (actor as number) >= 0 && (actor as number) < game.playerCount)
}

// ── Seats ────────────────────────────────────────────────────────────────

export const MAX_NAME_LENGTH = 16
const AI_NAMES = ['Bot Asha', 'Bot Bheki', 'Bot Chan', 'Bot Devi']

export const EMPTY_SEAT: SeatInfo = { name: '', kind: 'empty', connected: false, standIn: false, persona: 'straight', personaHidden: false }

export function emptySeats(playerCount: number): SeatInfo[] {
  return allSeats(playerCount).map(() => ({ ...EMPTY_SEAT }))
}

export function allSeats(playerCount: number): Seat[] {
  return Array.from({ length: playerCount }, (_, i) => i)
}

/** Seats in play order starting from `first`. */
export function seatsFrom(first: Seat, playerCount: number): Seat[] {
  return allSeats(playerCount).map((i) => (first + i) % playerCount)
}

/** The seat that plays after `seat`. Which side of the viewer it sits on is the screen's business. */
export function nextSeat(seat: Seat, playerCount: number): Seat {
  return (seat + 1) % playerCount
}

export function isAiControlled(game: Pick<TableState, 'seats'>, seat: Seat): boolean {
  const info = game.seats[seat]
  return info.kind === 'ai' || info.standIn
}

/** Trims, collapses whitespace and caps the length; null if nothing is left. */
export function cleanName(raw: string): string | null {
  if (typeof raw !== 'string') return null
  const name = [...raw.replace(/\s+/g, ' ').trim()].slice(0, MAX_NAME_LENGTH).join('').trim()
  return name.length > 0 ? name : null
}

// ── The host ─────────────────────────────────────────────────────────────

/** Gives the host role a new owner only when its seat is no longer a human's. */
export function fixHost(game: TableState): void {
  const isHuman = (s: Seat) => game.seats[s]?.kind === 'human'
  if (game.host !== null && isHuman(game.host)) return
  const from = game.host === null ? 0 : (game.host + 1) % game.playerCount
  const order = seatsFrom(from, game.playerCount)
  game.host = order.find((s) => isHuman(s) && game.seats[s].connected) ?? order.find(isHuman) ?? null
}

/**
 * Who may use the host's powers right now: the host, or while they are
 * disconnected the next connected human. The role returns when they do.
 */
export function actingHost(game: Pick<TableState, 'host' | 'seats' | 'playerCount'>): Seat | null {
  if (game.host === null) return null
  const present = (s: Seat) => game.seats[s].kind === 'human' && game.seats[s].connected && !game.seats[s].standIn
  if (present(game.host)) return game.host
  return seatsFrom(game.host, game.playerCount).find(present) ?? game.host
}

/** The check for a host-only lobby action a game handles itself, such as `setRules`. */
export function checkLobbyHost(game: TableState, actor: Actor): TableReject | null {
  if (game.phase.kind !== 'lobby') return 'wrongPhase'
  if (typeof actor !== 'number') return 'notSeated'
  return actingHost(game) === actor ? null : 'notHost'
}

/** For a rematch: a surprise persona revealed at game over stays revealed. */
export function revealPersonas(game: TableState): void {
  for (const s of game.seats) s.personaHidden = false
}

// ── Table actions ────────────────────────────────────────────────────────

/**
 * Handles a table action. For `start` it only validates; the game then deals.
 * For `tick` it only checks that the system sent it; the game then resolves
 * its deadlines.
 */
export function tableAction(
  game: TableState,
  actor: Actor,
  action: TableAction,
  ctx: Ctx,
  events: { push(event: TableEvent): unknown },
  options: { seatCounts: readonly number[] },
): TableReject | null {
  if (action.type === 'tick' || action.type === 'setConnected') {
    if (actor !== 'system') return 'notAllowed'
    if (action.type === 'setConnected') {
      const seat = game.seats[action.seat]
      if (!seat || seat.kind !== 'human') return 'badSeat'
      seat.connected = action.connected
      fixHost(game)
      events.push({ type: 'seatChanged' })
    }
    return null
  }
  if (actor === 'system') return 'notAllowed'

  if (action.type === 'replaceWithAi' || action.type === 'reclaimSeat') {
    if (actor === null) return 'notSeated'
    return action.type === 'replaceWithAi' ? replaceWithAi(game, actor, action.seat, ctx, events) : reclaimSeat(game, actor, events)
  }
  return lobbyAction(game, actor, action, ctx, events, options)
}

type LobbyAction = Exclude<TableAction, { type: 'tick' | 'setConnected' | 'replaceWithAi' | 'reclaimSeat' }>

function lobbyAction(
  game: TableState,
  actor: Seat | null,
  action: LobbyAction,
  ctx: Ctx,
  events: { push(event: TableEvent): unknown },
  options: { seatCounts: readonly number[] },
): TableReject | null {
  const validSeat = (s: Seat) => Number.isInteger(s) && s >= 0 && s < game.playerCount

  if (action.type === 'rename') {
    if (actor === null) return 'notSeated'
    const name = cleanName(action.name)
    if (name === null) return 'badName'
    game.seats[actor].name = name
    events.push({ type: 'seatChanged' })
    return null
  }

  if (game.phase.kind !== 'lobby') return 'wrongPhase'

  if (action.type === 'sit') {
    if (actor !== null) return 'alreadySeated'
    if (!validSeat(action.seat)) return 'badSeat'
    if (game.seats[action.seat].kind !== 'empty') return 'seatTaken'
    const name = cleanName(action.name)
    if (name === null) return 'badName'
    game.seats[action.seat] = { ...EMPTY_SEAT, name, kind: 'human', connected: true }
    fixHost(game)
    events.push({ type: 'seatChanged' })
    return null
  }

  if (actor === null) return 'notSeated'

  if (action.type === 'leaveSeat') {
    game.seats[actor] = { ...EMPTY_SEAT }
    if (game.host === actor) game.host = null
    fixHost(game)
    events.push({ type: 'seatChanged' })
    return null
  }

  if (actingHost(game) !== actor) return 'notHost'

  switch (action.type) {
    case 'addAi': {
      if (!validSeat(action.seat)) return 'badSeat'
      if (game.seats[action.seat].kind !== 'empty') return 'seatTaken'
      const used = new Set(game.seats.map((s) => s.name))
      const name = AI_NAMES.find((n) => !used.has(n)) ?? `Bot ${action.seat + 1}`
      const surprise = action.persona === 'surprise'
      const persona = action.persona === 'surprise' ? PERSONAS[Math.floor(ctx.rng() * PERSONAS.length)] : (action.persona ?? 'straight')
      game.seats[action.seat] = { name, kind: 'ai', connected: true, standIn: false, persona, personaHidden: surprise }
      break
    }
    case 'clearSeat': {
      if (!validSeat(action.seat) || action.seat === actor) return 'badSeat'
      game.seats[action.seat] = { ...EMPTY_SEAT }
      break
    }
    case 'setPlayerCount': {
      const count = action.playerCount
      if (!options.seatCounts.includes(count)) return 'badChoice'
      if (count === game.playerCount) break
      if (count < game.playerCount) {
        if (game.seats.slice(count).some((s) => s.kind !== 'empty')) return 'seatTaken'
        game.seats = game.seats.slice(0, count)
      } else {
        game.seats = [...game.seats, ...emptySeats(count - game.playerCount)]
      }
      game.playerCount = count
      break
    }
    case 'start':
      if (game.seats.some((s) => s.kind === 'empty')) return 'seatsNotFilled'
      break
  }
  events.push({ type: 'seatChanged' })
  return null
}

function replaceWithAi(game: TableState, actor: Seat, seat: Seat, ctx: Ctx, events: { push(event: TableEvent): unknown }): TableReject | null {
  if (game.phase.kind === 'lobby' || game.phase.kind === 'gameOver') return 'wrongPhase'
  const target = game.seats[seat]
  if (!target || target.kind !== 'human' || target.standIn || seat === actor) return 'badSeat'
  const view = { ...tableView(game, actor), phase: { kind: game.phase.kind } }
  if (!replaceableSeats(view, ctx.now).includes(seat)) return view.host === actor ? 'notAllowed' : 'notHost'
  target.standIn = true
  events.push({ type: 'seatChanged' })
  return null
}

function reclaimSeat(game: TableState, actor: Seat, events: { push(event: TableEvent): unknown }): TableReject | null {
  if (!game.seats[actor].standIn) return 'notAllowed'
  game.seats[actor].standIn = false
  events.push({ type: 'seatChanged' })
  return null
}

// ── After every action ───────────────────────────────────────────────────

const AI_DELAY_MIN_MS = 600
const AI_DELAY_SPREAD_MS = 600

/**
 * After every applied action: recomputes who the table is waiting on and when
 * the next computer seat acts. `toAct` are the seats with something to decide;
 * `untimed` those of them the table waits on with no deadline.
 */
export function settle(game: TableState, ctx: Ctx, toAct: readonly Seat[], untimed: readonly Seat[]): void {
  game.waiting = untimed.map((seat) => ({ seat, since: game.waiting.find((w) => w.seat === seat)?.since ?? ctx.now }))

  const aiNeeded = toAct.some((s) => isAiControlled(game, s))
  if (!aiNeeded) game.aiActAt = null
  else if (game.aiActAt === null || game.aiActAt <= ctx.now) {
    game.aiActAt = ctx.now + AI_DELAY_MIN_MS + Math.floor(ctx.rng() * AI_DELAY_SPREAD_MS)
  }
}

// ── Views ────────────────────────────────────────────────────────────────

/** The table's part of what one seat (or a spectator, `null`) may know. */
export function tableView(game: TableState, seat: Seat | null): Omit<TableView, 'phase'> {
  return {
    seat,
    seats: game.seats.map((s) => (s.personaHidden && game.phase.kind !== 'gameOver' ? { ...s, persona: null } : s)),
    host: actingHost(game),
    owner: game.host,
    playerCount: game.playerCount,
    waiting: game.waiting,
  }
}

/** For the lobby screen; the engine checks the same conditions. */
export function canStart(view: TableView): boolean {
  return view.phase.kind === 'lobby' && view.host === view.seat && view.seats.every((s) => s.kind !== 'empty')
}

/** Human seats may be handed to the computer once disconnected, or waited on for over a minute. */
export const STALL_MS = 60_000

export function replaceableSeats(view: TableView, now: number): Seat[] {
  if (view.seat === null || view.seats[view.seat].kind !== 'human') return []
  if (view.phase.kind === 'lobby' || view.phase.kind === 'gameOver') return []
  const isHost = view.host === view.seat
  return view.seats.flatMap((s, seat) => {
    if (s.kind !== 'human' || s.standIn || seat === view.seat) return []
    const waited = view.waiting.find((w) => w.seat === seat)
    const stalled = waited !== undefined && now - waited.since > STALL_MS
    // The host looks after everyone else; anyone may step in for a host who has stalled.
    const mayReplace = isHost ? !s.connected || stalled : seat === view.owner && stalled
    return mayReplace ? [seat] : []
  })
}

// ── Wire schemas ─────────────────────────────────────────────────────────

/**
 * The table actions a client may send, for a game's action schema. System actions are absent.
 * With `bounded: false` only each field's type is checked: what an engine checks before it reads
 * a field, leaving seats, names and counts to `tableAction`, which refuses them with its own reasons.
 */
export function tableActionSchemas(seatCounts: readonly number[], { bounded = true } = {}) {
  const seat = bounded ? z.number().int().min(0).max(Math.max(...seatCounts) - 1) : z.number()
  const name = bounded ? z.string().max(200) : z.string()
  const playerCount = bounded ? z.number().int().refine((n) => seatCounts.includes(n)) : z.number()
  return [
    z.object({ type: z.literal('sit'), seat, name }),
    z.object({ type: z.literal('leaveSeat') }),
    z.object({ type: z.literal('rename'), name }),
    z.object({ type: z.literal('addAi'), seat, persona: z.enum([...PERSONAS, 'surprise']).optional() }),
    z.object({ type: z.literal('clearSeat'), seat }),
    z.object({ type: z.literal('setPlayerCount'), playerCount }),
    z.object({ type: z.literal('start') }),
    z.object({ type: z.literal('replaceWithAi'), seat }),
    z.object({ type: z.literal('reclaimSeat') }),
  ] as const
}
