/**
 * What a game supplies for practice: how its table is set up, what the player must continue
 * past, what a round keeps for the review, and its coach. Practice knows a game only through this.
 */
import type { DecisionRecord, GameCoach, Note, TopicOf } from '../kit/coach'
import type { GameModule } from '../kit/module'
import type { Actor, Ctx, TableState, TableView } from '../kit/table'

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
  /** One moment each, set up the same way every time, most basic first. */
  drills: readonly Drill<G, A, V, N>[]
}

/** Practice's own refusal: an action sent after a drill's verdict. */
export const DRILL_OVER = 'drillOver'

/** How a drill went, once its moment has passed. */
export interface Verdict<N extends Note> {
  passed: boolean
  note: N
}

/**
 * One moment of a game, to practise one rule: an arranged position, the coach's words for it, and
 * a verdict once it has passed. `guide` and `verdict` see only what the coach sees.
 */
export interface Drill<G, A, V, N extends Note> {
  id: string
  title: string
  /** One line for the list of drills. */
  summary: string
  playerCount: number
  /** Lobby actions after the practice's own, before the start: house rules the drill needs. */
  lobby?: readonly A[]
  /** Turns the game, just started, into the drill's first moment. */
  arrange(table: DrillTable<G, A>): void
  /** What the drill teaches, shown before it starts. */
  brief: N
  /** The coach's line for the moment, in place of its usual one; null to leave that. */
  guide(view: V): N | null
  /** How the drill went, from the player's view and their decisions since it began; null until its moment has passed. */
  verdict(view: V, decisions: readonly DecisionRecord<V, A>[]): Verdict<N> | null
}

/** A drill's game while it is arranged. The deal may be changed directly; everything after it is played through the engine. */
export interface DrillTable<G, A> {
  readonly game: G
  /** Changes the game directly, to stack the deal; the change keeps the table's own bookkeeping, as the engine would. */
  patch(change: (game: G, ctx: Ctx) => G): void
  /** Applies an action as written: computers do not react. Throws if the game refuses it. */
  act(actor: Actor, action: A): void
  /** Runs the clock to the next deadline, and the system's tick. */
  tick(): void
}
