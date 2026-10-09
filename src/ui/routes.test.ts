import { describe, expect, test } from 'vitest'
import { cleanCode, gamePath, opensInPlace, practicePath, roomPath, route, rulesPath, rulesQuery } from './routes'

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

  test('a game’s house rules have their own screen, matched before a room code', () => {
    expect(route('/thunee/rules')).toEqual({ screen: 'rules', game: 'thunee' })
    expect(route('/thunee/rules/')).toEqual({ screen: 'rules', game: 'thunee' })
    expect(route('/hearts/rules')).toEqual({ screen: 'rules', game: 'hearts' })
    // The query is the screen's, not the route's.
    expect(route(new URL('https://x.example/thunee/rules?preset=x').pathname)).toEqual({ screen: 'rules', game: 'thunee' })
    // Typed as a code it has five letters, so it leads to the game's home, as it always did.
    expect(route('/thunee/RULES')).toEqual({ screen: 'home', game: 'thunee' })
    expect(route('/thunee/rules/extra')).toEqual({ screen: 'tricks' })
  })

  test('the rules screen’s address is built the way it is read', () => {
    expect(rulesPath('thunee')).toBe('/thunee/rules')
    expect(rulesPath('thunee', { preset: 'x' })).toBe('/thunee/rules?preset=x')
    expect(rulesPath('hearts', { shared: 'abc-_', from: 'QWERTY' })).toBe('/hearts/rules?rules=abc-_&from=QWERTY')
    expect(route(new URL(rulesPath('thunee', { preset: 'p-1' }), 'https://x.example').pathname)).toEqual({ screen: 'rules', game: 'thunee' })
    expect(rulesQuery('?preset=x')).toEqual({ preset: 'x', shared: undefined, from: undefined })
    expect(rulesQuery(new URL(rulesPath('thunee', { preset: 'p 1&2', shared: 'code', from: 'QWERTY' }), 'https://x.example').search)).toEqual({
      preset: 'p 1&2',
      shared: 'code',
      from: 'QWERTY',
    })
    // A room to go back to is a room code, cleaned as one; anything else is ignored.
    expect(rulesQuery('?from=qwerty').from).toBe('QWERTY')
    expect(rulesQuery('?from=abc').from).toBeUndefined()
    expect(rulesQuery('')).toEqual({ preset: undefined, shared: undefined, from: undefined })
  })

  test('a segment is read like a typed code: letters only, upper-cased, the first six kept', () => {
    expect(route('/thunee/ABCDEFG')).toEqual({ screen: 'room', game: 'thunee', code: 'ABCDEF' })
    expect(route('/thunee/ab-cd%20ef')).toEqual({ screen: 'room', game: 'thunee', code: 'ABCDEF' })
    expect(route('/thunee/A1B2C3D4E5F6G7')).toEqual({ screen: 'room', game: 'thunee', code: 'ABCDEF' })
  })

  test('a segment with fewer than six letters leads back to the game’s home', () => {
    expect(route('/thunee/ABC')).toEqual({ screen: 'home', game: 'thunee' })
    expect(route('/thunee/AB12CD34E')).toEqual({ screen: 'home', game: 'thunee' })
  })

  test('old addresses and unknown games show the Tricks home', () => {
    for (const path of ['/game/ABCDEF', '/practice', '/spades', '/spades/ABCDEF', '/thunee/ABCDEF/extra', '/constructor']) {
      expect(route(path)).toEqual({ screen: 'tricks' })
    }
  })

  test('every listed game has a home, rooms and practice', () => {
    expect(route('/hearts')).toEqual({ screen: 'home', game: 'hearts' })
    expect(route('/hearts/qwerty')).toEqual({ screen: 'room', game: 'hearts', code: 'QWERTY' })
    expect(route('/hearts/practice')).toEqual({ screen: 'practice', game: 'hearts' })
    expect(route(roomPath('hearts', 'ABCDEF'))).toEqual({ screen: 'room', game: 'hearts', code: 'ABCDEF' })
  })

  test('paths are built the way they are read', () => {
    expect(gamePath('thunee')).toBe('/thunee')
    expect(roomPath('thunee', 'ABCDEF')).toBe('/thunee/ABCDEF')
    expect(practicePath('thunee')).toBe('/thunee/practice')
    expect(practicePath('thunee', 4)).toBe('/thunee/practice?players=4')
    expect(route(roomPath('thunee', 'QWERTY'))).toEqual({ screen: 'room', game: 'thunee', code: 'QWERTY' })
    expect(route(practicePath('thunee'))).toEqual({ screen: 'practice', game: 'thunee' })
  })

  test('only a plain primary click on a link navigates in place', () => {
    const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false }
    expect(opensInPlace(plain)).toBe(true)
    for (const modified of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) {
      expect(opensInPlace({ ...plain, ...modified })).toBe(false)
    }
  })

  test('room codes are letters only, upper-cased', () => {
    expect(cleanCode(' ab-cd ef9g ')).toBe('ABCDEF')
  })
})
