/**
 * The gate's speed bench: seeded rounds of four search players, every decision timed once, after a warm-up
 * round. Bundled by `run.ts` and run in Node and in headless Chromium, so both time the same code.
 */
import { searchHearts } from '../search'
import type { Player } from './play'
import { DIRECTIONS, dealt, handsOf, playRound } from './play'

export { cheatRound, replay, selfDeal, strengthDeal } from './measure'

export interface Timing {
  round: number
  seat: number
  kind: 'pass' | 'first' | 'play'
  /** The candidates searched; one means nothing was searched. */
  candidates: number
  /** Wall-clock milliseconds. */
  ms: number
  /** CPU milliseconds, where the host can tell. */
  cpu: number | null
}

/** Raw timings, small: `round kind candidates ms[ cpu]` for each decision, `;` between them. */
export function raw(timings: readonly Timing[]): string {
  return timings.map((t) => `${t.round} ${t.kind} ${t.candidates} ${t.ms.toFixed(2)}${t.cpu === null ? '' : ` ${t.cpu.toFixed(2)}`}`).join(';')
}

/** Rounds 1 to `rounds`, each deal under the pass direction its number picks, at `worlds` worlds a decision. */
export function speed(rounds: number, worlds: number, clock: () => number, cpu?: () => number): Timing[] {
  let candidates = 0
  const player: Player = (view, mind) => {
    const result = searchHearts(view, mind, { worlds })
    candidates = result?.options.length ?? 0
    return result?.action ?? null
  }
  const players = [player, player, player, player]
  // Warm-up: a round that is not timed.
  playRound(dealt(handsOf(10_000), 'left'), players, 10_000)
  const out: Timing[] = []
  for (let round = 1; round <= rounds; round++) {
    const start = dealt(handsOf(round), DIRECTIONS[(round - 1) % DIRECTIONS.length])
    playRound(start, players, round, {
      around: (decide, seat, view) => {
        const wall = clock()
        const used = cpu?.() ?? 0
        const action = decide()
        const ms = clock() - wall
        const kind = view.phase.kind === 'passing' ? 'pass' : view.phase.kind === 'playing' && view.phase.tricks.length === 0 ? 'first' : 'play'
        out.push({ round, seat, kind, candidates, ms, cpu: cpu ? cpu() - used : null })
        return action
      },
    })
  }
  return out
}
