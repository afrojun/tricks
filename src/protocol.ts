/** Messages exchanged between the client and the PartyKit room. */
import { z } from 'zod'
import { type Action, type GameEvent, type RejectReason, type Seat, type View, actionSchema } from './engine'

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
