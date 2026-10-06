/**
 * What a game supplies to be played by the search player, and what the search knows about the cards a seat
 * cannot see. Pure. The search decides from a seat's `full` view; only `rebuild` makes a game, an imagined one.
 */
import type { Card } from '../cards'
import type { Actor, Ctx, Seat, TableAction, TableView } from '../table'

/**
 * A fact about where hidden cards lie. Places are numbered by the game, from 0: Hearts' are the other seats.
 * - `holds`: the place holds this card, as the cards a seat passed are held by the seat it passed them to.
 * - `none`: the place holds no card that `of` matches, as a seat that did not follow suit holds none of it.
 * - `some`: at least one card that `of` matches lies in one of `places`, as Thunee's counting side holds a trump.
 * `why` names it, for tests and explanations.
 */
export type Constraint<C extends Card> =
  | { kind: 'holds'; place: number; card: C; why: string }
  | { kind: 'none'; place: number; of: (card: C) => boolean; why: string }
  | { kind: 'some'; places: readonly number[]; of: (card: C) => boolean; why: string }

/** What one seat knows about the cards it cannot see. */
export interface Knowledge<C extends Card> {
  /** Every card the seat cannot place for certain by sight. */
  hidden: C[]
  /** How many of them each place holds; they add up to `hidden.length`. */
  sizes: number[]
  /** What the rules guarantee. Never broken by a sampled world. */
  hard: Constraint<C>[]
  /**
   * What other seats' play suggests, oldest first. A cheat can falsify it, so the game leaves out what a later
   * play has contradicted, and the sampler drops, newest first, what cannot hold together with the rest.
   */
  soft: Constraint<C>[]
}

/** One placing of the hidden cards: the cards of each place, in a random order. */
export type World<C extends Card> = C[][]

/** What a game supplies to the search player. */
export interface SearchGame<G, A, V extends TableView, C extends Card = Card> {
  /** The in-place half of `apply` (rule 1). */
  step(draft: G, actor: Actor, action: A | TableAction, ctx: Ctx): { events: unknown[] } | { rejected: string }
  /** Where every card is or may be, from one seat's `full` view (rule 3). */
  knowledge(view: V): Knowledge<C>
  /** A full game the engine accepts, from the view and one sampled placing of the hidden cards. */
  rebuild(view: V, world: World<C>): G
  /** The legal actions open to the viewer now, in an order that does not depend on chance. */
  candidates(view: V): A[]
  /**
   * A random legal action for a seat to act in an imagined game, for rollouts. It reads the imagined game,
   * which `rebuild` made from the view, rather than a view of it, which would cost a view per action.
   */
  rollout(game: G, seat: Seat, rng: () => number): A
  /** The round's result for one seat once it is over: higher is better for that seat. */
  value(game: G, seat: Seat): number
  /** Names this decision from public facts (rule 4). */
  decisionId(view: V): string
  /** Worlds per decision. */
  worlds: number
  /** For a card: the index of the trick it is played to, so the search can say how often it wins it. */
  trick?(view: V): number | null
  /** Who took trick `index`, once it is complete; null before. */
  trickWinner?(game: G, index: number): Seat | null
  /** The module's own: who has something to decide, and the next deadline. A round is over when neither is left. */
  seatsToAct(game: G): Seat[]
  nextDeadline(game: G): number | null
}
