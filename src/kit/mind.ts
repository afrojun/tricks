/** What a computer player brings to a decision besides its view: a persona and the round's salt. */
import type { Seat } from './table'

/** How a computer player behaves about cheating and accusing. */
export const PERSONAS = ['straight', 'sharp', 'sly', 'wild'] as const
export type Persona = (typeof PERSONAS)[number]

export interface Mind {
  persona: Persona
  /** The round's hidden salt; makes every chance roll repeatable without remembering it. */
  salt: number
}

/** For seats that must play it straight: humans driven by scripts, and tests. */
export const HONEST: Mind = { persona: 'straight', salt: 0 }

export interface Traits {
  /** How likely a proof is noticed, before memory and salience. */
  attention: number
  cheats: 'never' | 'careful' | 'reckless'
  /** Suspicion signals against one seat before a hunch can fire; null for never. */
  hunchAt: number | null
  /** Chance a hunch fires on each new signal once past `hunchAt`. */
  hunchChance: number
  /** Whether being behind makes it bolder. */
  moody: boolean
}

export const TRAITS: Record<Persona, Traits> = {
  straight: { attention: 0.6, cheats: 'never', hunchAt: null, hunchChance: 0, moody: false },
  sharp: { attention: 0.95, cheats: 'never', hunchAt: 3, hunchChance: 0.3, moody: false },
  sly: { attention: 0.6, cheats: 'careful', hunchAt: null, hunchChance: 0, moody: false },
  wild: { attention: 0.35, cheats: 'reckless', hunchAt: 2, hunchChance: 0.03, moody: true },
}

/** What `mindFor` reads from a game. */
export interface MindSource {
  seats: readonly { persona: Persona; standIn: boolean }[]
  aiSalt: number
  rules: { allowCheating: boolean }
}

/** The mind an AI-controlled seat plays with. A stand-in for a human, or any seat with cheating off, plays straight. */
export function mindFor(game: MindSource, seat: Seat): Mind {
  const info = game.seats[seat]
  const straight = info.standIn || !game.rules.allowCheating
  return { persona: straight ? 'straight' : info.persona, salt: game.aiSalt }
}

/** A repeatable chance in [0, 1) for one observer and one question (FNV-1a, then a final mix). */
export function roll(salt: number, observer: Seat, id: string): number {
  let h = (2166136261 ^ salt) >>> 0
  for (const ch of `${observer}|${id}`) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619) >>> 0
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35) >>> 0
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}
