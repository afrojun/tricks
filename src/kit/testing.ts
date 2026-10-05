/** Helpers for tests and simulations. Not used by the app. */
import type { Card } from './cards'

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const v of Object.values(value)) deepFreeze(v)
  }
  return value
}

/** Every card-shaped object anywhere inside `value`. */
export function collectCards(value: unknown, out: Card[] = []): Card[] {
  if (value === null || typeof value !== 'object') return out
  const v = value as Record<string, unknown>
  if (typeof v.suit === 'string' && typeof v.rank === 'string') out.push(v as unknown as Card)
  else for (const child of Object.values(v)) collectCards(child, out)
  return out
}

/** Small deterministic generator (mulberry32). */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
