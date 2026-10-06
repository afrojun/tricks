/**
 * The coach, for any game. A coach is given the player's own view with full memory, never the
 * game, and never runs a computer's decision for another seat; only the review sees the dealt
 * hands, after the round. Practice calls a game's coach through `GameCoach`.
 *
 * Tier 1, `baselineCoach`, is built for any game from its own computer player and a few words.
 * Tier 2 is written by hand, game by game: a game's coach may start from the baseline and replace
 * any member, or supply every one.
 */
import type { Card } from './cards'
import { HONEST, type Mind } from './mind'
import type { Seat, TableView } from './table'

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

// ── Tier 1 ───────────────────────────────────────────────────────────────

/** Why a computer chose what it did, as data: a code, and whatever the code carries. */
export interface Reason {
  code: string
}

export interface Decision<A, R extends Reason> {
  action: A
  reason: R
}

/** A short phrase for every reason code, in the game's words. The type checker asks for each one. */
export type Phrases<V, R extends Reason> = { [C in R['code']]: (reason: Extract<R, { code: C }>, view: V) => string }

/** What a game gives the kit for its tier-1 coach: its own computer player, and a few words. Each is given the player's own view. */
export interface CoachBasis<V extends TableView, A, R extends Reason> {
  /**
   * The game's computer player: its choice for a seat's view, and why; null when the seat has
   * nothing to decide. The coach asks it only with the honest mind, and only for the player's view.
   */
  decide(view: V, mind: Mind): Decision<A, R> | null
  /** Why the computer chose as it did: a phrase for each reason. */
  phrases: Phrases<V, R>
  /** What the player is asked to do, from the game's available actions: "Choose three cards to pass to the left." */
  asked(view: V): string
  /** One line of the game's own about the moment, such as what was led; null for none. */
  line?(view: V): string | null
  /** An action in a few words, as the hint's title: "Play Q♠". */
  name(action: A): string
  /** The cards an action plays or gives, to highlight. */
  cards(action: A): readonly Card[]
  /**
   * Why an action the game would accept breaks its rules, read from the engine's excuses and naming
   * the card; null for any other action. Said before the play and again in the review.
   */
  breaks(view: V, action: A): string | null
  /** What breaking a rule risks once someone notices. */
  risk: string
}

/**
 * A complete coach from a game's computer player and its words. The situation is what the player
 * is asked, and the game's line; the hint is the honest computer's choice with the phrase for its
 * reason; the one warning is for breaking a rule, so the hint, which keeps the rules, is never
 * warned against; the review lists the rule-breaking plays. It narrates nothing and teaches no topics.
 */
export function baselineCoach<V extends TableView, A, R extends Reason>(basis: CoachBasis<V, A, R>): GameCoach<V, A, unknown> {
  const honest = (view: V) => (view.seat === null ? null : basis.decide(view, HONEST))
  // The table gives each code's phrase the reason of that code; a reason carries its own code.
  const phrase = (reason: R, view: V) => (basis.phrases[reason.code as R['code']] as (reason: R, view: V) => string)(reason, view)
  const shown = (action: A) => {
    const cards = basis.cards(action)
    return cards.length > 0 ? { cards } : {}
  }

  return {
    situation(view) {
      if (honest(view) === null) return null
      const body = [basis.asked(view), basis.line?.(view)].filter((s) => s).join(' ')
      return { tone: 'info', title: 'Your move', body }
    },
    advise(view) {
      const decision = honest(view)
      if (decision === null) return null
      const { action, reason } = decision
      return { action, note: { tone: 'suggest', title: basis.name(action), body: phrase(reason, view), ...shown(action) } }
    },
    check(view, action) {
      const why = basis.breaks(view, action)
      if (why === null) return null
      return { tone: 'warn', rule: 'illegal', title: 'That breaks the rules', body: `${why} ${basis.risk}`, ...shown(action) }
    },
    narrate: () => null,
    topicsFor: () => [],
    review: ({ decisions }) =>
      decisions.flatMap(({ view, taken }) => {
        const why = basis.breaks(view, taken)
        return why === null ? [] : [{ tone: 'warn' as const, title: 'A rule broken', body: why, ...shown(taken) }]
      }),
  }
}
