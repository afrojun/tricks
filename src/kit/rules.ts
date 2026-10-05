/** House rules, generic over a game's rule set. Each game freezes its rules into the game at start. */

/** The rule every game's rule set carries. */
export interface CommonRules {
  /** Whether the engine accepts a rule-breaking card and players may accuse. */
  allowCheating: boolean
}

export function resolve<R extends object>(defaults: R, overrides: Partial<R>): R {
  return { ...defaults, ...overrides }
}

/** The settings in `rules` that differ from `defaults`: what a preset or share link stores. */
export function diff<R extends object>(defaults: R, rules: R): Partial<R> {
  const out: Partial<R> = {}
  for (const key of Object.keys(defaults) as (keyof R)[]) {
    if (rules[key] !== defaults[key]) out[key] = rules[key]
  }
  return out
}

/** How long a completed trick stays on the table. */
export const TRICK_PAUSE_MS = 2000
