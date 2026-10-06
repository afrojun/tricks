/**
 * What a game supplies for practice: how its table is set up, what the player must continue
 * past, what a round keeps for the review, and its coach. Practice knows a game only through this.
 */
import type { Card } from '../kit/cards'
import type { GameModule } from '../kit/module'
import type { Seat, TableState, TableView } from '../kit/table'

/** Everything the coach says. Its topics and the warnings it gives are the game's own. */
export interface Note {
  tone: 'info' | 'suggest' | 'warn'
  title: string
  body: string
  /** Cards to highlight in the hand or on the table. */
  cards?: readonly Card[]
  seats?: readonly number[]
  topic?: string
  /** The warning given. `illegal` is a rule-breaking card, which the hand confirms before it is sent. */
  rule?: string
}

/** One decision the player made, with what the coach advised at that moment. */
export interface DecisionRecord<V, A> {
  /** The player's full view just before deciding. */
  view: V
  advised: A | null
  taken: A
}

/** What a practice round keeps for the review. */
export interface RoundLog<V, A, D> {
  /** Every deal of the round so far, each as it was dealt: Thunee deals twice, six cards each half. */
  dealt: D[]
  decisions: DecisionRecord<V, A>[]
}

/** A topic the coach may open, by the game's own id. */
export type TopicOf<N extends Note> = NonNullable<N['topic']>

/**
 * The coach, as practice calls it. Every function is given the player's own view with full
 * memory, never the game; only the review sees the dealt hands, after the round.
 */
export interface GameCoach<V, A, E, N extends Note, D, S> {
  /** What the player is looking at, in a line. */
  situation(view: V): N | null
  /** The suggested move for the player's decision; null when they have nothing to decide. */
  advise(view: V): { note: N; action: A } | null
  /** A warning for the action the player is about to take. Null for the advised action. */
  check(view: V, action: A): N | null
  narrate(event: E, view: V): N | null
  /** The topics this moment teaches; `event` is null for the moment as it stands. */
  topicsFor(view: V, event: E | null): TopicOf<N>[]
  review(input: { decisions: readonly DecisionRecord<V, A>[]; summary: S; dealt: D[]; you: Seat; view: V }): N[]
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
