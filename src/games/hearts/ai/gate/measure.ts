/**
 * The gate's measurements, one deal or round at a time, so that `run.ts` can share them among worker threads
 * and `gate.test.ts` can run a few. Pure functions of their seeds. Not used by the app.
 */
import { hasCard, sameCard } from '../../../../kit/cards'
import { HONEST, type Persona } from '../../../../kit/mind'
import { search } from '../../../../kit/search/search'
import { availableActions } from '../../engine/available'
import { checkInvariants } from '../../engine/invariants'
import { MOON_POINTS, PLAYERS } from '../../engine/rules'
import type { Action, Game, View } from '../../engine/types'
import { viewFor } from '../../engine/view'
import { rebuild } from '../imagine'
import { candidates, heartsSearch, searchHearts } from '../search'
import { DIRECTIONS, type Player, RANDOM, WRITTEN, dealt, handsOf, playRound } from './play'

/** Whether two actions are the same pass (in any order) or the same card. */
export function sameAction(a: Action | null, b: Action | null): boolean {
  if (a?.type === 'choosePass' && b?.type === 'choosePass') return a.cards.length === b.cards.length && a.cards.every((c) => hasCard(b.cards, c))
  if (a?.type === 'playCard' && b?.type === 'playCard') return sameCard(a.card, b.card)
  return false
}

export interface StrengthDeal {
  deal: number
  /** For each direction then seat: the search player's points minus the baseline player's in the same seat. */
  differences: number[]
  search: number[]
  baseline: number[]
  /** Decisions the search searched, and how many of them chose what the hand-written player would. */
  searched: number
  agreed: number
}

/**
 * One duplicate deal under every pass direction: the round with the baseline player at all four seats, then
 * the search player at each seat in turn against three baseline players, paired seat by seat. `searches` says
 * what the search player decides itself, the pass, the play or both, leaving the rest to the hand-written player.
 */
export function strengthDeal(deal: number, worlds: number, against: 'written' | 'random', searches: 'both' | 'pass' | 'play' = 'both'): StrengthDeal {
  const base: Player = against === 'written' ? WRITTEN : RANDOM
  const out: StrengthDeal = { deal, differences: [], search: [], baseline: [], searched: 0, agreed: 0 }
  const searcher: Player = (view, mind) => {
    if (searches !== 'both' && (view.phase.kind === 'passing') !== (searches === 'pass')) return WRITTEN(view, mind)
    const result = searchHearts(view, mind, { worlds })
    if (result !== null && result.worlds > 0) {
      out.searched++
      if (sameAction(result.action, WRITTEN(view, HONEST))) out.agreed++
    }
    return result?.action ?? null
  }
  const hands = handsOf(deal)
  for (const direction of DIRECTIONS) {
    const start = dealt(hands, direction)
    const baseline = playRound(start, [base, base, base, base], deal).points
    for (let seat = 0; seat < PLAYERS; seat++) {
      const players = [base, base, base, base]
      players[seat] = searcher
      const points = playRound(start, players, deal).points[seat]
      out.search.push(points)
      out.baseline.push(baseline[seat])
      out.differences.push(points - baseline[seat])
    }
  }
  return out
}

export interface SelfDeal {
  deal: number
  /** For each direction, each seat's points with four search players. */
  points: number[][]
  moons: number
}

/** One deal under every pass direction with four search players. */
export function selfDeal(deal: number, worlds: number): SelfDeal {
  const player: Player = (view, mind) => searchHearts(view, mind, { worlds })?.action ?? null
  const hands = handsOf(deal)
  const points = DIRECTIONS.map((direction) => playRound(dealt(hands, direction), [player, player, player, player], deal).points)
  return { deal, points, moons: points.filter((p) => p.reduce((a, b) => a + b, 0) !== MOON_POINTS).length }
}

/** Throws unless a rebuilt game passes the invariants and gives the seat its own view back exactly. */
export function checkWorld(view: View, game: Game): void {
  checkInvariants(game)
  if (JSON.stringify(viewFor(game, view.seat, 'full')) !== JSON.stringify(view)) throw new Error('a rebuilt world gives another view')
}

export interface CheatRound {
  seed: number
  /** Seat 0's points with the search player there, and with the hand-written player there. */
  search: number
  written: number
  /** Rule-breaking cards played by Sly and Wild, in the search round and in the hand-written one. */
  cheats: number
  cheatsWritten: number
  /** Searched decisions, those that dropped soft evidence, the pieces dropped, and the worlds checked. */
  searched: number
  dropping: number
  dropped: number
  worlds: number
  /** What went wrong, if anything: the sampler or the rebuild failing would show here. */
  error: string | null
}

const CHEATS: Persona[] = ['straight', 'sly', 'straight', 'wild']

/**
 * One round with Sly at seat 1 and Wild at seat 3 cheating, nobody accusing, and the search player at seat 0
 * with every world it rebuilds checked; then the same deal with the hand-written player at seat 0.
 */
export function cheatRound(seed: number, worlds: number): CheatRound {
  const out: CheatRound = { seed, search: 0, written: 0, cheats: 0, cheatsWritten: 0, searched: 0, dropping: 0, dropped: 0, worlds: 0, error: null }
  const checked = {
    ...heartsSearch,
    worlds,
    rebuild: (view: View, world: Parameters<typeof rebuild>[1]) => {
      const game = rebuild(view, world)
      checkWorld(view, game)
      out.worlds++
      return game
    },
  }
  const searcher: Player = (view, mind) => {
    const result = search({ ...checked, candidates: (v: View) => candidates(v) }, view, mind)
    if (result !== null && result.worlds > 0) {
      out.searched++
      if (result.dropped.length > 0) out.dropping++
      out.dropped += result.dropped.length
    }
    return result?.action ?? null
  }
  const start = dealt(handsOf(seed), DIRECTIONS[seed % DIRECTIONS.length])
  const cheats = (counted: 'cheats' | 'cheatsWritten') => ({
    personas: CHEATS,
    onDecision: ({ view, action }: { view: View; action: Action }) => {
      if (action.type === 'playCard' && !hasCard(availableActions(view).legal, action.card)) out[counted]++
    },
  })
  try {
    out.search = playRound(start, [searcher, WRITTEN, WRITTEN, WRITTEN], seed, cheats('cheats')).points[0]
    out.written = playRound(start, [WRITTEN, WRITTEN, WRITTEN, WRITTEN], seed, cheats('cheatsWritten')).points[0]
  } catch (error) {
    out.error = String(error)
  }
  return out
}

export interface Replay {
  seed: number
  decisions: number
  /** Decisions that came out differently when the saved game was reloaded and asked again. */
  differed: number
}

/**
 * A round of four search players, each decision recorded with the game as a room would have saved it; then
 * every saved game is reloaded from its JSON and each decision asked again, which must give the same action
 * and the same results in every world.
 */
export function replay(seed: number, worlds: number): Replay {
  const saved: { seat: number; game: string; result: string }[] = []
  let made = ''
  const player: Player = (view, mind) => {
    const result = searchHearts(view, mind, { worlds })
    made = JSON.stringify(result)
    return result?.action ?? null
  }
  playRound(dealt(handsOf(seed), DIRECTIONS[seed % DIRECTIONS.length]), [player, player, player, player], seed, {
    onDecision: ({ seat, game }) => saved.push({ seat, game: JSON.stringify(game), result: made }),
  })
  let differed = 0
  for (const s of saved) {
    const game: Game = JSON.parse(s.game)
    const again = searchHearts(viewFor(game, s.seat, 'full'), { persona: 'straight', salt: seed }, { worlds })
    if (JSON.stringify(again) !== s.result) differed++
  }
  return { seed, decisions: saved.length, differed }
}
