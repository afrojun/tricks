/** A game's practice as the shell opens it, whatever the game's own types for its state, notes and deals. */
import type { TableState, TableView } from '../kit/table'
import type { GamePractice, Note } from './contract'
import { PracticeGame, practiceKey } from './game'
import { type PracticeOptions, type PracticeSession, openPracticeSession, passedDrills } from './session'

/** A drill as the list of drills shows it. */
export interface DrillInfo {
  id: string
  title: string
  summary: string
}

export interface PracticeClient<V, A, E> {
  /** A new game with `playerCount` players, the saved one when it is null, or a drill. */
  open(options: PracticeOptions): PracticeSession<V, A, E, Note, unknown>
  /** Whether this device holds a practice game of this game to continue. */
  saved(storage?: Pick<Storage, 'getItem'>): boolean
  drills: readonly DrillInfo[]
  /** The ids of the drills passed on this device. */
  passed(storage?: Pick<Storage, 'getItem'>): Set<string>
}

export function practiceClient<G extends TableState, A extends { type: string }, E, V extends TableView, N extends Note, D, S>(
  practice: GamePractice<G, A, E, V, N, D, S>,
  /** How long one of the game's events holds the screen. */
  dwell: (event: E) => number,
): PracticeClient<V, A, E> {
  return {
    open: (options) => openPracticeSession(practice, dwell, options),
    saved: (storage = localStorage) => PracticeGame.load(practice, storage.getItem(practiceKey(practice.module.id))) !== null,
    drills: practice.drills.map(({ id, title, summary }) => ({ id, title, summary })),
    passed: (storage = localStorage) => passedDrills(practice.module.id, storage),
  }
}
