import { describe, expect, test } from 'vitest'
import { GAMES, gameOf, isRoomName } from '.'
import { type Game, type View, TRADITIONAL } from './thunee/engine'
import { Table } from './thunee/engine/testing'
import { type Contract, type ContractRun, checkMalformed, runContract } from '../kit/contract'
import type { Actor, Seat, TableState, TableView } from '../kit/table'
import { STANDARD, hearts } from './hearts'
import { heartsContract } from './hearts/contract'
import { thunee } from './thunee'
import { thuneeContract } from './thunee/contract'

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
  const TABLE_ACTIONS = ['sit', 'leaveSeat', 'rename', 'addAi', 'setPersona', 'clearSeat', 'setPlayerCount', 'start', 'replaceWithAi', 'reclaimSeat']
  const TABLE_PATHS = ['sit.seat', 'sit.name', 'rename.name', 'addAi.seat', 'addAi.persona', 'setPersona.seat', 'setPersona.persona', 'clearSeat.seat', 'setPlayerCount.playerCount', 'replaceWithAi.seat']
  const overrides = (rules: object) => ['setRules.overrides', ...Object.keys(rules).map((key) => `setRules.overrides.${key}`)]
  const card = (at: string) => [at, `${at}.suit`, `${at}.rank`]

  /**
   * What the malformed-action check must reach in each game: the phases of a first round, every action a client may
   * send, and every field. A union's shapes with fields of their own would add those fields here; neither game has one
   * yet (Thunee's trump choice is a suit or `lastCard`), so the exact lists below fail the day one appears unlisted.
   */
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
    })
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
  })
})

describe('every game in the list keeps the module contract', () => {
  /** A game's contract fixture under one setting, its own types put away. */
  interface Fixture {
    module: unknown
    play(seed: number): ContractRun<TableState>
    tally: { cheats: number; accusations: number }
  }
  const fixture = <G extends TableState, A, E, V extends TableView>({ contract, tally }: { contract: Contract<G, A, E, V>; tally: Fixture['tally'] }): Fixture => ({
    module: contract.module,
    play: (seed) => runContract(contract, seed),
    tally,
  })

  /** Each game's random legal player, mischief and hidden cards, at a seat count and with cheating on or off. */
  const FIXTURES: Record<string, (playerCount: number, allowCheating: boolean) => Fixture> = {
    thunee: (playerCount, allowCheating) => fixture(thuneeContract({ allowCheating }, playerCount as 2 | 4)),
    hearts: (_, allowCheating) => fixture(heartsContract({ allowCheating })),
  }
  /** Seeded whole games per game, seat count and setting. The games' own simulations play many more. */
  const SEEDS = 3

  test('no game is listed without a contract fixture', () => {
    expect(Object.keys(FIXTURES).sort()).toEqual([...GAMES.keys()].sort())
  })

  describe('the gate judges the views the module itself produces', () => {
    const { contract } = thuneeContract({}, 4)
    /** Thunee with its views changed by `change`, played through the same fixture. */
    const viewing = (change: (game: Game, seat: Seat | null, view: View) => View): typeof contract => ({
      ...contract,
      module: { ...thunee, viewFor: (game, seat, memory) => change(game, seat, thunee.viewFor(game, seat, memory)) },
    })
    const hands = (game: Game) => ('hands' in game.phase ? game.phase.hands : 'play' in game.phase ? game.phase.play.hands : [])
    const trump = (game: Game) => (game.phase.kind === 'thuneeWindow' ? game.phase.trump : 'play' in game.phase ? game.phase.play.trump : null)
    /** Trump shown to `to` in one phase, as a careless view would. */
    const showingTrump = (kind: string, to: (seat: Seat | null) => boolean) =>
      viewing((game, seat, view) => (game.phase.kind === kind && to(seat) ? ({ ...view, phase: { ...view.phase, trump: trump(game) } } as View) : view))

    test('another seat’s cards, or a secret', () => {
      expect(() => runContract(viewing((game, _, view) => ({ ...view, peek: hands(game) })), 1)).toThrow(/^thunee seed 1, calling: the view for 0 leaks/)
      expect(() => runContract(viewing((game, _, view) => ({ ...view, aiSalt: game.aiSalt })), 1)).toThrow(/^thunee seed 1, calling: the view for 0 holds aiSalt/)
    })

    test('trump before it is revealed, to the spectator or a seat that is not the trumper, in the Thunee window and in play', () => {
      for (const kind of ['thuneeWindow', 'playing']) {
        const spectator = new RegExp(`^thunee seed 1, ${kind}: the view for null shows trump before it is revealed`)
        expect(() => runContract(showingTrump(kind, (seat) => seat === null), 1), kind).toThrow(spectator)
        const seats = new RegExp(`^thunee seed 1, ${kind}: the view for \\d shows trump before it is revealed`)
        expect(() => runContract(showingTrump(kind, (seat) => seat !== null), 1), kind).toThrow(seats)
      }
    })

    test('and in a trick’s pause, which the engine never reaches with trump unrevealed', () => {
      // The first card of a round reveals trump, and the Thunee caller's card does in a Thunee round, so no game
      // played reaches this; the check is given one by hand: the first trick played out with trump still hidden.
      const game = new Table(4, { redealIfNoTrumps: false }).deal(['Jh 9h Ks Qs 10c Qd', 'Js 9s As 10s Kd Qc', 'Jc 9c Ac Kc Ah 10h', 'Jd 9d Ad 10d Kh Qh']).toPlay('spades').game
      if (game.phase.kind !== 'playing') throw new Error('expected play')
      const paused: Game = { ...game, phase: { kind: 'trickPause', play: { ...game.phase.play, trumpRevealed: false }, deadline: 0 } }
      const shown = (seat: Seat | null) => ({ ...thunee.viewFor(paused, seat), phase: { ...thunee.viewFor(paused, seat).phase, trump: 'spades' } }) as View
      expect(contract.checkView!(paused, null, shown(null))).toBe('shows trump before it is revealed')
      expect(contract.checkView!(paused, 0, shown(0))).toBe('shows trump before it is revealed')
      expect(contract.checkView!(paused, 1, shown(1))).toBeNull() // the trumper
      expect(contract.checkView!(paused, null, thunee.viewFor(paused, null))).toBeNull()
    })
  })

  for (const [id, module] of GAMES) {
    for (const playerCount of module.seatCounts) {
      for (const allowCheating of [true, false]) {
        test(`${id}, ${playerCount} players, cheating ${allowCheating ? 'on' : 'off'}: seeded games end with invariants and views intact after every action`, () => {
          const gate = FIXTURES[id](playerCount, allowCheating)
          // The listed module itself is what is played, not a copy of its parts.
          expect(gate.module).toBe(module)
          let actions = 0
          let refused = 0
          for (let seed = 1; seed <= SEEDS; seed++) {
            const run = gate.play(seed)
            expect(run.game.phase.kind).toBe('gameOver')
            expect(run.game.playerCount).toBe(playerCount)
            actions += run.actions
            refused += run.refused
          }
          expect(actions).toBeGreaterThan(SEEDS * 50)
          // The mischief must reach the corners it is meant to, or this proves little.
          if (allowCheating) expect(gate.tally.cheats).toBeGreaterThan(0)
          else {
            expect(gate.tally).toMatchObject({ cheats: 0, accusations: 0 })
            expect(refused).toBeGreaterThan(0)
          }
        })
      }
    }
  }
})
