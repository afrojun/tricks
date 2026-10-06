import { describe, expect, test } from 'vitest'
import { hearts } from '.'
import { deepFreeze } from '../../kit/testing'
import { type Action, FORMAT_VERSION, createGame } from './engine'
import { VOID } from './engine/deals'
import { Table, card, cards } from './engine/testing'

describe('the Hearts module', () => {
  test('names the game and carries every part of the contract', () => {
    expect(hearts.id).toBe('hearts')
    expect(hearts.formatVersion).toBe(FORMAT_VERSION)
    expect(hearts.seatCounts).toEqual([4])
    for (const fn of [hearts.createGame, hearts.apply, hearts.viewFor, hearts.seatsToAct, hearts.nextDeadline, hearts.checkInvariants, hearts.dueStep, hearts.reactions]) {
      expect(typeof fn).toBe('function')
    }
  })

  test('a new game is an empty lobby of four seats in this format', () => {
    const game = hearts.createGame()
    expect(game).toMatchObject({ formatVersion: FORMAT_VERSION, playerCount: 4, phase: { kind: 'lobby' }, waiting: [], aiActAt: null })
    expect(game.seats.every((s) => s.kind === 'empty')).toBe(true)
    hearts.checkInvariants(game)
    expect(hearts.seatsToAct(game)).toEqual([])
    expect(hearts.nextDeadline(game)).toBeNull()
  })

  test('the action schema admits a player’s actions and no system ones', () => {
    expect(hearts.actionSchema.safeParse({ type: 'sit', seat: 0, name: 'A' }).success).toBe(true)
    expect(hearts.actionSchema.safeParse({ type: 'tick' }).success).toBe(false)
  })

  test('apply never throws on a malformed action, and never mutates its input', () => {
    const game = Object.freeze(hearts.createGame())
    const ctx = { now: 0, rng: () => 0.5 }
    for (const bad of [{ type: 'nope' }, { type: 'playCard' }, { type: 'choosePass' }, { type: 'challengePlay' }, { type: 'sit', seat: -1, name: 'x' }]) {
      expect(() => hearts.apply(game, 0, bad as never, ctx)).not.toThrow()
    }
    expect(hearts.apply(game, null, { type: 'sit', seat: 0, name: 'A' }, ctx)).toHaveProperty('game')
    expect(game.seats[0].kind).toBe('empty')
  })

  test('a message that is not an action at all is refused, never thrown, in every phase and from every actor', () => {
    const ctx = { now: 0, rng: () => 0.5 }
    const lobby = hearts.createGame()
    const passing = new Table().deal(VOID).game
    const playing = new Table({ passing: 'none' }).deal(VOID).game
    const paused = new Table({ passing: 'none' }).deal(VOID).play('2c 4d 9c Ac').game
    const result = new Table({ passing: 'none' }).deal(VOID).autoPlay('roundResult').game
    const envelopes: unknown[] = [null, undefined, 0, 7, 'start', '', true, Symbol('x'), () => 1, [], ['tick'], {}, { type: 5 }, { type: null }, { type: undefined }, { type: {} }, { kind: 'start' }]
    for (const game of [lobby, passing, playing, paused, result]) {
      for (const actor of [0, 2, null, 'system'] as const) {
        for (const bad of envelopes) {
          expect(() => hearts.apply(game, actor, bad as never, ctx)).not.toThrow()
          expect(hearts.apply(game, actor, bad as never, ctx)).toEqual({ rejected: 'notAllowed' })
        }
      }
    }
  })

  test('the system’s own actions still work', () => {
    const t = new Table({ passing: 'none' }).deal(VOID).play('2c 4d 9c Ac')
    const deadline = (t.game.phase as { deadline: number }).deadline
    const ticked = hearts.apply(t.game, 'system', { type: 'tick' }, { now: deadline, rng: () => 0.5 })
    expect(ticked).toHaveProperty('game.phase.kind', 'playing')
    const dropped = hearts.apply(t.game, 'system', { type: 'setConnected', seat: 1, connected: false }, { now: deadline, rng: () => 0.5 })
    expect(dropped).toHaveProperty('game.seats.1.connected', false)
  })

  test('nor on malformed cards in the middle of a round', () => {
    const passing = new Table().deal(VOID).game
    const playing = new Table({ passing: 'none' }).deal(VOID).game
    const ctx = { now: 0, rng: () => 0.5 }
    for (const bad of [{ cards: null }, { cards: [null, 1, 'x'] }, { cards: [{}, {}, {}] }]) {
      expect(hearts.apply(passing, 0, { type: 'choosePass', ...bad } as never, ctx)).toEqual({ rejected: 'notAllowed' })
    }
    for (const bad of [undefined, null, 7, { suit: 'clubs' }]) {
      expect(hearts.apply(playing, 0, { type: 'playCard', card: bad } as never, ctx)).toEqual({ rejected: 'notAllowed' })
    }
  })

  test('a field of the wrong type is refused before anything reads it, and nothing changes', () => {
    const ctx = { now: 0, rng: () => 0.5 }
    const lobby = new Table().game
    const passing = new Table().deal(VOID).game
    const playing = new Table({ passing: 'none' }).deal(VOID).game
    const BAD: Record<string, object[]> = {
      sit: [{ seat: null, name: 'A' }, { seat: '0', name: 'A' }, { seat: 0, name: null }, { seat: 0 }],
      rename: [{ name: null }, { name: 5 }, {}],
      addAi: [{ seat: null }, { seat: 1, persona: 'evil' }, { seat: 1, persona: 5 }],
      clearSeat: [{ seat: 'x' }, {}],
      setPlayerCount: [{ playerCount: '4' }, {}],
      replaceWithAi: [{ seat: null }],
      setRules: [{ overrides: null }, { overrides: 'x' }, {}, { overrides: { gameEndsAt: 'x' } }, { overrides: { passing: 'right' } }, { overrides: { allowCheating: 'no' } }],
      choosePass: [{ cards: null }, { cards: [{ suit: 'stars', rank: 'Q' }, { suit: 'clubs', rank: '2' }, { suit: 'clubs', rank: '3' }] }, {}],
      playCard: [{ card: null }, { card: { suit: 'stars', rank: 'Q' } }, { card: { suit: 'clubs', rank: '1' } }, {}],
      challengePlay: [{ seat: null }, { seat: '1' }, {}],
    }
    for (const game of [lobby, passing, playing]) {
      deepFreeze(game)
      for (const [type, payloads] of Object.entries(BAD)) {
        for (const payload of payloads) {
          for (const actor of [0, 1, 2, 3, null] as const) {
            const action = { type, ...payload }
            expect(hearts.apply(game, actor, action as never, ctx), `${JSON.stringify(action)} by ${actor} in ${game.phase.kind}`).toEqual({ rejected: 'notAllowed' })
          }
        }
      }
    }
  })

  test('a well-formed action keeps its own reason', () => {
    const ctx = { now: 0, rng: () => 0.5 }
    const host = new Table().game
    const passing = new Table().deal(VOID).game
    const playing = new Table({ passing: 'none' }).deal(VOID).game
    expect(hearts.apply(createGame(), null, { type: 'sit', seat: 7, name: 'A' }, ctx)).toEqual({ rejected: 'badSeat' })
    expect(hearts.apply(createGame(), null, { type: 'sit', seat: 0, name: '   ' }, ctx)).toEqual({ rejected: 'badName' })
    expect(hearts.apply(host, 0, { type: 'setPlayerCount', playerCount: 2 }, ctx)).toEqual({ rejected: 'badChoice' })
    expect(hearts.apply(passing, 0, { type: 'choosePass', cards: cards('2c 3c') }, ctx)).toEqual({ rejected: 'badChoice' })
    expect(hearts.apply(passing, 0, { type: 'choosePass', cards: cards('2c 2c 3c') }, ctx)).toEqual({ rejected: 'badChoice' })
    expect(hearts.apply(passing, 0, { type: 'choosePass', cards: cards('Ac Kc Qc') }, ctx)).toEqual({ rejected: 'badChoice' })
    expect(hearts.apply(playing, 0, { type: 'playCard', card: card('Ac') }, ctx)).toEqual({ rejected: 'cardNotInHand' })
    expect(hearts.apply(playing, 1, { type: 'playCard', card: card('4d') }, ctx)).toEqual({ rejected: 'notYourTurn' })
    expect(hearts.apply(playing, 0, { type: 'challengePlay', seat: 9 }, ctx)).toEqual({ rejected: 'notAllowed' })
    // Of the right type, a rule beyond the wire's bounds is the host's to set, as it always was.
    expect(hearts.apply(host, 0, { type: 'setRules', overrides: { gameEndsAt: 1000 } }, ctx)).toHaveProperty('game.rules.gameEndsAt', 1000)
  })

  test('an actor outside the table is refused, never thrown, whatever it sends', () => {
    const ctx = { now: 0, rng: () => 0.5 }
    const games = [createGame(), new Table().game, new Table().deal(VOID).game, new Table({ passing: 'none' }).deal(VOID).game]
    const actions: Action[] = [
      { type: 'rename', name: 'Ghost' },
      { type: 'leaveSeat' },
      { type: 'reclaimSeat' },
      { type: 'nextRound' },
      { type: 'setRules', overrides: {} },
      { type: 'playCard', card: card('2c') },
      { type: 'challengePlay', seat: 0 },
    ]
    for (const game of games) {
      deepFreeze(game)
      for (const actor of [4, 7, -1, 1.5, Number.NaN]) {
        for (const action of actions) expect(hearts.apply(game, actor, action, ctx), `${action.type} by ${actor}`).toEqual({ rejected: 'notSeated' })
      }
    }
  })
})
