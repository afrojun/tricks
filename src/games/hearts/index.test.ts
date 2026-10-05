import { describe, expect, test } from 'vitest'
import { hearts } from '.'
import { FORMAT_VERSION } from './engine'
import { VOID } from './engine/deals'
import { Table } from './engine/testing'

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
      expect(hearts.apply(passing, 0, { type: 'choosePass', ...bad } as never, ctx)).toEqual({ rejected: 'badChoice' })
    }
    for (const bad of [undefined, null, 7, { suit: 'clubs' }]) {
      expect(hearts.apply(playing, 0, { type: 'playCard', card: bad } as never, ctx)).toEqual({ rejected: 'cardNotInHand' })
    }
  })
})
