import { describe, expect, test } from 'vitest'
import { CLASSIC_APP, CLASSIC_APP_OVERRIDES, TRADITIONAL, resolveRules, ruleOverridesSchema } from '../games/thunee/engine'
import { ruleBook } from '../games/thunee/ui/rules'
import { z } from 'zod'
import { type RuleBook, type RulesOf, differenceCount, valueLabel } from './book'
import { decodeShare, encodeShare, shareUrl } from './share'
import { deletePreset, listPresets, renamePreset, savePreset } from './storage'

const THUNEE = { id: 'thunee', name: 'Thunee', rules: ruleBook }
const RULE_INFO = ruleBook.info
const BUILT_IN_PRESETS = ruleBook.presets

function memoryStore(initial?: string) {
  const data = new Map<string, string>(initial === undefined ? [] : [['tricks-thunee-presets', initial]])
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data }
}

/** A second game with one rule, to show that presets and links belong to their game. */
interface Toy {
  allowCheating: boolean
  speed: number
}
const TOY: RulesOf<Toy> = {
  id: 'toy',
  name: 'Toy',
  rules: {
    defaults: { allowCheating: true, speed: 3 },
    schema: z.object({ allowCheating: z.boolean(), speed: z.number().int().min(1).max(9) }).partial(),
    presets: [
      { id: 'plain', name: 'Plain', overrides: {} },
      { id: 'quick', name: 'Quick', overrides: { speed: 9 } },
    ],
    info: [
      { key: 'allowCheating', label: 'Cheating', choices: [{ value: true, label: 'Allowed' }, { value: false, label: 'Not allowed' }] },
      { key: 'speed', label: 'Speed', range: { min: 1, max: 9, unit: 'steps' } },
    ],
  } satisfies RuleBook<Toy>,
}

describe('preset storage', () => {
  test('built-ins come first and resolve to the two shipped rule sets', () => {
    const presets = listPresets(THUNEE, memoryStore())
    expect(presets.map((p) => p.name)).toEqual(['Traditional', 'Classic app'])
    expect(resolveRules(presets[0].overrides)).toEqual(TRADITIONAL)
    expect(resolveRules(presets[1].overrides)).toEqual(CLASSIC_APP)
  })

  test('save, list, rename and delete', () => {
    const store = memoryStore()
    const saved = savePreset(THUNEE, '  Charous   rules ', { double: false, ballsToWin: 13 }, store)!
    expect(saved).toMatchObject({ name: 'Charous rules', builtIn: false })
    expect(listPresets(THUNEE, store).map((p) => p.name)).toEqual(['Traditional', 'Classic app', 'Charous rules'])
    expect(renamePreset(THUNEE, saved.id, 'Friday night', store)).toBe(true)
    expect(listPresets(THUNEE, store)[2]).toMatchObject({ name: 'Friday night', overrides: { double: false, ballsToWin: 13 } })
    expect(deletePreset(THUNEE, saved.id, store)).toBe(true)
    expect(listPresets(THUNEE, store)).toHaveLength(2)
  })

  test('built-ins are read-only, and empty names are refused', () => {
    const store = memoryStore()
    for (const builtIn of BUILT_IN_PRESETS) {
      expect(renamePreset(THUNEE, builtIn.id, 'Mine', store)).toBe(false)
      expect(deletePreset(THUNEE, builtIn.id, store)).toBe(false)
    }
    expect(savePreset(THUNEE, '   ', {}, store)).toBeNull()
    expect(listPresets(THUNEE, store)).toHaveLength(2)
  })

  test('corrupt or tampered storage is ignored instead of crashing', () => {
    expect(listPresets(THUNEE, memoryStore('{not json'))).toHaveLength(2)
    expect(listPresets(THUNEE, memoryStore('{"a":1}'))).toHaveLength(2)
    const mixed = JSON.stringify([
      { id: 'ok', name: 'Fine', overrides: { double: false } },
      { id: 'bad', name: 'Bad', overrides: { ballsToWin: -5 } },
      null,
    ])
    expect(listPresets(THUNEE, memoryStore(mixed)).map((p) => p.name)).toEqual(['Traditional', 'Classic app', 'Fine'])
  })
})

describe('descriptions', () => {
  test('every rule has a description', () => {
    expect(RULE_INFO.map((info) => info.key).sort()).toEqual(Object.keys(TRADITIONAL).sort())
  })

  test('cheating is a house rule like any other: described, counted, checked and shared', () => {
    const info = RULE_INFO.find((i) => i.key === 'allowCheating')!
    expect(info.label).toBe('Cheating')
    expect(valueLabel(info, true)).toBe('Allowed, and can be challenged')
    expect(valueLabel(info, false)).toBe('Not allowed')
    expect(differenceCount(ruleBook, resolveRules({ allowCheating: false }))).toBe(1)
    expect(ruleOverridesSchema.safeParse({ allowCheating: false }).success).toBe(true)
    expect(ruleOverridesSchema.safeParse({ allowCheating: 'no' }).success).toBe(false)
    expect(decodeShare(THUNEE, encodeShare('Honest', { allowCheating: false }))).toEqual({ ok: true, name: 'Honest', overrides: { allowCheating: false } })
  })
})

describe('share links', () => {
  test('a preset round-trips, including names with non-Latin characters', () => {
    const decoded = decodeShare(THUNEE, encodeShare('Thunee தமிழ் 🃏', CLASSIC_APP_OVERRIDES))
    expect(decoded).toEqual({ ok: true, name: 'Thunee தமிழ் 🃏', overrides: CLASSIC_APP_OVERRIDES })
    const url = new URL(shareUrl(THUNEE, 'X', { double: false }, 'https://tricks.example'))
    expect(url.pathname).toBe('/thunee')
    expect(decodeShare(THUNEE, url.searchParams.get('rules')!)).toMatchObject({ ok: true, overrides: { double: false } })
  })

  test('unknown settings are ignored and missing ones take Traditional values', () => {
    const code = btoa(JSON.stringify({ v: 1, n: 'Future', o: { double: false, someNewRule: 'x' } }))
    const decoded = decodeShare(THUNEE, code)
    expect(decoded).toEqual({ ok: true, name: 'Future', overrides: { double: false } })
    if (decoded.ok) expect(resolveRules(decoded.overrides).ballsToWin).toBe(12)
  })

  test('truncated, non-base64, wrong-shape and out-of-range links return an error instead of throwing', () => {
    const good = encodeShare('Mine', CLASSIC_APP_OVERRIDES)
    const bad = [
      good.slice(0, good.length - 9),
      '!!! not base64 !!!',
      '',
      btoa('"just a string"'),
      btoa(JSON.stringify({ n: 'no version', o: {} })),
      btoa(JSON.stringify({ v: 1, n: 'x', o: { ballsToWin: 9999 } })),
      btoa(JSON.stringify({ v: 1, n: 'x', o: 'nope' })),
    ]
    for (const code of bad) {
      const decoded = decodeShare(THUNEE, code)
      expect(decoded.ok).toBe(false)
      if (!decoded.ok) expect(decoded.error).toMatch(/can't be read/)
    }
  })

  test('a link from a newer version says so', () => {
    const decoded = decodeShare(THUNEE, btoa(JSON.stringify({ v: 2, n: 'x', o: {} })))
    expect(decoded).toMatchObject({ ok: false })
    if (!decoded.ok) expect(decoded.error).toMatch(/newer version/)
  })

  test('a missing or blank name falls back to a default', () => {
    expect(decodeShare(THUNEE, btoa(JSON.stringify({ v: 1, o: {} })))).toMatchObject({ ok: true, name: 'Shared rules' })
  })
})

describe('presets and links belong to their game', () => {
  test('each game lists its own built-ins, and saves under its own key', () => {
    const store = memoryStore()
    expect(listPresets(TOY, store).map((p) => [p.name, p.builtIn])).toEqual([
      ['Plain', true],
      ['Quick', true],
    ])
    savePreset(TOY, 'Slow', { speed: 1 }, store)
    savePreset(THUNEE, 'Short', { ballsToWin: 6 }, store)
    expect([...store.data.keys()].sort()).toEqual(['tricks-thunee-presets', 'tricks-toy-presets'])
    expect(listPresets(TOY, store).map((p) => p.name)).toEqual(['Plain', 'Quick', 'Slow'])
    expect(listPresets(THUNEE, store).map((p) => p.name)).toEqual(['Traditional', 'Classic app', 'Short'])
  })

  test('a saved preset is read with its own game’s schema', () => {
    const store = memoryStore()
    store.setItem('tricks-toy-presets', JSON.stringify([{ id: 'a', name: 'Fast', overrides: { speed: 8 } }, { id: 'b', name: 'Bad', overrides: { speed: 99 } }]))
    expect(listPresets(TOY, store).map((p) => p.name)).toEqual(['Plain', 'Quick', 'Fast'])
  })

  test('a link opens its game’s home and is read with that game’s schema', () => {
    const url = new URL(shareUrl(TOY, 'Fast', { speed: 8 }, 'https://tricks.example'))
    expect(url.pathname).toBe('/toy')
    expect(decodeShare(TOY, url.searchParams.get('rules')!)).toEqual({ ok: true, name: 'Fast', overrides: { speed: 8 } })
    // Thunee's settings mean nothing to the toy, and the toy's range is its own.
    expect(decodeShare(TOY, encodeShare('Mixed', { ballsToWin: 6, speed: 2 }))).toEqual({ ok: true, name: 'Mixed', overrides: { speed: 2 } })
    expect(decodeShare(TOY, encodeShare('Wild', { speed: 99 }))).toMatchObject({ ok: false })
  })

  test('a link from a newer version names the game', () => {
    const decoded = decodeShare(TOY, btoa(JSON.stringify({ v: 2, n: 'x', o: {} })))
    expect(decoded).toEqual({ ok: false, error: 'This rules link was made with a newer version of Toy. Reload the page and try again.' })
  })
})
