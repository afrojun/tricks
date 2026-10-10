import { describe, expect, test } from 'vitest'
import { HONEST, PERSONAS, type Persona, TRAITS, mindFor, roll } from './mind'

const seat = (persona: Persona, standIn = false) => ({ persona, standIn })
const game = (allowCheating: boolean) => ({
  aiSalt: 1234,
  rules: { allowCheating },
  seats: [seat('straight'), seat('wild'), seat('sly', true), seat('sharp')],
})

describe('minds', () => {
  test('a roll is repeatable, evenly spread, and differs by salt, observer and question', () => {
    expect(roll(5, 1, 'x')).toBe(roll(5, 1, 'x'))
    const values = Array.from({ length: 4000 }, (_, i) => roll(i, 2, 'renege:1:0:3'))
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    const mean = values.reduce((a, b) => a + b) / values.length
    expect(mean).toBeGreaterThan(0.47)
    expect(mean).toBeLessThan(0.53)
    expect(values.filter((v) => v < 0.25).length / values.length).toBeCloseTo(0.25, 1)
    expect(new Set([roll(1, 0, 'a'), roll(2, 0, 'a'), roll(1, 1, 'a'), roll(1, 0, 'b')]).size).toBe(4)
  })

  test('rolls match the ones Thunee computers make today', () => {
    // Pinned so that moving Thunee onto the kit changes no computer's decision.
    expect(roll(0, 0, '')).toBe(0.15824616933241487)
    expect(roll(12345, 2, 'renege:1:0:3')).toBe(0.28419730975292623)
    expect(roll(4294967295, 3, 'hunch:void:2:1')).toBe(0.5537470090202987)
  })

  test('a seat plays with its own persona and the round salt; a stand-in always plays straight', () => {
    expect(mindFor(game(true), 1)).toEqual({ persona: 'wild', salt: 1234 })
    expect(mindFor(game(true), 3)).toEqual({ persona: 'sharp', salt: 1234 })
    expect(mindFor(game(true), 2)).toEqual({ persona: 'straight', salt: 1234 })
  })

  test('with cheating off, every mind plays as Straight', () => {
    for (const s of [0, 1, 2, 3]) expect(mindFor(game(false), s)).toEqual({ persona: 'straight', salt: 1234 })
  })

  test('the personas and their traits are today’s', () => {
    expect(PERSONAS).toEqual(['straight', 'sharp', 'sly', 'wild'])
    expect(TRAITS.straight).toEqual({ attention: 0.6, cheats: 'never', hunchAt: null, hunchChance: 0, moody: false })
    expect(TRAITS.sharp).toEqual({ attention: 0.95, cheats: 'never', hunchAt: 3, hunchChance: 0.3, moody: false })
    expect(TRAITS.sly).toEqual({ attention: 0.6, cheats: 'careful', hunchAt: null, hunchChance: 0, moody: false })
    expect(TRAITS.wild).toEqual({ attention: 0.35, cheats: 'reckless', hunchAt: 2, hunchChance: 0.03, moody: true })
    expect(HONEST).toEqual({ persona: 'straight', salt: 0 })
  })
})
