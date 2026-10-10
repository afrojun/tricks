import { describe, expect, test } from 'vitest'
import { otherTeam, partnerOf, teamOf } from './partners'

describe('partners', () => {
  test('at four, seats 0 and 2 play seats 1 and 3', () => {
    expect([0, 1, 2, 3].map(teamOf)).toEqual([0, 1, 0, 1])
    expect([0, 1, 2, 3].map((s) => partnerOf(s, 4))).toEqual([2, 3, 0, 1])
    expect(otherTeam(0)).toBe(1)
    expect(otherTeam(1)).toBe(0)
  })

  test('at two or three, nobody has a partner', () => {
    expect(partnerOf(0, 2)).toBeNull()
    expect(partnerOf(2, 3)).toBeNull()
  })
})
