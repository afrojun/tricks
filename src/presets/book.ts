/** A game's house rules as the screens describe, store and share them. Each game writes its own book. */
import type { z } from 'zod'
import { diff } from '../kit/rules'

type Choice<R, K extends keyof R> = { value: R[K]; label: string }

/** One rule as the rules sheet and editor show it. */
export type RuleInfo<R> = {
  [K in keyof R]: {
    key: K
    label: string
    /** Present for settings chosen from a list; absent for numbers. */
    choices?: Choice<R, K>[]
    /** For numbers: the bounds the schema allows, and how far one press of − or + moves (1 unless given). Any whole number between can be typed. */
    range?: { min: number; max: number; unit: string; step?: number }
  }
}[keyof R]

/** A preset every player has. */
export interface BuiltInPreset<R> {
  id: string
  name: string
  overrides: Partial<R>
}

export interface RuleBook<R extends object> {
  /** The rules a game starts with: Thunee's Traditional, Hearts' Standard. A preset stores only its differences from them. */
  defaults: R
  /** Reads the differences a saved preset or a share link carries. Unknown settings are dropped. */
  schema: z.ZodType<Partial<R>>
  /** The presets every player has. The first is the defaults, and its name is theirs. */
  presets: readonly BuiltInPreset<R>[]
  /** Every rule, in the order the rules sheet and editor show them. */
  info: readonly RuleInfo<R>[]
}

/** A game as its presets see it: its id keys what this device saves and where a share link opens, its name signs the link. */
export interface RulesOf<R extends object> {
  id: string
  name: string
  rules: RuleBook<R>
}

/** The name of a game's defaults, such as Traditional. */
export function defaultsName<R extends object>(book: RuleBook<R>): string {
  return book.presets[0].name
}

export function valueLabel<R>(info: RuleInfo<R>, value: R[keyof R]): string {
  if (info.choices) return (info.choices as Choice<R, keyof R>[]).find((c) => c.value === value)?.label ?? String(value)
  return `${value} ${info.range?.unit ?? ''}`.trim()
}

/** How many settings differ from the defaults. */
export function differenceCount<R extends object>(book: RuleBook<R>, rules: R): number {
  return Object.keys(diff(book.defaults, rules)).length
}

export function isDefault<R extends object>(book: RuleBook<R>, key: keyof R, rules: R): boolean {
  return rules[key] === book.defaults[key]
}

/** A number typed for a rule: whole, and held within its range. Null for anything that is not a number. */
export function typedNumber(range: { min: number; max: number }, text: string): number | null {
  const n = Number(text.trim())
  if (text.trim() === '' || !Number.isFinite(n)) return null
  return Math.min(range.max, Math.max(range.min, Math.round(n)))
}

/** What the rules editor stores when `patch` changes `rules`: only the settings that then differ from the defaults. */
export function withRule<R extends object>(book: RuleBook<R>, rules: R, patch: Partial<R>): Partial<R> {
  return diff(book.defaults, { ...rules, ...patch })
}

export function sameOverrides<R extends object>(book: RuleBook<R>, a: Partial<R>, b: Partial<R>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof R>
  return [...keys].every((k) => (a[k] ?? book.defaults[k]) === (b[k] ?? book.defaults[k]))
}
