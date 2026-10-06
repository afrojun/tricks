/** A game's practice as the shell opens it, whatever the game's own types for its state, notes and deals. */
import type { TableState, TableView } from '../kit/table'
import type { GamePractice, Note } from './contract'
import { PracticeGame, practiceKey } from './game'
import { type PracticeOptions, type PracticeSession, openPracticeSession } from './session'

export interface PracticeClient<V, A, E> {
  /** A new game with `playerCount` players, or the saved one when it is null. */
  open(options: PracticeOptions): PracticeSession<V, A, E, Note, unknown>
  /** Whether this device holds a practice game of this game to continue. */
  saved(storage?: Pick<Storage, 'getItem'>): boolean
}

export function practiceClient<G extends TableState, A extends { type: string }, E, V extends TableView, N extends Note, D, S>(
  practice: GamePractice<G, A, E, V, N, D, S>,
  /** How long one of the game's events holds the screen. */
  dwell: (event: E) => number,
): PracticeClient<V, A, E> {
  return {
    open: (options) => openPracticeSession(practice, dwell, options),
    saved: (storage = localStorage) => PracticeGame.load(practice, storage.getItem(practiceKey(practice.module.id))) !== null,
  }
}
