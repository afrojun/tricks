import { describe, expect, test } from 'vitest'
import { canStart } from '../../../kit/table'
import { apply, createGame } from './apply'
import { TRADITIONAL, TUSCANS_OVERRIDES, resolveRules } from './rules'
import { actionSchema } from './schema'
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
    game = run(game, 0, { type: 'setRules', overrides: TUSCANS_OVERRIDES })
    expect(game.rules).toEqual(resolveRules(TUSCANS_OVERRIDES))
    const started = new Table(4, TUSCANS_OVERRIDES).do(0, { type: 'start' }).game
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

  test('a message that is not an action is refused, never thrown, in the lobby and in play', () => {
    const lobby = run(createGame(), null, { type: 'sit', seat: 0, name: 'A' })
    const playing = new Table(4, { redealIfNoTrumps: false }).do(0, { type: 'start' }).game
    const junk = [null, undefined, 3, 'start', true, [], {}, { type: 7 }, { type: null }, { kind: 'start' }]
    for (const game of [lobby, playing]) {
      for (const actor of [0, null, 'system'] as const) {
        for (const value of junk) expect(reject(game, actor, value as unknown as Action)).toBe('notAllowed')
      }
    }
  })

  test('an action with a missing, null or wrong-typed field is refused, never thrown, and changes nothing', () => {
    // Every action a player may send, with payloads its fields must refuse. An action with no fields has none to break.
    const BAD: Record<string, object[]> = {
      sit: [{ seat: null, name: 'A' }, { seat: 1, name: null }, { seat: '1', name: 'A' }, { seat: 1 }],
      leaveSeat: [],
      rename: [{ name: null }, { name: 5 }, {}],
      addAi: [{ seat: null }, { seat: '1' }, { seat: 1, persona: 'evil' }, { seat: 1, persona: 5 }],
      setPersona: [{ seat: 1 }, { seat: null, persona: 'sly' }, { seat: 1, persona: 'evil' }],
      clearSeat: [{ seat: null }, { seat: 'x' }],
      setPlayerCount: [{ playerCount: null }, { playerCount: '2' }],
      start: [],
      replaceWithAi: [{ seat: null }, { seat: '2' }, {}],
      reclaimSeat: [],
      setRules: [{ overrides: null }, { overrides: 'x' }, {}, { overrides: { ballsToWin: 'x' } }, { overrides: { allowCheating: 'no' } }],
      call: [{ amount: null }, { amount: '10' }, {}],
      pass: [],
      preselectTrump: [{ choice: null }, { choice: 'stars' }, { choice: 5 }],
      chooseTrump: [{ choice: null }, { choice: 'stars' }, {}],
      callThunee: [],
      playCard: [{ card: null }, {}, { card: 'Jh' }, { card: { suit: 'stars', rank: 'J' } }, { card: { suit: 'hearts' } }, { card: { suit: 'clubs', rank: 10 } }],
      claimJodhi: [{ suit: null, withJack: false }, { suit: 'spades' }, { suit: 'spades', withJack: 'yes' }, { suit: 'stars', withJack: false }],
      callDouble: [],
      callKhanaak: [],
      challengePlay: [{ seat: null }, { seat: '1' }, {}],
      challengeJodhi: [{ claim: null }, { claim: '0' }, {}],
      challengeThunee: [],
      nextRound: [],
      rematch: [],
    }
    expect(Object.keys(BAD).sort()).toEqual(actionSchema.options.map((o) => o.shape.type.value).sort())

    const D1 = ['Jh 9h Ks Qs 10c Qd', 'Js 9s As 10s Kd Qc', 'Jc 9c Ac Kc Ah 10h', 'Jd 9d Ad 10d Kh Qh']
    const dealt = () => new Table(4, { redealIfNoTrumps: false }).deal(D1)
    const playing = () => dealt().toPlay('spades')
    const ended = playing()
    ended.game = { ...ended.game, balls: [0, 11] }
    const games: Game[] = [
      run(createGame(), null, { type: 'sit', seat: 0, name: 'A' }),
      new Table().game,
      dealt().game,
      dealt().advance(10_000).game,
      dealt().advance(10_000).do(1, { type: 'chooseTrump', choice: 'spades' }).game,
      playing().play('Jc Qh').game, // seat 0 to play, holding a card it may not play
      playing().play('Jc Qh 10c Qc').do(0, { type: 'claimJodhi', suit: 'spades', withJack: false }).game,
      playing().do('system', { type: 'setConnected', seat: 2, connected: false }).game,
      playing().do('system', { type: 'setConnected', seat: 2, connected: false }).do(0, { type: 'replaceWithAi', seat: 2 }).game,
      playing().play('Jc Qh 10c Qc  9c Kh Qd 10s  Js 10h 10d Qs  9s Ah Ad Ks  As Ac 9d 9h  Kd Kc Jd Jh').endPause().game,
      ended.play('Jc Qh 10c Qc  9c Kh Qd 10s  Js 10h 10d Qs  9s Ah Ad Ks  As Ac 9d 9h  Kd Kc Jd Jh').endPause().game,
    ]
    for (const game of games) {
      deepFreeze(game)
      for (const [type, payloads] of Object.entries(BAD)) {
        for (const payload of payloads) {
          for (const actor of [0, 1, 2, 3, null] as const) {
            const action = { type, ...payload } as unknown as Action
            expect(apply(game, actor, action, ctx), `${JSON.stringify(action)} by ${actor} in ${game.phase.kind}`).toEqual({ rejected: 'notAllowed' })
          }
        }
      }
    }
  })

  test('a rule override of the right type is the engine’s to judge, whatever the wire’s bounds', () => {
    const game = deepFreeze(run(run(createGame(), null, { type: 'sit', seat: 0, name: 'Host' }), null, { type: 'sit', seat: 1, name: 'Guest' }))
    // Outside the bounds a share link or the room would accept, but of the right type: stored as sent, as before.
    const odd = { ballsToWin: 31, twoPlayerTarget: 1000, callTimerSeconds: 1, thuneeWindowSeconds: 0.5, thuneePartnerCatchBalls: 0 }
    expect(run(game, 0, { type: 'setRules', overrides: odd }).rules).toEqual({ ...TRADITIONAL, ...odd })
    expect(reject(game, 1, { type: 'setRules', overrides: odd })).toBe('notHost')
    expect(reject(game, null, { type: 'setRules', overrides: odd })).toBe('notSeated')
    const started = deepFreeze(new Table(4).do(0, { type: 'start' }).game)
    expect(reject(started, 0, { type: 'setRules', overrides: odd })).toBe('wrongPhase')
    // Of the wrong type: refused before anything reads it.
    for (const overrides of [{ ballsToWin: 'x' }, { double: 1 }, { thuneeCaller: 'nobody' }, null, 'x', 5]) {
      for (const g of [game, started]) {
        expect(apply(g, 0, { type: 'setRules', overrides } as unknown as Action, ctx)).toEqual({ rejected: 'notAllowed' })
      }
    }
  })

  test('the system’s own actions are not held to the players’ schema', () => {
    const t = new Table(4, { redealIfNoTrumps: false }).do(0, { type: 'start' })
    t.do('system', { type: 'setConnected', seat: 2, connected: false })
    expect(t.game.seats[2].connected).toBe(false)
    t.advance(10_000)
    expect(t.game.phase.kind).toBe('trumpSelection')
  })

  test('an actor outside the table is refused, never thrown, whatever it sends', () => {
    const two = new Table(2)
    const games = [createGame(), two.game, new Table(2, { redealIfNoTrumps: false }).do(0, { type: 'start' }).game, new Table(4).do(0, { type: 'start' }).game]
    const actions: Action[] = [
      { type: 'rename', name: 'Ghost' },
      { type: 'leaveSeat' },
      { type: 'sit', seat: 0, name: 'Ghost' },
      { type: 'reclaimSeat' },
      { type: 'pass' },
      { type: 'call', amount: 10 },
      { type: 'setRules', overrides: {} },
      { type: 'nextRound' },
    ]
    for (const game of games) {
      deepFreeze(game)
      for (const actor of [game.playerCount, 7, -1, 1.5, Number.NaN]) {
        for (const action of actions) expect(apply(game, actor, action, ctx), `${action.type} by ${actor}`).toEqual({ rejected: 'notSeated' })
      }
    }
    // Seats 2 and 3 of a two-player table were never there; in a four-player game they are.
    expect(reject(two.game, 2, { type: 'rename', name: 'Ghost' })).toBe('notSeated')
    expect(reject(new Table(4).game, 2, { type: 'rename', name: 'Ghost' })).toBeNull()
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
    const over: Game = { ...game, phase: { kind: 'gameOver', again: [], winner: 0, summary: {} as RoundSummary } }
    expect(viewFor(over, 0).seats[1].persona).toBe(game.seats[1].persona)
  })

  test('a rematch hides a surprise persona again, until that game is over', () => {
    let game = run(hosted(), 0, { type: 'addAi', seat: 1, persona: 'surprise' })
    for (const seat of [2, 3]) game = run(game, 0, { type: 'addAi', seat })
    const over: Game = { ...game, phase: { kind: 'gameOver', again: [], winner: 0, summary: {} as RoundSummary } }
    const again = run(over, 0, { type: 'rematch', now: true })
    expect(again.phase.kind).toBe('calling')
    expect(again.seats[1].personaHidden).toBe(true)
    expect(PERSONAS).toContain(again.seats[1].persona)
    for (const seat of [0, 1, null]) expect(viewFor(again, seat).seats[1].persona).toBeNull()
  })
})
