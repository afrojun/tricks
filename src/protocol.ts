/** Messages exchanged between the client and a room. The envelope is every game's; the game supplies the view, action and event types. */
import { z } from 'zod'
import type { Seat } from './kit/table'

/** A room is named `<game>-<CODE>`, so which game it holds is never stored separately. */
export function roomName(game: string, code: string): string {
  return `${game}-${code}`
}

const NAME_SHAPE = /^([a-z]+)-([A-Z]{6})$/

/** A room name's game and code, by its shape alone: whether the game is known is the list of games' business. */
export function splitRoomName(name: string): { game: string; code: string } | null {
  const match = NAME_SHAPE.exec(name)
  return match ? { game: match[1], code: match[2] } : null
}

/** The close code for a socket opened to a name that is not a game and a code. */
export const UNKNOWN_ROOM_CLOSE_CODE = 4404

export type ClientMessage<A> = { action: A }

/** What a client may send to a room whose game admits `action`. */
export function clientMessageSchema<A>(action: z.ZodType<A>) {
  return z.object({ action })
}

export type NumberedEvent<E> = E & { n: number }

export type ServerMessage<V, E> =
  | {
      type: 'sync'
      /** Increases by one for every applied action. */
      version: number
      /** Server clock when this was sent, for countdowns. */
      now: number
      seat: Seat | null
      view: V
      events: NumberedEvent<E>[]
    }
  /** The game's own reason for refusing an action, or `malformed` for a message it could not read. */
  | { type: 'rejected'; reason: string }
  | { type: 'error'; message: string }

/** The connection query parameter carrying the device's secret token. */
export const TOKEN_PARAM = 'token'
export const MIN_TOKEN_LENGTH = 16
export const MAX_TOKEN_LENGTH = 64

/** Heartbeat frames, sent as bare strings outside the JSON protocol. */
export const PING = 'ping'
export const PONG = 'pong'
