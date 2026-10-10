/**
 * The coach, for any game. A coach is given the player's own view with full memory, never the
 * game, and never runs a computer's decision for another seat; only the review sees the dealt
 * hands, after the round. Practice calls a game's coach through `GameCoach`.
 *
 * Tier 1, `baselineCoach`, is built for any game from its own computer player and a few words.
 * Tier 2 is written by hand, game by game: a game's coach may start from the baseline and replace
 * any member, or supply every one.
 */
import { type Card, sameCard } from './cards'
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
  /** Where in the round a decision was made, as the review heads it: "Calling", "Trick 4". */
  when(view: V): string
  /** Whether the hint could have chosen an action, so the review weighs it against the hint; an accusation, say, is not. Every action unless given. */
  hinted?(action: A): boolean
  /** Whether the player's choice did all the hint's would have, such as a card touching it: the review lets it pass. */
  asGood?(view: V, advised: A, taken: A): boolean
  /** How much rode on a decision, for the review to pick the moments that mattered most; 1 unless given. */
  stake?(view: V, advised: A, taken: A): number
}

/** At most this many moments against the hint in a review: the ones with most at stake. */
export const REVIEW_MOMENTS = 3

/**
 * A complete coach from a game's computer player and its words. The situation is what the player
 * is asked, and the game's line; the hint is the honest computer's choice with the phrase for its
 * reason; the one warning is for breaking a rule, so the hint, which keeps the rules, is never
 * warned against. The review lists the rule-breaking plays, then the moments with most at stake where
 * the player chose otherwise than the hint, each with the hint's reason; it says so when every choice
 * was the hint's. A hand-written player cannot say how much worse a choice was, so a moment is put as
 * what the hint was and why, never as a mistake. It narrates nothing and teaches no topics.
 */
export function baselineCoach<V extends TableView, A, R extends Reason>(basis: CoachBasis<V, A, R>): GameCoach<V, A, unknown> {
  const honest = (view: V) => (view.seat === null ? null : basis.decide(view, HONEST))
  // The table gives each code's phrase the reason of that code; a reason carries its own code.
  const phrase = (reason: R, view: V) => (basis.phrases[reason.code as R['code']] as (reason: R, view: V) => string)(reason, view)
  const shown = (action: A) => {
    const cards = basis.cards(action)
    return cards.length > 0 ? { cards } : {}
  }

  /** One action, whatever the order of its cards. */
  const same = (a: A, b: A) => {
    const [x, y] = [basis.cards(a), basis.cards(b)]
    const rest = (action: A) => JSON.stringify({ ...(action as object), card: undefined, cards: undefined })
    return rest(a) === rest(b) && x.length === y.length && x.every((c) => y.some((d) => sameCard(c, d)))
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
    review({ decisions }) {
      const broken: Note[] = decisions.flatMap(({ view, taken }) => {
        const why = basis.breaks(view, taken)
        return why === null ? [] : [{ tone: 'warn' as const, title: `${basis.when(view)}: a rule broken`, body: why, ...shown(taken) }]
      })
      const differed = decisions
        .map((d, i) => ({ ...d, i }))
        .filter((d): d is typeof d & { advised: A } => d.advised !== null && (basis.hinted?.(d.taken) ?? true) && !same(d.advised, d.taken))
        .filter((d) => basis.breaks(d.view, d.taken) === null)
        .filter((d) => !basis.asGood?.(d.view, d.advised, d.taken))
      const moments: Note[] = differed
        .map((d) => ({ d, stake: basis.stake?.(d.view, d.advised, d.taken) ?? 1 }))
        .sort((a, b) => b.stake - a.stake || a.d.i - b.d.i)
        .slice(0, REVIEW_MOMENTS)
        .sort((a, b) => a.d.i - b.d.i)
        .map(({ d }) => {
          const decision = honest(d.view)
          // The advice was the honest computer's choice from this view, so its reason is asked again.
          const why = decision && same(decision.action, d.advised) ? ` ${phrase(decision.reason, d.view)}` : ''
          return {
            tone: 'suggest' as const,
            title: `${basis.when(d.view)}: you chose “${basis.name(d.taken)}”`,
            body: `The hint was “${basis.name(d.advised)}”.${why}`,
            ...shown(d.advised),
          }
        })
      if (broken.length === 0 && moments.length === 0 && decisions.some((d) => d.advised !== null))
        return [{ tone: 'info', title: 'You followed the hint', body: 'Every choice this round was the hint’s, or one just as good.' }]
      return [...broken, ...moments]
    },
  }
}
