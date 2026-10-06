import { describe, expect, test } from 'vitest'
import { ruleBook as hearts } from '../games/hearts/ui/rules'
import { ruleBook as thunee } from '../games/thunee/ui/rules'
import type { RuleBook } from './book'

/** Every game's book, read as plain records. */
const BOOKS = [
  ['thunee', thunee],
  ['hearts', hearts],
] as unknown as [string, RuleBook<Record<string, unknown>>][]

describe.each(BOOKS)('%s’s rule book', (_, book) => {
  test('describes every rule once', () => {
    expect(book.info.map((info) => info.key).sort()).toEqual(Object.keys(book.defaults).sort())
  })

  test('offers only choices its schema accepts, the default among them', () => {
    for (const info of book.info) {
      if (!info.choices) continue
      expect(info.choices.map((c) => c.value), info.key).toContain(book.defaults[info.key])
      for (const choice of info.choices) expect(book.schema.safeParse({ [info.key]: choice.value }).success, `${info.key}: ${choice.value}`).toBe(true)
    }
  })

  test('bounds each number as its schema does, the default inside', () => {
    for (const info of book.info) {
      if (info.choices) continue
      const { min, max, step = 1 } = info.range!
      const ok = (n: number) => book.schema.safeParse({ [info.key]: n }).success
      expect([ok(min), ok(max), ok(min - step), ok(max + step)], info.key).toEqual([true, true, false, false])
      expect(book.defaults[info.key], info.key).toBeGreaterThanOrEqual(min)
      expect(book.defaults[info.key], info.key).toBeLessThanOrEqual(max)
    }
  })

  test('starts its presets with the defaults, each one readable', () => {
    expect(book.presets[0].overrides).toEqual({})
    expect(new Set(book.presets.map((p) => p.id)).size).toBe(book.presets.length)
    for (const preset of book.presets) expect(book.schema.safeParse(preset.overrides), preset.name).toMatchObject({ success: true, data: preset.overrides })
  })
})
