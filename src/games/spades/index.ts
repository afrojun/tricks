/** Spades as a game module: what the room, practice and tests need. */
import { type GameModule, recapOnly } from '../../kit/module'
import { banter } from './ai/banter'
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
  name: 'Spades',
  recapOf: (event) => {
    // Under "Call plus three" play goes on after a challenge: the card challenged is in a trick the view hides.
    if (event.type === 'challengeResolved') return { type: event.type, challenger: event.challenger, accused: event.accused, guilty: event.guilty }
    return recapOnly<GameEvent>(['called', 'nilBroken', 'contractMade', 'roundScored', 'gameOver'])(event)
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
