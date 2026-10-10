import { describe, expect, test } from 'vitest'
import { STANDARD } from '../games/hearts/engine'
import { ruleBook as hearts } from '../games/hearts/ui/rules'
import { ruleBook as spades } from '../games/spades/ui/rules'
import { ruleBook as thunee } from '../games/thunee/ui/rules'
import { type RuleBook, typedNumber, withRule } from './book'
import { decodeShare, encodeShare } from './share'
import { listPresets, savePreset } from './storage'

/** Every game's book, read as plain records. */
const BOOKS = [
  ['thunee', thunee],
  ['hearts', hearts],
  ['spades', spades],
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

  test('lets every whole number in each range be typed, and stores it exactly', () => {
    for (const info of book.info) {
      if (info.choices) continue
      const { min, max } = info.range!
      for (let n = min; n <= max; n++) {
        expect(typedNumber(info.range!, String(n)), `${info.key}: ${n}`).toBe(n)
        const overrides = withRule(book, book.defaults, { [info.key]: n })
        expect(overrides, `${info.key}: ${n}`).toEqual(n === book.defaults[info.key] ? {} : { [info.key]: n })
        expect(book.schema.safeParse(overrides), `${info.key}: ${n}`).toMatchObject({ success: true, data: overrides })
      }
    }
  })

  test('starts its presets with the defaults, each one readable', () => {
    expect(book.presets[0].overrides).toEqual({})
    expect(new Set(book.presets.map((p) => p.id)).size).toBe(book.presets.length)
    for (const preset of book.presets) expect(book.schema.safeParse(preset.overrides), preset.name).toMatchObject({ success: true, data: preset.overrides })
  })
})

describe('a number typed for a rule', () => {
  const range = { min: 25, max: 500, unit: 'points', step: 25 }

  test('is a whole number held within the range', () => {
    expect(typedNumber(range, ' 101 ')).toBe(101)
    expect(typedNumber(range, '99.6')).toBe(100)
    expect(typedNumber(range, '600')).toBe(500)
    expect(typedNumber(range, '3')).toBe(25)
  })

  test('is nothing when it is not a number', () => {
    for (const text of ['', '  ', 'abc', '1e', 'NaN', 'Infinity']) expect(typedNumber(range, text), text).toBeNull()
  })
})

describe('Hearts can end at any score in its range', () => {
  const HEARTS = { id: 'hearts', name: 'Hearts', rules: hearts }
  const info = hearts.info.find((i) => i.key === 'gameEndsAt')!

  test('101, between the 25-point steps, is chosen and stored exactly, in a preset and a link', () => {
    const chosen = typedNumber(info.range!, '101')!
    const overrides = withRule(hearts, STANDARD, { gameEndsAt: chosen })
    expect(overrides).toEqual({ gameEndsAt: 101 })
    const data = new Map<string, string>()
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
    savePreset(HEARTS, 'Long', overrides, store)
    expect(listPresets(HEARTS, store).at(-1)).toMatchObject({ name: 'Long', overrides: { gameEndsAt: 101 } })
    expect(decodeShare(HEARTS, encodeShare('Long', overrides))).toEqual({ ok: true, name: 'Long', overrides: { gameEndsAt: 101 } })
  })

  test('and changing another rule keeps it', () => {
    const rules = { ...STANDARD, gameEndsAt: 101 }
    expect(withRule(hearts, rules, { moon: 'shooterSubtracts' })).toEqual({ gameEndsAt: 101, moon: 'shooterSubtracts' })
  })
})
