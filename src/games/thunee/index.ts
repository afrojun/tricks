/** Thunee as a game module: what the room, practice and tests need. Its engine is `./engine/`, its computer players `./ai/`. */
import { dueStep, reactions } from './ai/drive'
import type { GameModule } from '../../kit/module'
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

export const thunee: GameModule<Game, Action, GameEvent, View> = {
  id: 'thunee',
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
