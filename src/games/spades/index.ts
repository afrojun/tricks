/** Spades as a game module: what the room, practice and tests need. */
import type { GameModule } from '../../kit/module'
import { dueStep, reactions } from './ai/drive'
import {
  type Action,
  FORMAT_VERSION,
  type Game,
  type GameEvent,
  SEAT_COUNTS,
  type View,
  actionSchema,
  apply,
  checkInvariants,
  createGame,
  nextDeadline,
  seatsToAct,
  step,
  viewFor,
} from './engine'

export const spades: GameModule<Game, Action, GameEvent, View> = {
  id: 'spades',
  formatVersion: FORMAT_VERSION,
  seatCounts: SEAT_COUNTS,
  createGame,
  apply,
  step,
  viewFor,
  seatsToAct,
  nextDeadline,
  checkInvariants,
  actionSchema,
  dueStep,
  reactions,
}

export * from './engine'
