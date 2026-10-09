import { describe, expect, test } from 'vitest'
import type { Persona } from './mind'
import { type Moment, answerThrow, banterFor, saySchema } from './talk'

const table = (kinds: ('human' | 'ai')[], persona: Persona = 'straight', allowCheating = true) => ({ seats: kinds.map((kind) => ({ kind, persona })), rules: { allowCheating } })
const always = () => 0
const never = () => 0.999

describe('what may be said', () => {
  test('only the known ids, and a throw only with a seat to land on', () => {
    expect(saySchema.safeParse({ kind: 'line', id: 'yoh' }).success).toBe(true)
    expect(saySchema.safeParse({ kind: 'emote', id: 'howl' }).success).toBe(true)
    expect(saySchema.safeParse({ kind: 'throw', id: 'chappal', at: 2 }).success).toBe(true)
    expect(saySchema.safeParse({ kind: 'line', id: 'hello' }).success).toBe(false)
    expect(saySchema.safeParse({ kind: 'throw', id: 'chappal' }).success).toBe(false)
    expect(saySchema.safeParse({ kind: 'throw', id: 'chappal', at: -1 }).success).toBe(false)
    expect(saySchema.safeParse({ kind: 'text', id: 'anything' }).success).toBe(false)
  })
})

describe('banter', () => {
  const moments: Moment[] = [{ kind: 'gameWon', winners: [0, 2] }]

  test('only real computers speak: never a person, nor a stand-in, which is a person’s seat', () => {
    expect(banterFor(table(['human', 'ai', 'human', 'ai']), moments, always)).toEqual([])
    expect(banterFor(table(['human', 'ai', 'ai', 'ai']), moments, always)).toEqual([{ seat: 2, say: { kind: 'line', id: 'lekker' } }])
  })

  test('rarely: a moment may pass in silence', () => {
    expect(banterFor(table(['ai', 'ai', 'ai', 'ai']), moments, never)).toEqual([])
  })

  test('a computer says one thing at a time', () => {
    const both: Moment[] = [
      { kind: 'bigTrick', seat: 1 },
      { kind: 'scored', up: [1, 3], down: [0, 2] },
    ]
    const said = banterFor(table(['ai', 'ai', 'ai', 'ai']), both, always)
    expect(new Set(said.map((s) => s.seat)).size).toBe(said.length)
  })

  test('caught: the table laughs and the guilty one groans', () => {
    const said = banterFor(table(['ai', 'ai', 'ai', 'ai']), [{ kind: 'caught', challenger: 0, accused: 1 }], always)
    expect(said).toContainEqual({ seat: 1, say: { kind: 'line', id: 'eish' } })
    expect(said.some((s) => s.seat !== 1 && s.say.kind === 'line' && s.say.id === 'laugh')).toBe(true)
  })

  test('a moody computer that is behind groans twice as readily', () => {
    const half = () => 0.5
    const stung: Moment[] = [{ kind: 'stung', seat: 0 }]
    expect(banterFor(table(['ai'], 'wild'), stung, half, () => false)).toEqual([])
    expect(banterFor(table(['ai'], 'wild'), stung, half, () => true)).toHaveLength(1)
    expect(banterFor(table(['ai'], 'straight'), stung, half, () => true)).toEqual([])
  })

  test('with cheating off every computer is Straight, moods and all', () => {
    expect(banterFor(table(['ai'], 'wild', false), [{ kind: 'stung', seat: 0 }], () => 0.5, () => true)).toEqual([])
  })
})

describe('answering a throw', () => {
  test('a computer answers now and then, after the throw lands; a person never, by the table’s hand', () => {
    expect(answerThrow(table(['human', 'ai']), 1, 'chappal', always)).toEqual({ seat: 1, say: { kind: 'line', id: 'haibo' }, after: 600 })
    expect(answerThrow(table(['human', 'ai']), 1, 'rose', always)?.say).toEqual({ kind: 'line', id: 'lekker' })
    expect(answerThrow(table(['human', 'ai']), 1, 'chappal', never)).toBeNull()
    expect(answerThrow(table(['ai', 'human']), 1, 'chappal', always)).toBeNull()
    expect(answerThrow(table(['human', 'ai']), 1, 'nudge', always)).toBeNull()
  })
})
