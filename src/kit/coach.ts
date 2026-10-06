/**
 * The coach, for any game. A coach is given the player's own view with full memory, never the
 * game, and never runs a computer's decision for another seat; only the review sees the dealt
 * hands, after the round. Practice calls a game's coach through `GameCoach`.
 */
import type { Card } from './cards'
import type { Seat } from './table'

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

/** A topic the coach may open, by the game's own id. */
export type TopicOf<N extends Note> = NonNullable<N['topic']>

/**
 * A game's coach, as practice calls it. `N` narrows the notes to the game's own topics and
 * warnings, `D` is a deal as the round log keeps it, and `S` a round's summary.
 */
export interface GameCoach<V, A, E, N extends Note = Note, D = unknown, S = unknown> {
  /** What the player is looking at, in a line; null when they have nothing to decide. */
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
