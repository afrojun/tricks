import { describe, expect, test } from 'vitest'
import { partnersLine, place, playersLabel, seatLabel, teamsAt } from './seats'

describe('where seats sit', () => {
  test('counterclockwise, the next seat is on the viewer’s right', () => {
    expect([0, 1, 2, 3].map((seat) => place(seat, 0, 4, 'counterclockwise'))).toEqual(['bottom', 'right', 'top', 'left'])
  })

  test('clockwise, the next seat is on the viewer’s left', () => {
    expect([0, 1, 2, 3].map((seat) => place(seat, 0, 4, 'clockwise'))).toEqual(['bottom', 'left', 'top', 'right'])
  })

  test('the viewer is always at the bottom, whichever seat they hold', () => {
    expect([0, 1, 2, 3].map((seat) => place(seat, 2, 4, 'counterclockwise'))).toEqual(['top', 'left', 'bottom', 'right'])
    expect([0, 1, 2, 3].map((seat) => place(seat, 3, 4, 'clockwise'))).toEqual(['left', 'top', 'right', 'bottom'])
  })

  test('two players face each other, either way round', () => {
    for (const direction of ['clockwise', 'counterclockwise'] as const) {
      expect([0, 1].map((seat) => place(seat, 0, 2, direction))).toEqual(['bottom', 'top'])
      expect([0, 1].map((seat) => place(seat, 1, 2, direction))).toEqual(['top', 'bottom'])
    }
  })
})

describe('teams in the lobby', () => {
  const pairs = teamsAt((seat) => seat % 2, 4)
  const alone = teamsAt((seat) => seat % 2, 2)
  const none = teamsAt(() => null, 4)

  test('each seat’s team, as the game numbers it', () => {
    expect(pairs).toEqual([0, 1, 0, 1])
    expect(alone).toEqual([0, 1])
    expect(none).toEqual([null, null, null, null])
  })

  test('a seat with a partner shows its team; a team of one, or no team, is a player', () => {
    expect([0, 1, 2, 3].map((seat) => seatLabel(seat, pairs))).toEqual(['Team 1', 'Team 2', 'Team 1', 'Team 2'])
    expect([0, 1].map((seat) => seatLabel(seat, alone))).toEqual(['Player 1', 'Player 2'])
    expect([0, 1, 2, 3].map((seat) => seatLabel(seat, none))).toEqual(['Player 1', 'Player 2', 'Player 3', 'Player 4'])
  })

  test('partners are named only where there are partners', () => {
    expect(partnersLine(pairs)).toBe('Partners sit opposite: seats 1 and 3 play seats 2 and 4.')
    expect(partnersLine([0, 0, 1, 1])).toBe('Partners: seats 1 and 2 play seats 3 and 4.')
    expect(partnersLine(alone)).toBeNull()
    expect(partnersLine(none)).toBeNull()
  })

  test('a table size is named, with its pairs', () => {
    expect(playersLabel(pairs)).toBe('Four, in pairs')
    expect(playersLabel(alone)).toBe('Two')
    expect(playersLabel(none)).toBe('Four')
  })
})
