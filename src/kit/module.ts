/** The contract between a game and everything that hosts it: the room, practice and tests. Pure. */
import type { z } from 'zod'
import type { Actor, Ctx, Seat, TableState, TableView } from './table'

/**
 * How much of the round's play a view carries.
 * - `table`: what someone at the table can still see or picture: the current
 *   trick, the last completed one, and who won each earlier trick.
 * - `full`: every card played. Only for computer players, which run on the
 *   server and stand in for a player who remembers the whole round.
 */
export type Memory = 'table' | 'full'

/** Something to apply without a person acting. */
export interface Step<A> {
  actor: Actor
  action: A
  /** Tried if `action` is rejected. */
  fallback?: A
}

/** One question put to a computer seat, asked of the game as it stands when its turn comes. */
export type Ask<G, A> = (game: G) => Step<A> | null

export interface GameModule<G extends TableState, A, E, V extends TableView> {
  /** 'thunee', 'hearts': also the path and the room-name prefix. */
  id: string
  formatVersion: number
  /** [2, 4] for Thunee, [4] for Hearts. */
  seatCounts: readonly number[]
  createGame(): G
  /** The only way a game changes. Never mutates `game`; never throws on player input. */
  apply(game: G, actor: Actor, action: A, ctx: Ctx): { game: G; events: E[] } | { rejected: string }
  viewFor(game: G, seat: Seat | null, memory?: Memory): V
  seatsToAct(game: G): Seat[]
  /** The earliest moment the host must wake up for, if any. */
  nextDeadline(game: G): number | null
  /** Throws if the game is in a state the engine should never produce. */
  checkInvariants(game: G): void
  /** What a client may send. System actions are absent. */
  actionSchema: z.ZodType<A>
  /** A passed deadline, or a computer turn whose time has come. */
  dueStep(game: G, now: number): Step<A> | null
  /** Questions to put to computer seats after an applied action. The host applies each answer before asking the next. */
  reactions(game: G, events: readonly E[]): Ask<G, A>[]
}
