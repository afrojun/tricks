import { describe, expect, test } from 'vitest'
import { diff, resolve } from './rules'

interface Rules {
  allowCheating: boolean
  target: number
  style: 'plain' | 'fancy'
}
const DEFAULTS: Rules = { allowCheating: true, target: 100, style: 'plain' }

describe('rules', () => {
  test('no overrides resolves to the defaults', () => {
    expect(resolve(DEFAULTS, {})).toEqual(DEFAULTS)
    expect(resolve(DEFAULTS, {})).not.toBe(DEFAULTS)
  })

  test('a rule set round-trips through its difference from the defaults', () => {
    const rules = resolve(DEFAULTS, { target: 50, style: 'fancy' })
    expect(rules).toEqual({ allowCheating: true, target: 50, style: 'fancy' })
    expect(diff(DEFAULTS, rules)).toEqual({ target: 50, style: 'fancy' })
    expect(resolve(DEFAULTS, diff(DEFAULTS, rules))).toEqual(rules)
    expect(diff(DEFAULTS, DEFAULTS)).toEqual({})
  })
})
