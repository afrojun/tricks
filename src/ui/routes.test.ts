import { describe, expect, test } from 'vitest'
import { cleanCode, gamePath, practicePath, roomPath, route } from './routes'

describe('routes', () => {
  test('the root is the Tricks home', () => {
    expect(route('/')).toEqual({ screen: 'tricks' })
  })

  test('a game’s path is its home', () => {
    expect(route('/thunee')).toEqual({ screen: 'home', game: 'thunee' })
    expect(route('/thunee/')).toEqual({ screen: 'home', game: 'thunee' })
  })

  test('a code under a game is a room, whatever its case', () => {
    expect(route('/thunee/ABCDEF')).toEqual({ screen: 'room', game: 'thunee', code: 'ABCDEF' })
    expect(route('/thunee/abcdef/')).toEqual({ screen: 'room', game: 'thunee', code: 'ABCDEF' })
  })

  test('practice is matched before a room code', () => {
    expect(route('/thunee/practice')).toEqual({ screen: 'practice', game: 'thunee' })
    expect(route('/thunee/practice/')).toEqual({ screen: 'practice', game: 'thunee' })
  })

  test('a code that is not six letters leads back to the game’s home', () => {
    expect(route('/thunee/ABC')).toEqual({ screen: 'home', game: 'thunee' })
  })

  test('old addresses and unknown games show the Tricks home', () => {
    for (const path of ['/game/ABCDEF', '/practice', '/hearts', '/hearts/ABCDEF', '/thunee/ABCDEF/extra']) {
      expect(route(path)).toEqual({ screen: 'tricks' })
    }
  })

  test('paths are built the way they are read', () => {
    expect(gamePath('thunee')).toBe('/thunee')
    expect(roomPath('thunee', 'ABCDEF')).toBe('/thunee/ABCDEF')
    expect(practicePath('thunee')).toBe('/thunee/practice')
    expect(practicePath('thunee', 4)).toBe('/thunee/practice?players=4')
    expect(route(roomPath('thunee', 'QWERTY'))).toEqual({ screen: 'room', game: 'thunee', code: 'QWERTY' })
    expect(route(practicePath('thunee'))).toEqual({ screen: 'practice', game: 'thunee' })
  })

  test('room codes are letters only, upper-cased', () => {
    expect(cleanCode(' ab-cd ef9g ')).toBe('ABCDEF')
  })
})
