/** A seeded random generator whose whole state is one number, so it can be saved with the game. */
export interface Rng {
  readonly state: number
  next(): number
}

/** Mulberry32, the same generator as the engine's test helper. */
export function rng(seed: number): Rng {
  let a = seed >>> 0
  return {
    get state() {
      return a
    },
    next() {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}
