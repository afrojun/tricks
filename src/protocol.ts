/** Messages exchanged between the client and a room. The envelope is every game's; the game supplies the view, action and event types. */
import { z } from 'zod'
import { type Said, type Say, saySchema } from './kit/talk'
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
/** The close code for a socket the room has no room for: too many watchers, or too many from one address. */
export const ROOM_FULL_CLOSE_CODE = 4429
/** The close code for a socket that sent more than the room will read. */
export const TOO_MANY_MESSAGES_CLOSE_CODE = 4430
/** The close code for a device's oldest socket to a room, closed when it opens one too many. */
export const REPLACED_CLOSE_CODE = 4409

/**
 * An action for the game; something said at the table; or a card lifted in the sender's hand, or put
 * back. The last two are not part of the game: the room relays them and never saves them.
 */
export type ClientMessage<A> = { action: A } | { say: Say } | { lift: boolean }

/** What a client may send to a room whose game admits `action`. */
export function clientMessageSchema<A>(action: z.ZodType<A>): z.ZodType<ClientMessage<A>> {
  return z.union([z.object({ action }), z.object({ say: saySchema }), z.object({ lift: z.boolean() })]) as z.ZodType<ClientMessage<A>>
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
      /** What the computers said about these events, shown with them. */
      said?: Said[]
    }
  /** Something a person said, or a computer's answer to a throw: shown at once, never held for a dwell. */
  | ({ type: 'said' } & Said)
  /** The game's own reason for refusing an action, or `malformed` for a message it could not read. */
  | { type: 'rejected'; reason: string }
  | { type: 'error'; message: string }
  /** A player at the table lifted a card in their hand (`up`), or put it back or played it. Never saved, never paced. */
  | { type: 'lift'; seat: Seat; up: boolean }

/** The connection query parameter carrying the device's secret token. */
export const TOKEN_PARAM = 'token'
export const MIN_TOKEN_LENGTH = 16
export const MAX_TOKEN_LENGTH = 64

/**
 * The connection query parameter asking a development room to run its clock this many times faster than real
 * time, for the browser scripts (`tricks-pace` in the page's storage). A deployed room ignores it.
 */
export const PACE_PARAM = 'pace'
/** The fastest a room or a practice table runs. */
export const MAX_PACE = 20

/** A pace read from text: a number from 1 to `MAX_PACE`, or 1 for anything else. */
export function paceOf(text: string | null): number {
  const pace = Number(text)
  return Number.isFinite(pace) && pace >= 1 ? Math.min(pace, MAX_PACE) : 1
}

/** Heartbeat frames, sent as bare strings outside the JSON protocol. */
export const PING = 'ping'
export const PONG = 'pong'
