/** Determinised Monte Carlo: sample what the seat cannot see, play each legal card out, keep the best on average. */
import {
  type Action,
  type Card,
  type Ctx,
  type Game,
  type Seat,
  type View,
  apply,
  availableActions,
  cardId,
  checkInvariants,
  nextDeadline,
  seatsToAct,
  teamOf,
  viewFor,
} from '../../engine'
import { seededRng } from '../../engine/testing'
import { chooseAction, chooseJodhi } from '../../ai/choose'
import { HONEST } from '../../ai/mind'
import { applyInPlace } from './applyInPlace'
import { rebuild } from './rebuild'
import { type Dropped, knowledge, sampleWorld } from './sample'

export type RolloutPolicy = 'random' | 'heuristic' | 'randomClaims'

export interface SearchOptions {
  worlds: number
  policy: RolloutPolicy
  seed: number
  /** Use the engine's `apply`, which clones the game on every action, instead of the in-place copy. */
  cloning?: boolean
  /** Check every rebuilt world: the invariants hold and it gives back the same view. */
  check?: boolean
  /** Break ties in balls by the card-point margin (on by default). */
  tiebreak?: boolean
}

export interface CardStat {
  card: Card
  /** Mean balls from the seat's side: won positive, conceded negative. */
  mean: number
  /** Mean card points of the seat's team minus the other's. */
  margin: number
  /** Share of worlds in which this card won the current trick for the seat itself, and for its team. */
  wonByMe: number
  wonByTeam: number
}

export interface SearchResult {
  card: Card
  /** Best first. */
  stats: CardStat[]
  dropped: Dropped[]
}

type Step = (game: Game, actor: Seat | 'system', action: Action, ctx: Ctx) => Game

const cloningStep: Step = (game, actor, action, ctx) => {
  const r = apply(game, actor, action, ctx)
  if ('rejected' in r) throw new Error(`rollout: ${JSON.stringify(action)} by ${actor} rejected (${r.rejected})`)
  return r.game
}
const inPlaceStep: Step = (game, actor, action, ctx) => {
  const r = applyInPlace(game, actor, action, ctx)
  if (typeof r === 'string') throw new Error(`rollout: ${JSON.stringify(action)} by ${actor} rejected (${r})`)
  return game
}

function policyAction(policy: RolloutPolicy, game: Game, seat: Seat, rng: () => number): Action {
  if (policy === 'heuristic') return chooseAction(viewFor(game, seat, 'full'), HONEST)
  const legal = availableActions(viewFor(game, seat)).legal
  return { type: 'playCard', card: legal[Math.floor(rng() * legal.length)] }
}

export interface Playout {
  value: number
  margin: number
  /** Winner of trick `watch`, if it was completed. */
  watched: Seat | null
}

/** Plays a round to its result with `policy` for every seat. */
export function playOut(start: Game, me: Seat, watch: number, policy: RolloutPolicy, rng: () => number, step: Step): Playout {
  let game = start
  let watched: Seat | null = null
  const ctx: Ctx = { now: 0, rng }
  const claims = policy !== 'random'
  for (let guard = 0; guard < 200; guard++) {
    const phase = game.phase
    if (phase.kind === 'roundResult' || phase.kind === 'gameOver') {
      const s = phase.summary
      const team = teamOf(me)
      return { value: s.winner === team ? s.balls : -s.balls, margin: s.cardPoints[team] - s.cardPoints[1 - team], watched }
    }
    if (phase.kind !== 'playing' && phase.kind !== 'trickPause') throw new Error(`rollout reached ${phase.kind}`)
    if (watched === null && phase.play.tricks.length > watch) watched = phase.play.tricks[watch].winner
    const waiting = seatsToAct(game)
    if (waiting.length > 0) {
      game = step(game, waiting[0], policyAction(policy, game, waiting[0], rng), ctx)
      continue
    }
    if (claims && phase.play.jodhiOpenFor !== null) {
      for (let seat = 0; seat < game.playerCount; seat++) {
        if (teamOf(seat) !== phase.play.jodhiOpenFor) continue
        const claim = chooseJodhi(viewFor(game, seat, 'full'), HONEST)
        if (claim) game = step(game, seat, claim, ctx)
      }
    }
    ctx.now = nextDeadline(game)!
    game = step(game, 'system', { type: 'tick' }, ctx)
  }
  throw new Error('rollout did not finish')
}

/** The search's evaluation of every legal card for the seat to play. */
export function search(view: View, opts: SearchOptions): SearchResult {
  const me = view.seat!
  const phase = view.phase
  if (phase.kind !== 'playing' || phase.turn !== me) throw new Error('search: not this seat to play')
  const candidates = availableActions(view).legal
  const k = knowledge(view)
  const rng = seededRng(opts.seed)
  const step = opts.cloning ? cloningStep : inPlaceStep
  const watch = phase.tricks.length
  const sum = candidates.map(() => ({ value: 0, margin: 0, me: 0, team: 0 }))

  for (let w = 0; w < opts.worlds; w++) {
    const world = sampleWorld(k, rng)
    const rolloutSeed = Math.floor(rng() * 2 ** 32)
    if (opts.check) checkWorld(view, rebuild(view, world))
    candidates.forEach((card, i) => {
      const start = step(rebuild(view, world), me, { type: 'playCard', card }, { now: 0, rng })
      const r = playOut(start, me, watch, opts.policy, seededRng(rolloutSeed), step)
      sum[i].value += r.value
      sum[i].margin += r.margin
      if (r.watched === me) sum[i].me++
      if (r.watched !== null && teamOf(r.watched) === teamOf(me)) sum[i].team++
    })
  }

  const n = opts.worlds
  const stats: CardStat[] = candidates.map((card, i) => ({
    card,
    mean: sum[i].value / n,
    margin: sum[i].margin / n,
    wonByMe: sum[i].me / n,
    wonByTeam: sum[i].team / n,
  }))
  // Lexicographic on averages: 1e-5 x at most ~400 points stays below the smallest step in balls (1/worlds).
  const score = (s: CardStat) => s.mean + (opts.tiebreak === false ? 0 : 1e-5 * s.margin)
  const ranked = [...stats].sort((a, b) => score(b) - score(a))
  return { card: ranked[0].card, stats: ranked, dropped: k.dropped }
}

/** Throws unless the rebuilt game passes the invariants and gives the seat back exactly its view. */
export function checkWorld(view: View, game: Game): void {
  checkInvariants(game)
  const again = JSON.stringify(viewFor(game, view.seat, 'full'))
  if (again !== JSON.stringify(view)) throw new Error(`rebuilt view differs\n${again}\n${JSON.stringify(view)}`)
}

export const sameCardId = (a: Card, b: Card) => cardId(a) === cardId(b)
