import { describe, expect, test } from 'vitest'
import { GAMES, gameOf, isRoomName } from '.'
import { TRADITIONAL } from '../engine'
import { checkMalformed } from '../kit/contract'
import type { Actor } from '../kit/table'
import { STANDARD, hearts } from './hearts'
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
  const TABLE_ACTIONS = ['sit', 'leaveSeat', 'rename', 'addAi', 'clearSeat', 'setPlayerCount', 'start', 'replaceWithAi', 'reclaimSeat']
  const TABLE_PATHS = ['sit.seat', 'sit.name', 'rename.name', 'addAi.seat', 'addAi.persona', 'clearSeat.seat', 'setPlayerCount.playerCount', 'replaceWithAi.seat']
  const overrides = (rules: object) => ['setRules.overrides', ...Object.keys(rules).map((key) => `setRules.overrides.${key}`)]
  const card = (at: string) => [at, `${at}.suit`, `${at}.rank`]

  /** What the malformed-action check must reach in each game: the phases of a first round, every action a client may send, and every field. */
  const COVERAGE: Record<string, { phases: string[]; actions: string[]; paths: string[] }> = {
    thunee: {
      phases: ['calling', 'trumpSelection', 'thuneeWindow', 'playing', 'trickPause', 'roundResult'],
      actions: [
        ...TABLE_ACTIONS,
        ...['setRules', 'call', 'pass', 'preselectTrump', 'chooseTrump', 'callThunee', 'playCard', 'claimJodhi', 'callDouble', 'callKhanaak'],
        ...['challengePlay', 'challengeJodhi', 'nextRound', 'rematch'],
      ],
      paths: [
        ...TABLE_PATHS,
        ...overrides(TRADITIONAL),
        ...['call.amount', 'preselectTrump.choice', 'chooseTrump.choice', ...card('playCard.card'), 'claimJodhi.suit', 'claimJodhi.withJack'],
        ...['challengePlay.seat', 'challengeJodhi.claim'],
      ],
    },
    hearts: {
      phases: ['passing', 'playing', 'trickPause', 'roundResult'],
      actions: [...TABLE_ACTIONS, 'setRules', 'choosePass', 'playCard', 'challengePlay', 'nextRound', 'rematch'],
      paths: [
        ...TABLE_PATHS,
        ...overrides(STANDARD),
        ...['choosePass.cards', ...card('choosePass.cards.0'), ...card('choosePass.cards.1'), ...card('choosePass.cards.2')],
        ...[...card('playCard.card'), 'challengePlay.seat'],
      ],
    },
  }

  test('each game says what the malformed-action check must reach in it', () => {
    expect(Object.keys(COVERAGE).sort()).toEqual([...GAMES.keys()].sort())
  })

  for (const [id, module] of GAMES) {
    test(`${id} never throws on a malformed action, from anyone at the table or not, in any phase`, () => {
      const covered = checkMalformed(module)
      expect(covered.states[0]).toBe('an empty lobby')
      for (const count of module.seatCounts) {
        expect(covered.states).toContain(`a full lobby of ${count}`)
        for (const phase of COVERAGE[id].phases) expect(covered.states).toContain(`${phase} with ${count}`)
      }
      expect([...covered.actions].sort()).toEqual([...COVERAGE[id].actions].sort())
      expect([...covered.paths].sort()).toEqual([...COVERAGE[id].paths].sort())
    }, 60_000)
  }

  test('the check catches a game that reads a field, a field of a field, or a whole action carelessly', () => {
    /** Thunee as it is, except that it throws on one input, as a careless read would. */
    const careless = (fault: (actor: Actor, action: Record<string, unknown> | null) => boolean): typeof thunee => ({
      ...thunee,
      apply(game, actor, action, ctx) {
        if (fault(actor, action as unknown as Record<string, unknown> | null)) throw new TypeError('a careless read')
        return thunee.apply(game, actor, action, ctx)
      },
    })
    const faults: Record<string, Parameters<typeof careless>[0]> = {
      'sit at seat 0 with a null name': (_, a) => a?.type === 'sit' && a.seat === 0 && a.name === null,
      'playCard of a club with a null rank': (_, a) => a?.type === 'playCard' && (a.card as { suit?: unknown; rank?: unknown } | null)?.suit === 'clubs' && (a.card as { rank?: unknown }).rank === null,
      'nextRound from a spectator': (actor, a) => a?.type === 'nextRound' && actor === null,
    }
    for (const [name, fault] of Object.entries(faults)) {
      expect(() => checkMalformed(careless(fault)), name).toThrow(/threw TypeError: a careless read/)
    }
  }, 60_000)
})
