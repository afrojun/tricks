/** A decision's random stream, from public facts and the round's hidden salt. Pure: never a clock or `Math.random`. */
import { roll } from '../mind'
import type { Seat } from '../table'

/**
 * The random stream for one decision: the same salt, seat and decision id always give the same numbers, so a
 * decision never changes when it is asked again, after a restart or a reload.
 */
export function seed(salt: number, seat: Seat, decisionId: string): () => number {
  return stream(Math.floor(roll(salt, seat, `search:${decisionId}`) * 2 ** 32))
}

/** A small generator from a 32-bit seed (mulberry32). */
export function stream(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A seed drawn from a stream, for a stream of its own. */
export function fork(rng: () => number): number {
  return Math.floor(rng() * 2 ** 32)
}
