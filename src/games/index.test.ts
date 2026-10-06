import { describe, expect, test } from 'vitest'
import { GAMES, gameOf, isRoomName } from '.'
import { checkMalformed } from '../kit/contract'
import { hearts } from './hearts'
import { thunee } from './thunee'

describe('the list of games', () => {
  test('holds every game under its own id', () => {
    expect([...GAMES.keys()]).toEqual(['thunee', 'hearts'])
    for (const [id, module] of GAMES) expect(module.id).toBe(id)
    expect(GAMES.get('thunee')).toBe(thunee)
    expect(GAMES.get('hearts')).toBe(hearts)
  })

  test('a room named by a known game and a six-letter code holds that game', () => {
    expect(gameOf('thunee-ABCDEF')).toBe(thunee)
    expect(gameOf('hearts-QWERTY')).toBe(hearts)
    expect(isRoomName('thunee-ABCDEF')).toBe(true)
    expect(isRoomName('hearts-ABCDEF')).toBe(true)
  })

  test('any other name holds no game', () => {
    for (const name of [
      'thunee-ABCDE',
      'thunee-ABCDEFG',
      'thunee-abcdef',
      'thunee_ABCDEF',
      'hearts-ABC123',
      'spades-ABCDEF',
      'constructor-ABCDEF',
      'toString-ABCDEF',
      '-ABCDEF',
      'ABCDEF',
      'SIM123',
      'main',
      '',
    ]) {
      expect(gameOf(name), name).toBeNull()
      expect(isRoomName(name), name).toBe(false)
    }
  })
})

describe('every game in the list', () => {
  /** The phases each game's computers reach in a first round, playing every seat. */
  const PHASES: Record<string, string[]> = {
    thunee: ['calling', 'trumpSelection', 'thuneeWindow', 'playing', 'trickPause', 'roundResult'],
    hearts: ['passing', 'playing', 'trickPause', 'roundResult'],
  }

  for (const [id, module] of GAMES) {
    test(`${id} never throws on a malformed action, from anyone at the table or not, in any phase`, () => {
      const covered = checkMalformed(module)
      expect(covered[0]).toBe('an empty lobby')
      for (const count of module.seatCounts) {
        expect(covered).toContain(`a full lobby of ${count}`)
        for (const phase of PHASES[id]) expect(covered).toContain(`${phase} with ${count}`)
      }
    }, 60_000)
  }
})
