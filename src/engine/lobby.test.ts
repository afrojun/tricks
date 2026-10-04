import { describe, expect, test } from 'vitest'
import { apply, createGame } from './apply'
import { canStart } from './available'
import { CLASSIC_APP, CLASSIC_APP_OVERRIDES, TRADITIONAL } from './rules'
import { Table, deepFreeze, seededRng } from './testing'
import { type Action, type Actor, type Game, PERSONAS, type RoundSummary } from './types'
import { viewFor } from './view'

const ctx = { now: 0, rng: seededRng(1) }
const run = (game: Game, actor: Actor, action: Action) => {
  const result = apply(deepFreeze(game), actor, action, ctx)
  if ('rejected' in result) throw new Error(result.rejected)
  return result.game
}
const reject = (game: Game, actor: Actor, action: Action) => {
  const result = apply(game, actor, action, ctx)
  return 'rejected' in result ? result.rejected : null
}

describe('lobby', () => {
  test('the first player to sit becomes host', () => {
    const game = run(createGame(), null, { type: 'sit', seat: 2, name: 'Asha' })
    expect(game.host).toBe(2)
    expect(game.seats[2]).toMatchObject({ name: 'Asha', kind: 'human', connected: true })
  })

  test('a taken seat, a bad seat and an already seated player are rejected', () => {
    const game = run(createGame(), null, { type: 'sit', seat: 0, name: 'A' })
    expect(reject(game, null, { type: 'sit', seat: 0, name: 'B' })).toBe('seatTaken')
    expect(reject(game, null, { type: 'sit', seat: 7, name: 'B' })).toBe('badSeat')
    expect(reject(game, 0, { type: 'sit', seat: 1, name: 'A' })).toBe('alreadySeated')
  })

  test('names are trimmed, collapsed and capped at 16 characters; empty names are rejected', () => {
    const game = run(createGame(), null, { type: 'sit', seat: 0, name: `   Very   ${'x'.repeat(200)}  ` })
    expect(game.seats[0].name).toBe('Very xxxxxxxxxxx')
    expect(game.seats[0].name.length).toBe(16)
    expect(reject(createGame(), null, { type: 'sit', seat: 0, name: '   \n\t ' })).toBe('badName')
    expect(reject(game, 0, { type: 'rename', name: '' })).toBe('badName')
    expect(run(game, 0, { type: 'rename', name: ' Bheki ' }).seats[0].name).toBe('Bheki')
  })

  test('only the host may add AI, clear seats, set rules, set player count or start', () => {
    let game = run(createGame(), null, { type: 'sit', seat: 0, name: 'Host' })
    game = run(game, null, { type: 'sit', seat: 1, name: 'Guest' })
    const hostOnly: Action[] = [
      { type: 'addAi', seat: 2 },
      { type: 'clearSeat', seat: 0 },
      { type: 'setRules', overrides: {} },
      { type: 'setPlayerCount', playerCount: 2 },
      { type: 'start' },
    ]
    for (const action of hostOnly) expect(reject(game, 1, action)).toBe('notHost')
    for (const action of hostOnly) expect(reject(game, null, action)).toBe('notSeated')
  })

  test('start is rejected until every seat is filled', () => {
    let game = run(createGame(), null, { type: 'sit', seat: 0, name: 'Host' })
    expect(reject(game, 0, { type: 'start' })).toBe('seatsNotFilled')
    expect(canStart(viewFor(game, 0))).toBe(false)
    for (const seat of [1, 2, 3]) game = run(game, 0, { type: 'addAi', seat })
    expect(new Set(game.seats.map((s) => s.name)).size).toBe(4)
    expect(canStart(viewFor(game, 0))).toBe(true)
    game = run(game, 0, { type: 'start' })
    expect(game.phase.kind).toBe('calling')
    expect(game.roundNumber).toBe(1)
  })

  test('the host sets rules, which are frozen into the game', () => {
    let game = run(createGame(), null, { type: 'sit', seat: 0, name: 'Host' })
    expect(game.rules).toEqual(TRADITIONAL)
    game = run(game, 0, { type: 'setRules', overrides: CLASSIC_APP_OVERRIDES })
    expect(game.rules).toEqual(CLASSIC_APP)
    const started = new Table(4, CLASSIC_APP_OVERRIDES).do(0, { type: 'start' }).game
    expect(reject(started, 0, { type: 'setRules', overrides: {} })).toBe('wrongPhase')
  })

  test('shrinking to two players is rejected while seat 2 or 3 is occupied', () => {
    let game = run(createGame(), null, { type: 'sit', seat: 0, name: 'Host' })
    game = run(game, 0, { type: 'addAi', seat: 3 })
    expect(reject(game, 0, { type: 'setPlayerCount', playerCount: 2 })).toBe('seatTaken')
    game = run(game, 0, { type: 'clearSeat', seat: 3 })
    game = run(game, 0, { type: 'setPlayerCount', playerCount: 2 })
    expect(game.seats).toHaveLength(2)
    expect(run(game, 0, { type: 'setPlayerCount', playerCount: 4 }).seats).toHaveLength(4)
  })

  test('host passes to the next connected human when the host disconnects or leaves', () => {
    let game = run(createGame(), null, { type: 'sit', seat: 0, name: 'A' })
    game = run(game, null, { type: 'sit', seat: 1, name: 'B' })
    game = run(game, null, { type: 'sit', seat: 2, name: 'C' })
    const afterDrop = run(game, 'system', { type: 'setConnected', seat: 0, connected: false })
    expect(viewFor(afterDrop, 1).host).toBe(1)
    const afterLeave = run(game, 0, { type: 'leaveSeat' })
    expect(afterLeave.host).toBe(1)
    expect(afterLeave.seats[0].kind).toBe('empty')
    // A lone host who disconnects keeps the role.
    const solo = run(createGame(), null, { type: 'sit', seat: 0, name: 'A' })
    expect(viewFor(run(solo, 'system', { type: 'setConnected', seat: 0, connected: false }), 0).host).toBe(0)
  })

  test('players cannot send system actions', () => {
    const game = run(createGame(), null, { type: 'sit', seat: 0, name: 'A' })
    expect(reject(game, 0, { type: 'tick' })).toBe('notAllowed')
    expect(reject(game, 0, { type: 'setConnected', seat: 0, connected: false })).toBe('notAllowed')
  })

  test('apply never mutates its input', () => {
    const game = deepFreeze(new Table().game)
    expect(() => apply(game, 0, { type: 'start' }, ctx)).not.toThrow()
    expect(game.phase.kind).toBe('lobby')
  })
})

describe('computer personas', () => {
  const hosted = () => run(createGame(), null, { type: 'sit', seat: 0, name: 'Host' })

  test('a computer is Straight unless the host picks another persona', () => {
    let game = run(hosted(), 0, { type: 'addAi', seat: 1 })
    game = run(game, 0, { type: 'addAi', seat: 2, persona: 'sly' })
    expect(game.seats[1]).toMatchObject({ kind: 'ai', persona: 'straight', personaHidden: false })
    expect(game.seats[2]).toMatchObject({ kind: 'ai', persona: 'sly', personaHidden: false })
    expect(game.seats[0]).toMatchObject({ kind: 'human', persona: 'straight', personaHidden: false })
    expect(viewFor(game, 0).seats[2].persona).toBe('sly')
  })

  test('a surprise persona is drawn at random and hidden from every view until the game is over', () => {
    const game = run(hosted(), 0, { type: 'addAi', seat: 1, persona: 'surprise' })
    expect(PERSONAS).toContain(game.seats[1].persona)
    expect(game.seats[1].personaHidden).toBe(true)
    for (const seat of [0, 1, null]) expect(viewFor(game, seat).seats[1].persona).toBeNull()
    const over: Game = { ...game, phase: { kind: 'gameOver', winner: 0, summary: {} as RoundSummary } }
    expect(viewFor(over, 0).seats[1].persona).toBe(game.seats[1].persona)
  })

  test('a surprise persona revealed at game over stays revealed after a rematch', () => {
    let game = run(hosted(), 0, { type: 'addAi', seat: 1, persona: 'surprise' })
    for (const seat of [2, 3]) game = run(game, 0, { type: 'addAi', seat })
    const over: Game = { ...game, phase: { kind: 'gameOver', winner: 0, summary: {} as RoundSummary } }
    const again = run(over, 0, { type: 'rematch' })
    expect(again.phase.kind).toBe('calling')
    expect(again.seats[1].personaHidden).toBe(false)
    for (const seat of [0, 1, null]) expect(viewFor(again, seat).seats[1].persona).toBe(game.seats[1].persona)
  })
})
