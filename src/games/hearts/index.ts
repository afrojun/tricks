/** Hearts as a game module: what the room, practice and tests need. */
import { type GameModule, recapOnly } from '../../kit/module'
import { banter } from './ai/banter'
import { dueStep, reactions } from './ai/drive'
import { step } from './engine/apply'
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
  name: 'Hearts',
  recapOf: (event) => {
    // Who took a trick, and whether the queen of spades was in it, but not its points: with the jack of
    // diamonds those would tell which trick, face down by now, held her or the jack.
    if (event.type === 'trickWon') return { type: event.type, seat: event.seat, queen: event.queen }
    // A challenge ends the round, so the cards a round's summary names are past play.
    return recapOnly<GameEvent>(['heartsBroken', 'challengeResolved', 'roundScored', 'gameOver'])(event)
  },
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
  banter,
}

export * from './engine'
