/** Messages exchanged between the client and a room. */
import { z } from 'zod'
import { type Action, type GameEvent, type RejectReason, type Seat, type View, actionSchema } from './engine'

/** The games a room can hold. */
export const GAME_IDS = ['thunee'] as const
export type GameId = (typeof GAME_IDS)[number]

/** A room is named `<game>-<CODE>`, so which game it holds is never stored separately. */
export function roomName(game: GameId, code: string): string {
  return `${game}-${code}`
}

const ROOM_NAME = new RegExp(`^(${GAME_IDS.join('|')})-[A-Z]{6}$`)
export function isRoomName(name: string): boolean {
  return ROOM_NAME.test(name)
}

/** The close code for a socket opened to a name that is not a game and a code. */
export const UNKNOWN_ROOM_CLOSE_CODE = 4404

export type ClientMessage = { action: Action }
export const clientMessageSchema = z.object({ action: actionSchema })

export type NumberedEvent = GameEvent & { n: number }

export type ServerMessage =
  | {
      type: 'sync'
      /** Increases by one for every applied action. */
      version: number
      /** Server clock when this was sent, for countdowns. */
      now: number
      seat: Seat | null
      view: View
      events: NumberedEvent[]
    }
  | { type: 'rejected'; reason: RejectReason | 'malformed' }
  | { type: 'error'; message: string }

/** The connection query parameter carrying the device's secret token. */
export const TOKEN_PARAM = 'token'
export const MIN_TOKEN_LENGTH = 16
export const MAX_TOKEN_LENGTH = 64

/** Heartbeat frames, sent as bare strings outside the JSON protocol. */
export const PING = 'ping'
export const PONG = 'pong'
