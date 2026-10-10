/** Helpers for tests and simulations. Not used by the app. */
import type { Card } from './cards'

/**
 * Freezes `value` and everything inside it, stopping at anything already frozen. Tests freeze every game
 * before applying an action to it, so it walks with plain loops and skips what cannot be frozen.
 */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    if (Array.isArray(value)) {
      for (const item of value) if (typeof item === 'object') deepFreeze(item)
    } else {
      for (const key in value) {
        const child = value[key]
        if (typeof child === 'object') deepFreeze(child)
      }
    }
  }
  return value
}

/** Every card-shaped object anywhere inside `value`. */
export function collectCards(value: unknown, out: Card[] = []): Card[] {
  if (value === null || typeof value !== 'object') return out
  const v = value as Record<string, unknown>
  if (typeof v.suit === 'string' && typeof v.rank === 'string') out.push(v as unknown as Card)
  else if (Array.isArray(value)) for (const item of value) collectCards(item, out)
  else for (const key in v) collectCards(v[key], out)
  return out
}

/**
 * What a view gives away: the cards in it that are among `hidden`, as `collectCards` finds them, and the
 * `secrets` it holds as keys, as its JSON would show them (with a value). One walk, for the simulations
 * that check every view after every action.
 */
export function exposed(view: unknown, hidden: readonly Card[], secrets: readonly string[]): { cards: Card[]; keys: Set<string> } {
  const ranks = new Map<string, string[]>()
  for (const card of hidden) {
    const of = ranks.get(card.suit)
    if (of === undefined) ranks.set(card.suit, [card.rank])
    else of.push(card.rank)
  }
  const found: { cards: Card[]; keys: Set<string> } = { cards: [], keys: new Set() }
  if (typeof view === 'object' && view !== null) gather(view, false, ranks, new Set(secrets), found)
  return found
}

/** The walk of `exposed`. Inside a card, as in `collectCards`, it looks for no more cards, only keys. */
function gather(
  value: object,
  inCard: boolean,
  hidden: ReadonlyMap<string, readonly string[]>,
  secrets: ReadonlySet<string>,
  found: { cards: Card[]; keys: Set<string> },
): void {
  if (Array.isArray(value)) {
    for (const item of value) if (typeof item === 'object' && item !== null) gather(item, inCard, hidden, secrets, found)
    return
  }
  const v = value as Record<string, unknown>
  const card = !inCard && typeof v.suit === 'string' && typeof v.rank === 'string'
  if (card && hidden.get(v.suit as string)?.includes(v.rank as string)) found.cards.push(v as unknown as Card)
  for (const key in v) {
    const child = v[key]
    if (child !== undefined && secrets.has(key)) found.keys.add(key)
    if (typeof child === 'object' && child !== null) gather(child, inCard || card, hidden, secrets, found)
  }
}

/**
 * A deep copy of plain data that keeps shared parts shared, as `structuredClone` does, in a fifth of its
 * time: a test can step a copy of a game exactly as it stands, which `copy` would not.
 */
export function clone<T>(value: T, copies = new Map<object, unknown>()): T {
  if (typeof value !== 'object' || value === null) return value
  const known = copies.get(value)
  if (known !== undefined) return known as T
  if (Array.isArray(value)) {
    const out: unknown[] = []
    copies.set(value, out)
    for (const item of value) out.push(clone(item, copies))
    return out as T
  }
  const out: Record<string, unknown> = {}
  copies.set(value, out)
  for (const key in value) out[key] = clone(value[key], copies)
  return out as T
}

/**
 * Whether two values of plain data (objects, arrays and primitives, as games, views and events are) are
 * deeply equal, as `isDeepStrictEqual` finds them, without its general machinery: simulations compare
 * games and what may be done in them after every action.
 */
export function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false
    return true
  }
  if (Array.isArray(b)) return false
  const x = a as Record<string, unknown>
  const y = b as Record<string, unknown>
  let keys = 0
  for (const key in x) {
    const value = x[key]
    if (!same(value, y[key]) || (value === undefined && !(key in y))) return false
    keys++
  }
  for (const _ in y) keys--
  return keys === 0
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
