/**
 * The search player: determinised Monte Carlo over the engine itself. For each of a fixed number of worlds it
 * deals the cards the seat cannot see, rebuilds a game, and plays every legal candidate out to the end of the
 * round with random legal actions for every seat, through the engine's own `step`. The candidate with the best
 * mean result is chosen. Pure: the only randomness is the decision's stream (rule 4).
 */
import type { Card } from '../cards'
import type { Mind } from '../mind'
import type { Actor, Seat, TableAction, TableView } from '../table'
import { prepare } from './sample'
import { fork, seed, stream } from './seed'
import type { Constraint, SearchGame } from './types'

/** One candidate's results. */
export interface Option<A> {
  action: A
  /** The seat's result in each world, in the order the worlds were dealt: paired across candidates. */
  values: number[]
  /** In how many worlds the seat won the trick it played this card to; null when the decision is not a card. */
  won: number | null
}

export interface SearchResult<A, C extends Card = Card> {
  action: A
  /** Every candidate, in the game's order. */
  options: Option<A>[]
  /** The index of the one chosen: the best mean, the first among equals. */
  chosen: number
  /** Worlds dealt; none when there was only one candidate. */
  worlds: number
  /** Soft evidence the sampler dropped because it could not hold. */
  dropped: Constraint<C>[]
}

/** The most steps a rollout may take before it is taken to be stuck: a bug. */
const MAX_STEPS = 10_000
const TICK: TableAction = { type: 'tick' }

/**
 * The search's choice for the seat whose `full` view this is, or null when it has nothing to decide. Decides
 * from the view and the mind's salt alone. A candidate or rollout action the engine refuses throws (rule 5).
 */
export function search<G, A, V extends TableView, C extends Card>(game: SearchGame<G, A, V, C>, view: V, mind: Mind): SearchResult<A, C> | null {
  const me = view.seat
  if (me === null) return null
  const candidates = game.candidates(view)
  if (candidates.length === 0) return null
  if (candidates.length === 1) return { action: candidates[0], options: [{ action: candidates[0], values: [], won: null }], chosen: 0, worlds: 0, dropped: [] }

  const rng = seed(mind.salt, me, game.decisionId(view))
  const sampler = prepare(game.knowledge(view))
  const trick = game.trick?.(view) ?? null
  const options: Option<A>[] = candidates.map((action) => ({ action, values: [], won: trick === null ? null : 0 }))
  for (let w = 0; w < game.worlds; w++) {
    const world = sampler.sample(rng)
    // Common random numbers: every candidate meets the same deal and the same rollout stream.
    const rollout = fork(rng)
    for (const option of options) {
      const draft = game.rebuild(view, world)
      const r = stream(rollout)
      act(game, draft, me, option.action, 0, r)
      const out: Playout = playOut(game, draft, me, trick, r)
      option.values.push(out.value)
      if (option.won !== null && out.winner === me) option.won++
    }
  }
  const mean = (o: Option<A>) => o.values.reduce((a, b) => a + b, 0)
  const chosen = options.reduce((best, o, i) => (mean(o) > mean(options[best]) ? i : best), 0)
  return { action: options[chosen].action, options, chosen, worlds: game.worlds, dropped: sampler.dropped }
}

function act<G, A, V extends TableView, C extends Card>(game: SearchGame<G, A, V, C>, draft: G, actor: Actor, action: A | TableAction, now: number, rng: () => number) {
  const result = game.step(draft, actor, action, { now, rng })
  if ('rejected' in result) throw new Error(`search: ${JSON.stringify(action)} by ${actor} was refused (${result.rejected})`)
}

interface Playout {
  value: number
  /** Who took the watched trick. */
  winner: Seat | null
}

/** Plays an imagined round to its end with random legal actions, and returns the seat's result. */
function playOut<G, A, V extends TableView, C extends Card>(
  game: SearchGame<G, A, V, C>,
  draft: G,
  me: Seat,
  trick: number | null,
  rng: () => number,
): Playout {
  let now = 0
  let winner: Seat | null = null
  for (let steps = 0; steps < MAX_STEPS; steps++) {
    if (trick !== null && winner === null) winner = game.trickWinner?.(draft, trick) ?? null
    const toAct = game.seatsToAct(draft)
    if (toAct.length > 0) {
      act(game, draft, toAct[0], game.rollout(game.viewFor(draft, toAct[0]), rng), now, rng)
      continue
    }
    const due = game.nextDeadline(draft)
    if (due === null) return { value: game.value(draft, me), winner }
    now = Math.max(now, due)
    act(game, draft, 'system', TICK, now, rng)
  }
  throw new Error('search: a rollout did not finish')
}
