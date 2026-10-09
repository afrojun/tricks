import { describe, expect, test } from 'vitest'
import type { Showing } from '../../client/talk'
import { againVoters, heard, listNames, menuChoices, sayKey } from './choices'

const play = { reactions: true, waitedOn: false, over: false }

describe("the menu on a player's name", () => {
  test('offers the five throws at that player, the nudge only while the table waits on them', () => {
    const choices = menuChoices(0, 2, play)
    expect(choices.map((c) => c.say)).toEqual(['chappal', 'rose', 'tomato', 'chip', 'nudge'].map((id) => ({ kind: 'throw', id, at: 2 })))
    expect(choices.filter((c) => !c.enabled).map((c) => c.say.kind === 'throw' && c.say.id)).toEqual(['nudge'])
    expect(menuChoices(0, 2, { ...play, waitedOn: true }).every((c) => c.enabled)).toBe(true)
  })

  test('holds only the kind things at game over', () => {
    expect(menuChoices(0, 1, { ...play, over: true }).map((c) => c.say)).toEqual([
      { kind: 'emote', id: 'clap' },
      { kind: 'throw', id: 'chip', at: 1 },
      { kind: 'throw', id: 'rose', at: 1 },
      { kind: 'line', id: 'lekker' },
    ])
  })

  test('offers nothing with reactions off, to a spectator, or on your own name', () => {
    expect(menuChoices(0, 1, { ...play, reactions: false })).toEqual([])
    expect(menuChoices(null, 1, play)).toEqual([])
    expect(menuChoices(1, 1, play)).toEqual([])
  })
})

test('each thing said has its own key, a throw by its target too', () => {
  const keys = [
    sayKey({ kind: 'line', id: 'yoh' }),
    sayKey({ kind: 'emote', id: 'clap' }),
    sayKey({ kind: 'throw', id: 'rose', at: 1 }),
    sayKey({ kind: 'throw', id: 'rose', at: 2 }),
  ]
  expect(new Set(keys).size).toBe(keys.length)
})

describe('what is heard here', () => {
  const showing: Showing[] = [
    { key: 1, seat: 1, say: { kind: 'line', id: 'eish' } },
    { key: 2, seat: 2, say: { kind: 'throw', id: 'tomato', at: 0 } },
    { key: 3, seat: 0, say: { kind: 'emote', id: 'fire' } },
  ]

  test('is everything, until someone is muted', () => {
    expect(heard(showing, true, new Set())).toBe(showing)
  })

  test("drops a muted player's lines and throws", () => {
    expect(heard(showing, true, new Set([2])).map((s) => s.key)).toEqual([1, 3])
  })

  test('is nothing with reactions off, your own included', () => {
    expect(heard(showing, false, new Set())).toEqual([])
  })
})

test('names are listed as a sentence says them', () => {
  expect(listNames([])).toBe('')
  expect(listNames(['Asha'])).toBe('Asha')
  expect(listNames(['Asha', 'Devi'])).toBe('Asha and Devi')
  expect(listNames(['Asha', 'Chan', 'Devi'])).toBe('Asha, Chan and Devi')
})

test('Again waits on every person at the table who is not away', () => {
  const seat = (kind: 'empty' | 'human' | 'ai', connected = true, standIn = false) => ({ kind, connected, standIn })
  expect(againVoters([seat('human'), seat('ai'), seat('human', false), seat('human', true, true), seat('empty', false), seat('human')])).toEqual([0, 5])
})
