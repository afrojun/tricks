import { describe, expect, test } from 'vitest'
import { CLASSIC_APP, CLASSIC_APP_OVERRIDES, TRADITIONAL, resolveRules, ruleOverridesSchema } from '../engine'
import { RULE_INFO, differenceCount, valueLabel } from './describe'
import { decodeShare, encodeShare, shareUrl } from './share'
import { BUILT_IN_PRESETS, deletePreset, listPresets, renamePreset, savePreset } from './storage'

function memoryStore(initial?: string) {
  const data = new Map<string, string>(initial === undefined ? [] : [['tricks-thunee-presets', initial]])
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
}

describe('preset storage', () => {
  test('built-ins come first and resolve to the two shipped rule sets', () => {
    const presets = listPresets(memoryStore())
    expect(presets.map((p) => p.name)).toEqual(['Traditional', 'Classic app'])
    expect(resolveRules(presets[0].overrides)).toEqual(TRADITIONAL)
    expect(resolveRules(presets[1].overrides)).toEqual(CLASSIC_APP)
  })

  test('save, list, rename and delete', () => {
    const store = memoryStore()
    const saved = savePreset('  Charous   rules ', { double: false, ballsToWin: 13 }, store)!
    expect(saved).toMatchObject({ name: 'Charous rules', builtIn: false })
    expect(listPresets(store).map((p) => p.name)).toEqual(['Traditional', 'Classic app', 'Charous rules'])
    expect(renamePreset(saved.id, 'Friday night', store)).toBe(true)
    expect(listPresets(store)[2]).toMatchObject({ name: 'Friday night', overrides: { double: false, ballsToWin: 13 } })
    expect(deletePreset(saved.id, store)).toBe(true)
    expect(listPresets(store)).toHaveLength(2)
  })

  test('built-ins are read-only, and empty names are refused', () => {
    const store = memoryStore()
    for (const builtIn of BUILT_IN_PRESETS) {
      expect(renamePreset(builtIn.id, 'Mine', store)).toBe(false)
      expect(deletePreset(builtIn.id, store)).toBe(false)
    }
    expect(savePreset('   ', {}, store)).toBeNull()
    expect(listPresets(store)).toHaveLength(2)
  })

  test('corrupt or tampered storage is ignored instead of crashing', () => {
    expect(listPresets(memoryStore('{not json'))).toHaveLength(2)
    expect(listPresets(memoryStore('{"a":1}'))).toHaveLength(2)
    const mixed = JSON.stringify([
      { id: 'ok', name: 'Fine', overrides: { double: false } },
      { id: 'bad', name: 'Bad', overrides: { ballsToWin: -5 } },
      null,
    ])
    expect(listPresets(memoryStore(mixed)).map((p) => p.name)).toEqual(['Traditional', 'Classic app', 'Fine'])
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
    expect(differenceCount(resolveRules({ allowCheating: false }))).toBe(1)
    expect(ruleOverridesSchema.safeParse({ allowCheating: false }).success).toBe(true)
    expect(ruleOverridesSchema.safeParse({ allowCheating: 'no' }).success).toBe(false)
    expect(decodeShare(encodeShare('Honest', { allowCheating: false }))).toEqual({ ok: true, name: 'Honest', overrides: { allowCheating: false } })
  })
})

describe('share links', () => {
  test('a preset round-trips, including names with non-Latin characters', () => {
    const decoded = decodeShare(encodeShare('Thunee தமிழ் 🃏', CLASSIC_APP_OVERRIDES))
    expect(decoded).toEqual({ ok: true, name: 'Thunee தமிழ் 🃏', overrides: CLASSIC_APP_OVERRIDES })
    const url = new URL(shareUrl('X', { double: false }, 'https://tricks.example'))
    expect(url.pathname).toBe('/thunee')
    expect(decodeShare(url.searchParams.get('rules')!)).toMatchObject({ ok: true, overrides: { double: false } })
  })

  test('unknown settings are ignored and missing ones take Traditional values', () => {
    const code = btoa(JSON.stringify({ v: 1, n: 'Future', o: { double: false, someNewRule: 'x' } }))
    const decoded = decodeShare(code)
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
      const decoded = decodeShare(code)
      expect(decoded.ok).toBe(false)
      if (!decoded.ok) expect(decoded.error).toMatch(/can't be read/)
    }
  })

  test('a link from a newer version says so', () => {
    const decoded = decodeShare(btoa(JSON.stringify({ v: 2, n: 'x', o: {} })))
    expect(decoded).toMatchObject({ ok: false })
    if (!decoded.ok) expect(decoded.error).toMatch(/newer version/)
  })

  test('a missing or blank name falls back to a default', () => {
    expect(decodeShare(btoa(JSON.stringify({ v: 1, o: {} })))).toMatchObject({ ok: true, name: 'Shared rules' })
  })
})
