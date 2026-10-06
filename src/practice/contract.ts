/**
 * What a game supplies for practice: how its table is set up, what the player must continue
 * past, what a round keeps for the review, and its coach. Practice knows a game only through this.
 */
import type { DecisionRecord, GameCoach, Note, TopicOf } from '../kit/coach'
import type { GameModule } from '../kit/module'
import type { TableState, TableView } from '../kit/table'

/** The coach's contract is the kit's, so a coach stays pure and the kit can build one. */
export type { DecisionRecord, GameCoach, Note, TopicOf }

/** What a practice round keeps for the review. */
export interface RoundLog<V, A, D> {
  /** Every deal of the round so far, each as it was dealt: Thunee deals twice, six cards each half. */
  dealt: D[]
  decisions: DecisionRecord<V, A>[]
}

export interface GamePractice<G extends TableState, A extends { type: string }, E, V extends TableView, N extends Note, D, S> {
  module: GameModule<G, A, E, V>
  /** The computer seats' names, by where they sit as seen from the player at seat 0: the first is seat 1's. */
  seatNames(playerCount: number): string[]
  /** The host's lobby actions between sitting down at seat 0 and the start: the table's size, the computers, the rules. */
  setup(playerCount: number): A[]
  /** Identifies a pause the player must continue past, so continuing it is remembered across a reload; null when none. */
  pauseId(game: G): string | null
  /** Whether an action of the player's is a decision the review should weigh. */
  isDecision(action: A): boolean
  /** Whether these events begin a round, which starts a new round log. */
  roundBegins(events: readonly E[]): boolean
  /** The deal in play, as dealt, and its place among the round's deals; null between deals. */
  dealInPlay(game: G): { index: number; hands: D } | null
  /** The event that opened the game, while it is in its first round: a new game is narrated and taught from it. */
  opening(game: G): E | null
  /** The summary of the round whose result the view shows; null while a round is in play. */
  summary(view: V): S | null
  coach: GameCoach<V, A, E, N, D, S>
}
