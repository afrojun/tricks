/** Hearts as a game module: what the room, practice and tests need. */
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
  viewFor,
} from './engine'

export const hearts: GameModule<Game, Action, GameEvent, View> = {
  id: 'hearts',
  formatVersion: FORMAT_VERSION,
  seatCounts: SEAT_COUNTS,
  createGame,
  apply,
  viewFor,
  seatsToAct,
  nextDeadline,
  checkInvariants,
  actionSchema,
  dueStep,
  reactions,
}

export * from './engine'
