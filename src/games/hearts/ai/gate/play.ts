/**
 * Rounds for the search player's gate: duplicate deals under each pass direction, played by players that see
 * only a seat's `full` view and mind. For the gate's tests and benches; not used by the app.
 */
import { shuffle } from '../../../../kit/cards'
import type { Mind, Persona } from '../../../../kit/mind'
import { seededRng } from '../../../../kit/testing'
import { apply, seatsToAct } from '../../engine/apply'
import { type Card, createDeck } from '../../engine/cards'
import { beginRound } from '../../engine/round'
import { HAND_SIZE, PLAYERS, type PassDirection, type RuleOverrides } from '../../engine/rules'
import { Table } from '../../engine/testing'
import type { Action, Game, View } from '../../engine/types'
import { viewFor } from '../../engine/view'
import { chooseChallenge } from '../catch'
import { chooseAction } from '../choose'
import { chooseAction as randomAction } from '../random'
import { searchHearts } from '../search'

export type Player = (view: View, mind: Mind) => Action | null

export const WRITTEN: Player = chooseAction
export const RANDOM: Player = randomAction
export const searching =
  (worlds: number): Player =>
  (view, mind) =>
    searchHearts(view, mind, { worlds })?.action ?? null

export const DIRECTIONS: PassDirection[] = ['left', 'right', 'across', 'none']
/** The round of a rotating game that passes each way. */
const ROUND: Record<PassDirection, number> = { left: 1, right: 2, across: 3, none: 4 }

const text = (c: Card) => `${c.rank}${c.suit[0]}`

/** The hands of deal `seed`. */
export function handsOf(seed: number): string[] {
  const deck = shuffle(createDeck(), seededRng(seed))
  return Array.from({ length: PLAYERS }, (_, s) => deck.slice(s * HAND_SIZE, (s + 1) * HAND_SIZE).map(text).join(' '))
}

/** A game at the start of the round that passes `direction`, with these hands. */
export function dealt(hands: string[], direction: PassDirection, overrides: RuleOverrides = {}): Game {
  const t = new Table(overrides, 1).do(0, { type: 'start' })
  const game = structuredClone(t.game)
  game.roundNumber = ROUND[direction]
  beginRound(game, t.ctx, [])
  t.game = game
  return t.deal(hands).game
}

export interface Decision {
  seat: number
  /** 'pass', 'first' (the first trick) or 'play'. */
  kind: 'pass' | 'first' | 'play'
  /** The game as it stood, as a room would have saved it. */
  game: Game
  view: View
  action: Action
}

export interface RoundOptions {
  /** Each seat's persona; Straight by default. */
  personas?: readonly Persona[]
  /** Seats that accuse when their persona notices a cheat; none by default. */
  accusers?: readonly number[]
  /** Called around each decision, as a clock would be read. */
  around?: <T>(decision: () => T, seat: number, view: View) => T
  onDecision?: (decision: Decision) => void
}

/** Plays the round out, every chance drawn from `salt`, and returns each seat's points and the final game. */
export function playRound(start: Game, players: readonly Player[], salt: number, options: RoundOptions = {}): { points: number[]; game: Game } {
  let game = start
  let now = 0
  const ctx = () => ({ now, rng: () => 0.5 })
  const mind = (seat: number): Mind => ({ persona: options.personas?.[seat] ?? 'straight', salt })
  const around = options.around ?? (<T>(decision: () => T) => decision())
  const step = (seat: number | 'system', action: Action) => {
    const result = apply(game, seat, action, ctx())
    if ('rejected' in result) throw new Error(`${JSON.stringify(action)} by ${seat} rejected: ${result.rejected}`)
    game = result.game
  }
  for (let guard = 0; guard < 500; guard++) {
    const phase = game.phase
    if (phase.kind === 'roundResult' || phase.kind === 'gameOver') return { points: phase.summary.points, game }
    if (phase.kind === 'trickPause') {
      now = phase.deadline
      step('system', { type: 'tick' })
      continue
    }
    const seat = seatsToAct(game)[0]
    const view = viewFor(game, seat, 'full')
    const action = around(() => players[seat](view, mind(seat)), seat, view)
    if (action === null) throw new Error(`seat ${seat} has nothing to do in ${phase.kind}`)
    const kind = phase.kind === 'passing' ? 'pass' : phase.kind === 'playing' && phase.play.tricks.length === 0 ? 'first' : 'play'
    options.onDecision?.({ seat, kind, game, view, action })
    step(seat, action)
    for (const accuser of options.accusers ?? []) {
      if (game.phase.kind !== 'playing' && game.phase.kind !== 'trickPause') break
      const accusation = chooseChallenge(viewFor(game, accuser, 'full'), mind(accuser))
      if (accusation) step(accuser, accusation)
    }
  }
  throw new Error('the round did not finish')
}

/** Mean and 95% interval half-width of independent observations. */
export function interval(xs: readonly number[], z = 1.96): { mean: number; half: number } {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  const variance = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)
  return { mean: m, half: z * Math.sqrt(variance / xs.length) }
}

export const show = ({ mean, half }: { mean: number; half: number }, digits = 3) =>
  `${mean.toFixed(digits)} [${(mean - half).toFixed(digits)}, ${(mean + half).toFixed(digits)}]`

/** The q-th quantile, by the nearest rank. */
export function quantile(xs: readonly number[], q: number): number {
  const sorted = [...xs].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]
}
