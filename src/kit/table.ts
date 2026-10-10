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

/** How the table plays: everyone at once, or each in their own time, over hours or days. */
export type Pace = 'live' | 'async'

/**
 * How the table is run, which is not a rule of the game: no rule book, preset or share link holds
 * it, it is not frozen at the start, and the host may change it at any time. A change applies from
 * the next wait that starts.
 */
export interface TableSettings {
  pace: Pace
  /**
   * The seconds each of the game's timed windows stays open, by the window's id; null for none, when
   * the table waits for everyone. Only while the pace is live.
   */
  timers: Readonly<Record<string, number>> | null
}

/** One of a game's timed windows, such as Thunee's calling: its seconds by default, and the range a host may set. */
export interface TimerSpec {
  default: number
  min: number
  max: number
}

/** Every game's start: the table plays at once and waits for everyone. */
export const LIVE: TableSettings = { pace: 'live', timers: null }

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
  settings: TableSettings
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
  settings: TableSettings
  waiting: Waiting[]
  phase: { kind: string }
}

/** Actions every game has. `tick`, `setConnected` and `standIn` come only from the system. */
export type TableAction =
  | { type: 'sit'; seat: Seat; name: string }
  | { type: 'leaveSeat' }
  | { type: 'rename'; name: string }
  | { type: 'addAi'; seat: Seat; persona?: Persona | 'surprise' }
  | { type: 'setPersona'; seat: Seat; persona: Persona | 'surprise' }
  | { type: 'clearSeat'; seat: Seat }
  | { type: 'setPlayerCount'; playerCount: number }
  | { type: 'start' }
  | { type: 'replaceWithAi'; seat: Seat }
  | { type: 'reclaimSeat' }
  | { type: 'setSettings'; settings: TableSettings }
  | { type: 'tick' }
  | { type: 'setConnected'; seat: Seat; connected: boolean }
  | { type: 'standIn'; seat: Seat }

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

/** Something changed at the table; or the host changed its pace, which the frame tells everyone. */
export type TableEvent = { type: 'seatChanged' } | { type: 'paceChanged'; seat: Seat; pace: Pace }

const TABLE_ACTIONS: readonly string[] = [
  'sit',
  'leaveSeat',
  'rename',
  'addAi',
  'setPersona',
  'clearSeat',
  'setPlayerCount',
  'start',
  'replaceWithAi',
  'reclaimSeat',
  'setSettings',
  'tick',
  'setConnected',
  'standIn',
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

const SYSTEM_ACTIONS: readonly string[] = ['tick', 'setConnected', 'standIn'] satisfies TableAction['type'][]

/**
 * What a game checks before reading any field: an action, by an actor who can be at this table, of the
 * game's shape. Only the system sends `tick`, `setConnected` and `standIn`, which are not parsed. `apply` checks this
 * before it copies the game, so a malformed message costs no copy.
 */
export function screen<A>(
  game: Pick<TableState, 'playerCount'>,
  actor: unknown,
  action: unknown,
  shape: z.ZodType<A>,
): { action: A } | { rejected: 'notAllowed' | 'notSeated' } {
  if (!isAction(action)) return { rejected: 'notAllowed' }
  if (!isActor(game, actor)) return { rejected: 'notSeated' }
  if (SYSTEM_ACTIONS.includes(action.type)) return { action: action as A }
  const shaped = shape.safeParse(action)
  return shaped.success ? { action: shaped.data } : { rejected: 'notAllowed' }
}

// ── Seats ────────────────────────────────────────────────────────────────

export const MAX_NAME_LENGTH = 16
/** A computer's name, a person's name: the seat's tag, not the name, says it is a computer. `addAi` draws one nobody at the table has. */
export const AI_NAMES: readonly string[] = [
  'Asha', 'Bheki', 'Chan', 'Devi', 'Fatima', 'Gugu', 'Hema', 'Jabu', 'Kiran', 'Lindiwe', 'Mohan', 'Naledi',
  'Priya', 'Rajesh', 'Sipho', 'Thandi', 'Vikram', 'Yusuf', 'Zanele', 'Anil', 'Busi', 'Dineo', 'Farouk', 'Kesh',
]

export const EMPTY_SEAT: SeatInfo = { name: '', kind: 'empty', connected: false, standIn: false, persona: 'straight', personaHidden: false }

export function emptySeats(playerCount: number): SeatInfo[] {
  return allSeats(playerCount).map(() => ({ ...EMPTY_SEAT }))
}

/** Seats 0 to `playerCount - 1`, by a plain loop: `Array.from` with a function costs ten times as much, on every action. */
export function allSeats(playerCount: number): Seat[] {
  const seats: Seat[] = []
  for (let seat = 0; seat < playerCount; seat++) seats.push(seat)
  return seats
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

/** At game over, who must say Again before the next game starts: every person at the table and not away. */
export function againElectorate(game: Pick<TableState, 'seats'>): Seat[] {
  return game.seats.flatMap((s, seat) => (s.kind === 'human' && s.connected && !s.standIn ? [seat] : []))
}

/** Whether everyone who must say Again has: never for an empty table, which nobody is watching. */
export function againComplete(game: Pick<TableState, 'seats'>, again: readonly Seat[]): boolean {
  const electorate = againElectorate(game)
  return electorate.length > 0 && electorate.every((seat) => again.includes(seat))
}

/**
 * What a name may not hold: controls, the marks that reorder the text around them, and the
 * characters that show nothing (Unicode's default ignorables, and the blank braille cell). The
 * joiners, variation selectors and tags stay, for emoji and for scripts that need them.
 */
const UNSEEN = /(?![\u200C\u200D\uFE00-\uFE0F\u{E0020}-\u{E007F}])[\p{Cc}\p{Default_Ignorable_Code_Point}\u2800]/gu
/** Combining marks past the third on one letter, which pile a name up over the table. */
const STACKED = /(\p{M}{3})\p{M}+/gu
/** Something that shows: not a space, a mark, or one of the joiners kept above. */
const SHOWN = /[^\s\p{M}\p{Default_Ignorable_Code_Point}]/u

/** Trims, collapses whitespace, drops what does not show, and caps the length; null if nothing shows. */
export function cleanName(raw: string): string | null {
  if (typeof raw !== 'string') return null
  const shown = raw.replace(/\s+/g, ' ').replace(UNSEEN, '').replace(STACKED, '$1').trim()
  const name = [...shown].slice(0, MAX_NAME_LENGTH).join('').trim()
  return SHOWN.test(name) ? name : null
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

/** For a rematch: each surprise seat draws a new persona, hidden until that game is over too. */
export function redrawSurprises(game: TableState, ctx: Ctx): void {
  for (const s of game.seats) if (s.kind === 'ai' && s.personaHidden) Object.assign(s, personaOf('surprise', ctx))
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
  options: TableOptions,
): TableReject | null {
  if (action.type === 'tick' || action.type === 'setConnected' || action.type === 'standIn') {
    if (actor !== 'system') return 'notAllowed'
    if (action.type === 'setConnected') {
      const seat = game.seats[action.seat]
      if (!seat || seat.kind !== 'human') return 'badSeat'
      seat.connected = action.connected
      fixHost(game)
      events.push({ type: 'seatChanged' })
    }
    if (action.type === 'standIn') {
      if (standInDue(game, ctx.now) !== action.seat) return 'notAllowed'
      game.seats[action.seat].standIn = true
      events.push({ type: 'seatChanged' })
    }
    return null
  }
  if (actor === 'system') return 'notAllowed'

  if (action.type === 'replaceWithAi' || action.type === 'reclaimSeat' || action.type === 'setSettings') {
    if (actor === null) return 'notSeated'
    if (action.type === 'setSettings') return setSettings(game, actor, action.settings, events, options)
    return action.type === 'replaceWithAi' ? replaceWithAi(game, actor, action.seat, ctx, events) : reclaimSeat(game, actor, ctx, events)
  }
  return lobbyAction(game, actor, action, ctx, events, options)
}

/** What the table needs to know of the game: its table sizes, and its timed windows, if it has any. */
export interface TableOptions {
  seatCounts: readonly number[]
  timers?: Readonly<Record<string, TimerSpec>>
}

type LobbyAction = Exclude<TableAction, { type: 'tick' | 'setConnected' | 'standIn' | 'replaceWithAi' | 'reclaimSeat' | 'setSettings' }>

function lobbyAction(
  game: TableState,
  actor: Seat | null,
  action: LobbyAction,
  ctx: Ctx,
  events: { push(event: TableEvent): unknown },
  options: TableOptions,
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
      const unused = AI_NAMES.filter((n) => !used.has(n))
      const name = unused.length > 0 ? unused[Math.floor(ctx.rng() * unused.length)] : `Computer ${action.seat + 1}`
      game.seats[action.seat] = { name, kind: 'ai', connected: true, standIn: false, ...personaOf(action.persona ?? 'straight', ctx) }
      break
    }
    case 'setPersona': {
      if (!validSeat(action.seat) || game.seats[action.seat].kind !== 'ai') return 'badSeat'
      Object.assign(game.seats[action.seat], personaOf(action.persona, ctx))
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

/** "Surprise me" draws one of the four and hides it until the game is over. */
function personaOf(choice: Persona | 'surprise', ctx: Ctx): Pick<SeatInfo, 'persona' | 'personaHidden'> {
  if (choice !== 'surprise') return { persona: choice, personaHidden: false }
  return { persona: PERSONAS[Math.floor(ctx.rng() * PERSONAS.length)], personaHidden: true }
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

/**
 * The host sets how the table is run, in any phase. Timers must name exactly the game's windows,
 * each a whole number of seconds in its range; a game without windows has none.
 */
function setSettings(game: TableState, actor: Seat, settings: TableSettings, events: { push(event: TableEvent): unknown }, options: TableOptions): TableReject | null {
  if (actingHost(game) !== actor) return 'notHost'
  // Read with care: a game's wire schema checks only each field's type, and a toy's none.
  if (typeof settings !== 'object' || settings === null) return 'notAllowed'
  if (settings.pace !== 'live' && settings.pace !== 'async') return 'badChoice'
  const timers: unknown = settings.timers
  if (timers !== null && (typeof timers !== 'object' || timers === undefined || !validTimers(timers as Record<string, unknown>, options.timers ?? {}))) return 'badChoice'
  if (settings.pace !== game.settings.pace) events.push({ type: 'paceChanged', seat: actor, pace: settings.pace })
  else events.push({ type: 'seatChanged' })
  game.settings = { pace: settings.pace, timers: settings.timers === null ? null : { ...settings.timers } }
  return null
}

/** Whether `timers` names exactly the windows in `specs`, each a whole number of seconds in its range. */
export function validTimers(timers: Readonly<Record<string, unknown>>, specs: Readonly<Record<string, TimerSpec>>): boolean {
  const ids = Object.keys(specs)
  if (ids.length === 0 || Object.keys(timers).length !== ids.length) return false
  return ids.every((id) => {
    const seconds = Object.hasOwn(timers, id) ? timers[id] : undefined
    return typeof seconds === 'number' && Number.isInteger(seconds) && seconds >= specs[id].min && seconds <= specs[id].max
  })
}

/** Whether the table's timed windows close by themselves: timers are set, and the table plays together. */
export function timed(settings: TableSettings): boolean {
  return settings.pace === 'live' && settings.timers !== null
}

/** The seconds a timed window stays open, or null when the table waits for everyone: no timers, or over days. */
export function timerSeconds(settings: TableSettings, id: string): number | null {
  if (settings.pace !== 'live' || settings.timers === null) return null
  return settings.timers[id] ?? null
}

function reclaimSeat(game: TableState, actor: Seat, ctx: Ctx, events: { push(event: TableEvent): unknown }): TableReject | null {
  if (!game.seats[actor].standIn) return 'notAllowed'
  game.seats[actor].standIn = false
  // Their wait starts now: one that began before they sat back down is not theirs to have stalled.
  game.waiting = game.waiting.map((w) => (w.seat === actor ? { seat: actor, since: ctx.now } : w))
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
    settings: game.settings,
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
  // Over days everyone is away most of the time, and a slow turn is the day's limit's business.
  if (view.settings.pace === 'async') return []
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

/** Over days, how long the table waits on a person before the computer plays for them. */
export const TURN_LIMIT_MS = 2 * 24 * 60 * 60 * 1000

/**
 * The people whose turn has outlasted the limit over days, each with when it did, earliest first,
 * while someone else at the table still plays for themselves. Of the last person playing the table
 * waits for ever: a game nobody plays is never played out by the computer.
 */
function overdue(game: Pick<TableState, 'settings' | 'seats' | 'waiting'>): { seat: Seat; at: number }[] {
  if (game.settings.pace !== 'async') return []
  const playing = (seat: Seat) => game.seats[seat]?.kind === 'human' && !game.seats[seat].standIn
  const people = game.seats.filter((_, seat) => playing(seat)).length
  if (people < 2) return []
  return game.waiting.filter((w) => playing(w.seat)).map((w) => ({ seat: w.seat, at: w.since + TURN_LIMIT_MS })).sort((a, b) => a.at - b.at)
}

/** The seat the computer should now stand in for, as the table action `standIn` from the system, if any. */
export function standInDue(game: Pick<TableState, 'settings' | 'seats' | 'waiting'>, now: number): Seat | null {
  return overdue(game).find((o) => o.at <= now)?.seat ?? null
}

/** When the next stand-in falls due, for the host's alarm; null if none will. */
export function standInDeadline(game: Pick<TableState, 'settings' | 'seats' | 'waiting'>): number | null {
  return overdue(game)[0]?.at ?? null
}

// ── Wire schemas ─────────────────────────────────────────────────────────

/**
 * The table actions a client may send, for a game's action schema. System actions are absent.
 * With `bounded: false` only each field's type is checked: what an engine checks before it reads
 * a field, leaving seats, names and counts to `tableAction`, which refuses them with its own reasons.
 */
export function tableActionSchemas(seatCounts: readonly number[], { bounded = true, timers = {} as Readonly<Record<string, TimerSpec>> } = {}) {
  const seat = bounded ? z.number().int().min(0).max(Math.max(...seatCounts) - 1) : z.number()
  const name = bounded ? z.string().max(200) : z.string()
  const playerCount = bounded ? z.number().int().refine((n) => seatCounts.includes(n)) : z.number()
  const persona = z.enum([...PERSONAS, 'surprise'])
  // Each of the game's windows, by its id; a game without windows has no timers to set.
  const windows = Object.entries(timers)
  const seconds = z.object(Object.fromEntries(windows.map(([id, spec]) => [id, bounded ? z.number().int().min(spec.min).max(spec.max) : z.number()])))
  const settings = z.object({
    pace: z.enum(['live', 'async']),
    timers: windows.length > 0 ? z.union([z.literal(null), seconds]) : z.literal(null),
  })
  return [
    z.object({ type: z.literal('sit'), seat, name }),
    z.object({ type: z.literal('leaveSeat') }),
    z.object({ type: z.literal('rename'), name }),
    z.object({ type: z.literal('addAi'), seat, persona: persona.optional() }),
    z.object({ type: z.literal('setPersona'), seat, persona }),
    z.object({ type: z.literal('clearSeat'), seat }),
    z.object({ type: z.literal('setPlayerCount'), playerCount }),
    z.object({ type: z.literal('start') }),
    z.object({ type: z.literal('replaceWithAi'), seat }),
    z.object({ type: z.literal('reclaimSeat') }),
    z.object({ type: z.literal('setSettings'), settings }),
  ] as const
}
