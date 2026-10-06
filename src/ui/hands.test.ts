import { describe, expect, test } from 'vitest'
import { NO_PICKS, type Picks, fanTilt, pickFrom, pickedFrom, togglePick } from './hands'

const card = (rank: string, suit: 'hearts' | 'spades' = 'spades') => ({ rank, suit })

describe('the fan of a hand', () => {
  test('leans each card four degrees from the next, up to six cards', () => {
    for (let count = 1; count <= 6; count++) {
      for (let i = 0; i < count; i++) expect(fanTilt(i, count)).toBe((i - (count - 1) / 2) * 4)
    }
  })

  test('closes up for more cards, so thirteen lean no further than six', () => {
    expect(fanTilt(0, 13)).toBeCloseTo(-10)
    expect(fanTilt(12, 13)).toBeCloseTo(10)
    expect(fanTilt(6, 13)).toBe(0)
    for (let i = 0; i < 13; i++) expect(Math.abs(fanTilt(i, 13))).toBeLessThanOrEqual(10)
  })
})

describe('picking cards', () => {
  test('a tap picks a card, and another tap puts it back', () => {
    const picked = togglePick([], card('Q'), 3)
    expect(picked).toEqual([card('Q')])
    expect(togglePick(picked, card('Q'), 3)).toEqual([])
  })

  test('keeps the order cards were picked in', () => {
    const picked = [card('Q'), card('A', 'hearts')].reduce((p, c) => togglePick(p, c, 3), [] as { rank: string; suit: 'hearts' | 'spades' }[])
    expect(togglePick(picked, card('K'), 3)).toEqual([card('Q'), card('A', 'hearts'), card('K')])
    expect(togglePick([card('Q'), card('A', 'hearts'), card('K')], card('A', 'hearts'), 3)).toEqual([card('Q'), card('K')])
  })

  test('a card past the limit is not picked', () => {
    const full = [card('Q'), card('K'), card('A')]
    expect(togglePick(full, card('2', 'hearts'), 3)).toEqual(full)
  })

  test('never changes what it was given', () => {
    const picked = Object.freeze([card('Q')])
    togglePick(picked, card('K'), 3)
    togglePick(picked, card('Q'), 3)
    expect(picked).toEqual([card('Q')])
  })
})

describe('cards picked from a hand', () => {
  type C = ReturnType<typeof card>
  const hand = [card('Q'), card('K'), card('A'), card('2', 'hearts')]

  test('stay picked while the hand they were picked from is held, in any order', () => {
    const picks = [card('Q'), card('A')].reduce<Picks<C>>((p, c) => pickFrom(p, hand, c, 3), NO_PICKS)
    expect(pickedFrom(picks, hand)).toEqual([card('Q'), card('A')])
    expect(pickedFrom(picks, [...hand].reverse())).toEqual([card('Q'), card('A')])
  })

  test('are gone once that hand is: a new deal, or a new game', () => {
    const picks = [card('Q'), card('K'), card('A')].reduce<Picks<C>>((p, c) => pickFrom(p, hand, c, 3), NO_PICKS)
    const next = [card('Q'), card('K'), card('3', 'hearts'), card('2', 'hearts')]
    expect(pickedFrom(picks, next)).toEqual([])
    expect(pickedFrom(picks, hand.slice(0, 3))).toEqual([])
    // Picking from the new hand starts afresh, not from the old picks.
    expect(pickedFrom(pickFrom(picks, next, card('3', 'hearts'), 3), next)).toEqual([card('3', 'hearts')])
  })
})
