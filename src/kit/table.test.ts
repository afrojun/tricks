import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { PERSONAS } from './mind'
import {
  AI_NAMES,
  type Actor,
  type Ctx,
  type Seat,
  STALL_MS,
  type TableAction,
  type TableEvent,
  type TableState,
  actingHost,
  againComplete,
  againElectorate,
  allSeats,
  canStart,
  checkLobbyHost,
  cleanName,
  emptySeats,
  isAction,
  isActor,
  isAiControlled,
  isTableAction,
  nextSeat,
  replaceableSeats,
  revealPersonas,
  seatsFrom,
  settle,
  tableAction,
  tableActionSchemas,
  tableView,
} from './table'
import { deepFreeze, seededRng } from './testing'

// A toy game: just enough of a game around the table to exercise it.
interface Toy extends TableState {
  rules: { allowCheating: boolean }
  phase: { kind: 'lobby' } | { kind: 'playing'; toAct: Seat[] } | { kind: 'gameOver' }
}
type ToyAction = TableAction | { type: 'setRules'; allowCheating: boolean } | { type: 'wait'; seats: Seat[] } | { type: 'end' } | { type: 'rematch' }

const createToy = (): Toy => ({
  formatVersion: 1,
  playerCount: 4,
  seats: emptySeats(4),
  host: null,
  waiting: [],
  aiActAt: null,
  aiSalt: 0,
  rules: { allowCheating: true },
  phase: { kind: 'lobby' },
})

function apply(game: Toy, actor: Actor, action: ToyAction, ctx: Ctx): { game: Toy; events: TableEvent[] } | { rejected: string } {
  const draft = structuredClone(game)
  const events: TableEvent[] = []
  if (isTableAction(action)) {
    const rejected = tableAction(draft, actor, action, ctx, events, { seatCounts: [2, 4] })
    if (rejected !== null) return { rejected }
    if (action.type === 'start') draft.phase = { kind: 'playing', toAct: [] }
  } else if (action.type === 'setRules') {
    const rejected = checkLobbyHost(draft, actor)
    if (rejected !== null) return { rejected }
    draft.rules = { allowCheating: action.allowCheating }
  } else if (action.type === 'wait') {
    if (draft.phase.kind !== 'playing') return { rejected: 'wrongPhase' }
    draft.phase = { kind: 'playing', toAct: action.seats }
  } else if (action.type === 'end') {
    draft.phase = { kind: 'gameOver' }
  } else {
    revealPersonas(draft)
    draft.phase = { kind: 'playing', toAct: [] }
  }
  const toAct = draft.phase.kind === 'playing' ? draft.phase.toAct : []
  settle(draft, ctx, toAct, toAct)
  return { game: draft, events }
}

class Harness {
  game = createToy()
  now = 1_000_000
  rng = seededRng(1)
  events: TableEvent[] = []

  get ctx(): Ctx {
    return { now: this.now, rng: this.rng }
  }

  try(actor: Actor, action: ToyAction): string | null {
    const result = apply(deepFreeze(this.game), actor, action, this.ctx)
    if ('rejected' in result) return result.rejected
    this.game = result.game
    this.events.push(...result.events)
    return null
  }

  do(actor: Actor, action: ToyAction): this {
    const rejected = this.try(actor, action)
    if (rejected !== null) throw new Error(`${JSON.stringify(action)} by ${actor} rejected: ${rejected}`)
    return this
  }

  view(seat: Seat | null) {
    return { ...tableView(this.game, seat), phase: { kind: this.game.phase.kind } }
  }
}

/** Four humans seated, the game started. */
const started = () => {
  const t = new Harness()
  for (const seat of allSeats(4)) t.do(null, { type: 'sit', seat, name: `P${seat}` })
  return t.do(0, { type: 'start' })
}

describe('lobby', () => {
  test('the first player to sit becomes host', () => {
    const t = new Harness().do(null, { type: 'sit', seat: 2, name: 'Asha' })
    expect(t.game.host).toBe(2)
    expect(t.game.seats[2]).toMatchObject({ name: 'Asha', kind: 'human', connected: true })
    expect(t.events).toEqual([{ type: 'seatChanged' }])
  })

  test('a taken seat, a bad seat and an already seated player are rejected', () => {
    const t = new Harness().do(null, { type: 'sit', seat: 0, name: 'A' })
    expect(t.try(null, { type: 'sit', seat: 0, name: 'B' })).toBe('seatTaken')
    expect(t.try(null, { type: 'sit', seat: 7, name: 'B' })).toBe('badSeat')
    expect(t.try(null, { type: 'sit', seat: 1.5, name: 'B' })).toBe('badSeat')
    expect(t.try(0, { type: 'sit', seat: 1, name: 'A' })).toBe('alreadySeated')
  })

  test('names are trimmed, collapsed and capped at 16 characters; empty names are rejected', () => {
    const t = new Harness().do(null, { type: 'sit', seat: 0, name: `   Very   ${'x'.repeat(200)}  ` })
    expect(t.game.seats[0].name).toBe('Very xxxxxxxxxxx')
    expect(new Harness().try(null, { type: 'sit', seat: 0, name: '   \n\t ' })).toBe('badName')
    expect(t.try(0, { type: 'rename', name: '' })).toBe('badName')
    expect(t.try(null, { type: 'rename', name: 'X' })).toBe('notSeated')
    expect(t.do(0, { type: 'rename', name: ' Bheki ' }).game.seats[0].name).toBe('Bheki')
    expect(cleanName('  a  b  ')).toBe('a b')
    expect(cleanName('    ')).toBeNull()
    expect(cleanName(undefined as never)).toBeNull()
  })

  test('only the host may add a computer, clear a seat, set rules, set the player count or start', () => {
    const t = new Harness().do(null, { type: 'sit', seat: 0, name: 'Host' }).do(null, { type: 'sit', seat: 1, name: 'Guest' })
    const hostOnly: ToyAction[] = [
      { type: 'addAi', seat: 2 },
      { type: 'clearSeat', seat: 0 },
      { type: 'setRules', allowCheating: false },
      { type: 'setPlayerCount', playerCount: 2 },
      { type: 'start' },
    ]
    for (const action of hostOnly) expect(t.try(1, action)).toBe('notHost')
    for (const action of hostOnly) expect(t.try(null, action)).toBe('notSeated')
  })

  test('start is rejected until every seat is filled; computers get different names', () => {
    const t = new Harness().do(null, { type: 'sit', seat: 0, name: 'Host' })
    expect(t.try(0, { type: 'start' })).toBe('seatsNotFilled')
    expect(canStart(t.view(0))).toBe(false)
    for (const seat of [1, 2, 3]) t.do(0, { type: 'addAi', seat })
    expect(new Set(t.game.seats.map((s) => s.name)).size).toBe(4)
    expect(canStart(t.view(0))).toBe(true)
    expect(canStart(t.view(1))).toBe(false)
    t.do(0, { type: 'start' })
    expect(t.game.phase.kind).toBe('playing')
    expect(canStart(t.view(0))).toBe(false)
  })

  test('after the start, seats and rules are frozen, but a player may still rename', () => {
    const t = started()
    expect(t.try(0, { type: 'setRules', allowCheating: false })).toBe('wrongPhase')
    expect(t.try(0, { type: 'addAi', seat: 1 })).toBe('wrongPhase')
    expect(t.try(1, { type: 'leaveSeat' })).toBe('wrongPhase')
    expect(t.try(0, { type: 'start' })).toBe('wrongPhase')
    t.do(1, { type: 'rename', name: 'Chan' })
    expect(t.game.seats[1].name).toBe('Chan')
  })

  test('shrinking is rejected while a dropped seat is occupied; a count the game does not offer is refused', () => {
    const t = new Harness().do(null, { type: 'sit', seat: 0, name: 'Host' }).do(0, { type: 'addAi', seat: 3 })
    expect(t.try(0, { type: 'setPlayerCount', playerCount: 2 })).toBe('seatTaken')
    expect(t.try(0, { type: 'setPlayerCount', playerCount: 3 })).toBe('badChoice')
    t.do(0, { type: 'clearSeat', seat: 3 }).do(0, { type: 'setPlayerCount', playerCount: 2 })
    expect(t.game.seats).toHaveLength(2)
    expect(t.game.playerCount).toBe(2)
    expect(t.do(0, { type: 'setPlayerCount', playerCount: 4 }).game.seats).toHaveLength(4)
  })

  test('the host cannot clear their own seat', () => {
    const t = new Harness().do(null, { type: 'sit', seat: 0, name: 'Host' })
    expect(t.try(0, { type: 'clearSeat', seat: 0 })).toBe('badSeat')
    expect(t.try(0, { type: 'clearSeat', seat: 9 })).toBe('badSeat')
  })

  test('host passes to the next connected human when the host disconnects or leaves', () => {
    const t = new Harness()
    for (const seat of [0, 1, 2]) t.do(null, { type: 'sit', seat, name: `P${seat}` })
    const before = t.game
    t.do('system', { type: 'setConnected', seat: 0, connected: false })
    expect(t.view(1).host).toBe(1)
    expect(t.view(1).owner).toBe(0)
    t.game = before
    t.do(0, { type: 'leaveSeat' })
    expect(t.game.host).toBe(1)
    expect(t.game.seats[0].kind).toBe('empty')
    // A lone host who disconnects keeps the role.
    const solo = new Harness().do(null, { type: 'sit', seat: 0, name: 'A' }).do('system', { type: 'setConnected', seat: 0, connected: false })
    expect(solo.view(0).host).toBe(0)
  })

  test('players cannot send system actions, and only human seats connect', () => {
    const t = new Harness().do(null, { type: 'sit', seat: 0, name: 'A' }).do(0, { type: 'addAi', seat: 1 })
    expect(t.try(0, { type: 'tick' })).toBe('notAllowed')
    expect(t.try(0, { type: 'setConnected', seat: 0, connected: false })).toBe('notAllowed')
    expect(t.try('system', { type: 'setConnected', seat: 1, connected: false })).toBe('badSeat')
    expect(t.try('system', { type: 'sit', seat: 2, name: 'X' })).toBe('notAllowed')
    expect(t.try('system', { type: 'tick' })).toBeNull()
  })
})

describe('computer personas', () => {
  const hosted = () => new Harness().do(null, { type: 'sit', seat: 0, name: 'Host' })

  test('a computer is Straight unless the host picks another persona', () => {
    const t = hosted().do(0, { type: 'addAi', seat: 1 }).do(0, { type: 'addAi', seat: 2, persona: 'sly' })
    expect(t.game.seats[1]).toMatchObject({ kind: 'ai', persona: 'straight', personaHidden: false })
    expect(t.game.seats[2]).toMatchObject({ kind: 'ai', persona: 'sly', personaHidden: false })
    expect(t.game.seats[0]).toMatchObject({ kind: 'human', persona: 'straight', personaHidden: false })
    expect(t.view(0).seats[2].persona).toBe('sly')
    expect(isAiControlled(t.game, 1)).toBe(true)
    expect(isAiControlled(t.game, 0)).toBe(false)
  })

  test('a surprise persona is drawn at random and hidden from every view until the game is over', () => {
    const t = hosted().do(0, { type: 'addAi', seat: 1, persona: 'surprise' })
    expect(PERSONAS).toContain(t.game.seats[1].persona)
    expect(t.game.seats[1].personaHidden).toBe(true)
    for (const seat of [0, 1, null]) expect(t.view(seat).seats[1].persona).toBeNull()
    for (const seat of [2, 3]) t.do(0, { type: 'addAi', seat })
    t.do(0, { type: 'start' }).do(0, { type: 'end' })
    expect(t.view(0).seats[1].persona).toBe(t.game.seats[1].persona)
  })

  test('the host changes a computer’s persona in the lobby; a surprise is drawn and hidden', () => {
    const t = hosted().do(0, { type: 'addAi', seat: 1 })
    t.do(0, { type: 'setPersona', seat: 1, persona: 'sharp' })
    expect(t.game.seats[1]).toMatchObject({ kind: 'ai', persona: 'sharp', personaHidden: false })
    expect(t.view(0).seats[1].persona).toBe('sharp')
    t.do(0, { type: 'setPersona', seat: 1, persona: 'surprise' })
    expect(PERSONAS).toContain(t.game.seats[1].persona)
    expect(t.game.seats[1].personaHidden).toBe(true)
    for (const seat of [0, 1, null]) expect(t.view(seat).seats[1].persona).toBeNull()
    // Picking one again shows it.
    t.do(0, { type: 'setPersona', seat: 1, persona: 'wild' })
    expect(t.game.seats[1]).toMatchObject({ persona: 'wild', personaHidden: false })
    expect(t.events.filter((e) => e.type === 'seatChanged').length).toBeGreaterThanOrEqual(4)
  })

  test('a persona is set only on a computer, only by the host, only in the lobby', () => {
    const t = hosted().do(null, { type: 'sit', seat: 1, name: 'Guest' }).do(0, { type: 'addAi', seat: 2 })
    const name = t.game.seats[2].name
    expect(t.try(0, { type: 'setPersona', seat: 0, persona: 'sly' })).toBe('badSeat')
    expect(t.try(0, { type: 'setPersona', seat: 1, persona: 'sly' })).toBe('badSeat')
    expect(t.try(0, { type: 'setPersona', seat: 3, persona: 'sly' })).toBe('badSeat')
    expect(t.try(0, { type: 'setPersona', seat: 9, persona: 'sly' })).toBe('badSeat')
    expect(t.try(0, { type: 'setPersona', seat: 1.5, persona: 'sly' })).toBe('badSeat')
    expect(t.try(1, { type: 'setPersona', seat: 2, persona: 'sly' })).toBe('notHost')
    expect(t.try(null, { type: 'setPersona', seat: 2, persona: 'sly' })).toBe('notSeated')
    expect(t.try('system', { type: 'setPersona', seat: 2, persona: 'sly' })).toBe('notAllowed')
    expect(t.game.seats[2]).toMatchObject({ name, persona: 'straight' })
    t.do(0, { type: 'addAi', seat: 3 }).do(0, { type: 'clearSeat', seat: 1 }).do(0, { type: 'addAi', seat: 1 }).do(0, { type: 'start' })
    expect(t.try(0, { type: 'setPersona', seat: 2, persona: 'sly' })).toBe('wrongPhase')
  })

  test('a computer’s name is drawn at random from the list, and is one nobody at the table has', () => {
    expect(AI_NAMES).toHaveLength(24)
    expect(new Set(AI_NAMES).size).toBe(24)
    for (const name of AI_NAMES) expect(name).toMatch(/^Bot [A-Z][a-z]+$/)
    const names = new Set<string>()
    for (let seed = 1; seed <= 30; seed++) {
      const t = hosted()
      t.rng = seededRng(seed)
      for (const seat of [1, 2, 3]) t.do(0, { type: 'addAi', seat })
      const bots = t.game.seats.slice(1).map((s) => s.name)
      expect(new Set(bots).size).toBe(3)
      for (const name of bots) expect(AI_NAMES).toContain(name)
      for (const name of bots) names.add(name)
    }
    // Not the first names in order every time.
    expect(names.size).toBeGreaterThan(4)
    // Drawn with the context's randomness.
    const first = hosted()
    first.rng = () => 0
    expect(first.do(0, { type: 'addAi', seat: 1 }).game.seats[1].name).toBe(AI_NAMES[0])
    const last = hosted()
    last.rng = () => 0.999
    expect(last.do(0, { type: 'addAi', seat: 1 }).game.seats[1].name).toBe(AI_NAMES[23])
    // A name a person already sits with is not drawn.
    const taken = hosted().do(0, { type: 'rename', name: AI_NAMES[0] })
    taken.rng = () => 0
    expect(taken.do(0, { type: 'addAi', seat: 1 }).game.seats[1].name).toBe(AI_NAMES[1])
  })

  test('with every name taken, a computer is named for its seat', () => {
    const t = hosted()
    const count = AI_NAMES.length + 2
    t.game = {
      ...t.game,
      playerCount: count,
      seats: [t.game.seats[0], ...AI_NAMES.map((name) => ({ ...t.game.seats[0], name, kind: 'ai' as const })), { ...t.game.seats[1] }],
    }
    expect(t.do(0, { type: 'addAi', seat: count - 1 }).game.seats[count - 1].name).toBe(`Bot ${count}`)
  })

  test('a surprise persona revealed at game over stays revealed after a rematch', () => {
    const t = hosted().do(0, { type: 'addAi', seat: 1, persona: 'surprise' })
    for (const seat of [2, 3]) t.do(0, { type: 'addAi', seat })
    t.do(0, { type: 'start' }).do(0, { type: 'end' }).do(0, { type: 'rematch' })
    expect(t.game.phase.kind).toBe('playing')
    expect(t.game.seats[1].personaHidden).toBe(false)
    for (const seat of [0, 1, null]) expect(t.view(seat).seats[1].persona).toBe(t.game.seats[1].persona)
  })
})

describe('stalled seats', () => {
  test('the host may hand over a disconnected seat, and the player reclaims it', () => {
    const t = started().do(0, { type: 'wait', seats: [2] })
    expect(t.try(0, { type: 'replaceWithAi', seat: 2 })).toBe('notAllowed')
    t.do('system', { type: 'setConnected', seat: 2, connected: false })
    expect(t.try(1, { type: 'replaceWithAi', seat: 2 })).toBe('notHost')
    t.do(0, { type: 'replaceWithAi', seat: 2 })
    expect(t.game.seats[2].standIn).toBe(true)
    expect(isAiControlled(t.game, 2)).toBe(true)
    expect(t.game.aiActAt).not.toBeNull() // seat 2 is to act
    t.do(2, { type: 'reclaimSeat' })
    expect(t.game.seats[2].standIn).toBe(false)
    expect(t.game.aiActAt).toBeNull()
  })

  test('a connected player can be replaced only after being waited on for a minute', () => {
    const t = started().do(0, { type: 'wait', seats: [2] })
    t.now += STALL_MS
    expect(t.try(0, { type: 'replaceWithAi', seat: 2 })).toBe('notAllowed')
    t.now += 1
    expect(t.try(0, { type: 'replaceWithAi', seat: 3 })).toBe('notAllowed') // not a seat being waited on
    t.do(0, { type: 'replaceWithAi', seat: 2 })
    expect(t.game.seats[2].standIn).toBe(true)
  })

  test('with several seats waited on at once, any of them that stalls can be replaced', () => {
    const t = started().do(0, { type: 'wait', seats: [1, 2, 3] })
    t.now += 30_000
    t.do(0, { type: 'wait', seats: [2, 3] }) // seat 1 has acted
    t.now += STALL_MS - 29_999
    expect(replaceableSeats(t.view(0), t.now)).toEqual([2, 3])
    t.do(0, { type: 'replaceWithAi', seat: 3 })
    expect(t.game.seats[3].standIn).toBe(true)
  })

  test('anyone seated may hand a stalled host seat to the computer', () => {
    const t = started().do(0, { type: 'wait', seats: [0] })
    t.now += STALL_MS + 1
    expect(replaceableSeats(t.view(3), t.now)).toEqual([0])
    expect(t.try(3, { type: 'replaceWithAi', seat: 2 })).toBe('notHost')
    t.do(3, { type: 'replaceWithAi', seat: 0 })
    expect(t.game.seats[0].standIn).toBe(true)
  })

  test('the host role returns to its owner when they reconnect', () => {
    const t = started().do('system', { type: 'setConnected', seat: 0, connected: false })
    expect(t.view(1).host).toBe(1)
    expect(actingHost(t.game)).toBe(1)
    t.do('system', { type: 'setConnected', seat: 0, connected: true })
    expect(t.view(1).host).toBe(0)
  })

  test('a seat is handed over only during a game, only a human’s, never one’s own, never twice', () => {
    const lobby = new Harness().do(null, { type: 'sit', seat: 0, name: 'A' }).do(null, { type: 'sit', seat: 1, name: 'B' })
    expect(lobby.try(0, { type: 'replaceWithAi', seat: 1 })).toBe('wrongPhase')
    const t = started().do('system', { type: 'setConnected', seat: 2, connected: false })
    expect(t.try(null, { type: 'replaceWithAi', seat: 2 })).toBe('notSeated')
    expect(t.try(0, { type: 'replaceWithAi', seat: 0 })).toBe('badSeat')
    expect(t.try(0, { type: 'replaceWithAi', seat: 8 })).toBe('badSeat')
    t.do(0, { type: 'replaceWithAi', seat: 2 })
    expect(t.try(0, { type: 'replaceWithAi', seat: 2 })).toBe('badSeat')
    expect(t.try(1, { type: 'reclaimSeat' })).toBe('notAllowed')
    expect(t.try(null, { type: 'reclaimSeat' })).toBe('notSeated')
    t.do(0, { type: 'end' })
    expect(t.try(0, { type: 'replaceWithAi', seat: 1 })).toBe('wrongPhase')
  })
})

describe('waiting and computer turns', () => {
  test('a seat still waited on keeps its start; a new one starts now; the rest are dropped', () => {
    const t = started().do(0, { type: 'wait', seats: [1, 2] })
    const start = t.now
    expect(t.game.waiting).toEqual([{ seat: 1, since: start }, { seat: 2, since: start }])
    t.now += 5000
    t.do(0, { type: 'wait', seats: [2, 3] })
    expect(t.game.waiting).toEqual([{ seat: 2, since: start }, { seat: 3, since: start + 5000 }])
    t.do(0, { type: 'wait', seats: [] })
    expect(t.game.waiting).toEqual([])
    expect(t.view(1).waiting).toEqual([])
  })

  test('a computer seat to act gets a time to act, kept until it passes', () => {
    const t = new Harness().do(null, { type: 'sit', seat: 0, name: 'A' })
    for (const seat of [1, 2, 3]) t.do(0, { type: 'addAi', seat })
    t.do(0, { type: 'start' })
    expect(t.game.aiActAt).toBeNull()
    t.do(0, { type: 'wait', seats: [0, 2] })
    const at = t.game.aiActAt!
    expect(at - t.now).toBeGreaterThanOrEqual(600)
    expect(at - t.now).toBeLessThan(1200)
    t.now += 100
    t.do(0, { type: 'wait', seats: [2] })
    expect(t.game.aiActAt).toBe(at)
    t.now = at
    t.do(0, { type: 'wait', seats: [3] })
    expect(t.game.aiActAt).toBeGreaterThan(at)
    t.do(0, { type: 'wait', seats: [0] })
    expect(t.game.aiActAt).toBeNull()
  })

  test('settle can wait on seats that are not the ones to act', () => {
    const game = createToy()
    settle(game, { now: 5, rng: () => 0 }, [], [1])
    expect(game.waiting).toEqual([{ seat: 1, since: 5 }])
    expect(game.aiActAt).toBeNull()
  })
})

describe('seats', () => {
  test('seats run in play order', () => {
    expect([0, 1, 2, 3].map((s) => nextSeat(s, 4))).toEqual([1, 2, 3, 0])
    expect([0, 1].map((s) => nextSeat(s, 2))).toEqual([1, 0])
    expect(seatsFrom(2, 4)).toEqual([2, 3, 0, 1])
    expect(allSeats(3)).toEqual([0, 1, 2])
  })

  test('isTableAction knows the table’s actions and no others', () => {
    for (const type of ['sit', 'leaveSeat', 'rename', 'addAi', 'setPersona', 'clearSeat', 'setPlayerCount', 'start', 'replaceWithAi', 'reclaimSeat', 'tick', 'setConnected']) {
      expect(isTableAction({ type })).toBe(true)
    }
    for (const type of ['setRules', 'nextRound', 'rematch', 'playCard']) expect(isTableAction({ type })).toBe(false)
  })

  test('only an object with a string type is an action', () => {
    for (const bad of [null, undefined, 0, 'sit', true, [], ['sit'], {}, { type: 5 }, { type: null }, { kind: 'sit' }]) {
      expect(isAction(bad)).toBe(false)
      expect(isTableAction(bad)).toBe(false)
    }
    expect(isAction({ type: 'anything' })).toBe(true)
  })

  test('an actor is the system, a spectator, or a seat at this table', () => {
    const two = { playerCount: 2 }
    for (const actor of ['system', null, 0, 1] as const) expect(isActor(two, actor)).toBe(true)
    for (const actor of [2, 3, -1, 1.5, Number.NaN, Infinity, '0', undefined, 'host', {}]) expect(isActor(two, actor)).toBe(false)
    expect(isActor({ playerCount: 4 }, 3)).toBe(true)
  })
})

describe('again', () => {
  const seat = (kind: 'empty' | 'human' | 'ai', connected = true, standIn = false) => ({ kind, connected, standIn })

  test('everyone at the table must say it: people connected and not stood in for', () => {
    const game = { seats: [seat('human'), seat('ai'), seat('human', false), seat('human', true, true)] } as Pick<TableState, 'seats'>
    expect(againElectorate(game)).toEqual([0])
    expect(againComplete(game, [])).toBe(false)
    expect(againComplete(game, [0])).toBe(true)
  })

  test('a disconnect can complete the set', () => {
    const both = { seats: [seat('human'), seat('human')] } as Pick<TableState, 'seats'>
    expect(againComplete(both, [1])).toBe(false)
    expect(againComplete({ seats: [seat('human', false), seat('human')] } as Pick<TableState, 'seats'>, [1])).toBe(true)
  })

  test('never for a table with nobody at it', () => {
    expect(againComplete({ seats: [seat('ai'), seat('human', false)] } as Pick<TableState, 'seats'>, [])).toBe(false)
  })
})

describe('wire schemas', () => {
  const schema = z.discriminatedUnion('type', [...tableActionSchemas([2, 4])])

  test('system actions and malformed actions are refused', () => {
    for (const bad of [
      { type: 'tick' },
      { type: 'setConnected', seat: 0, connected: false },
      { type: 'sit', seat: 9, name: 'x' },
      { type: 'sit', seat: 4, name: 'x' },
      { type: 'sit', seat: 0, name: 'x'.repeat(500) },
      { type: 'setPlayerCount', playerCount: 3 },
      { type: 'nope' },
      null,
      'start',
    ]) {
      expect(schema.safeParse(bad).success).toBe(false)
    }
    for (const good of [
      { type: 'sit', seat: 3, name: 'x' },
      { type: 'leaveSeat' },
      { type: 'rename', name: 'y' },
      { type: 'clearSeat', seat: 1 },
      { type: 'setPlayerCount', playerCount: 2 },
      { type: 'start' },
      { type: 'replaceWithAi', seat: 2 },
      { type: 'reclaimSeat' },
    ]) {
      expect(schema.safeParse(good).success).toBe(true)
    }
  })

  test('unbounded, they check only that each field has its type, and leave the values to tableAction', () => {
    const shape = z.discriminatedUnion('type', [...tableActionSchemas([2, 4], { bounded: false })])
    for (const good of [
      { type: 'sit', seat: 9, name: 'x'.repeat(500) },
      { type: 'clearSeat', seat: -1 },
      { type: 'setPlayerCount', playerCount: 3 },
      { type: 'replaceWithAi', seat: 1.5 },
    ]) {
      expect(shape.safeParse(good).success).toBe(true)
    }
    for (const bad of [
      { type: 'sit', seat: null, name: 'x' },
      { type: 'sit', seat: 0 },
      { type: 'rename', name: 5 },
      { type: 'addAi', seat: '1' },
      { type: 'addAi', seat: 1, persona: 'evil' },
      { type: 'setPersona', seat: 1 },
      { type: 'setPersona', seat: 1, persona: 'evil' },
      { type: 'setPersona', seat: '1', persona: 'sly' },
      { type: 'clearSeat', seat: null },
      { type: 'setPlayerCount', playerCount: '2' },
      { type: 'replaceWithAi' },
      { type: 'tick' },
    ]) {
      expect(shape.safeParse(bad).success).toBe(false)
    }
  })

  test('a computer may be added with a persona, a surprise, or neither', () => {
    expect(schema.safeParse({ type: 'addAi', seat: 1 }).success).toBe(true)
    expect(schema.safeParse({ type: 'addAi', seat: 1, persona: 'wild' }).success).toBe(true)
    expect(schema.safeParse({ type: 'addAi', seat: 1, persona: 'surprise' }).success).toBe(true)
    expect(schema.safeParse({ type: 'addAi', seat: 1, persona: 'evil' }).success).toBe(false)
  })

  test('a computer’s persona may be changed to one of the four or a surprise, and must be named', () => {
    expect(schema.safeParse({ type: 'setPersona', seat: 1, persona: 'sharp' }).success).toBe(true)
    expect(schema.safeParse({ type: 'setPersona', seat: 1, persona: 'surprise' }).success).toBe(true)
    expect(schema.safeParse({ type: 'setPersona', seat: 1 }).success).toBe(false)
    expect(schema.safeParse({ type: 'setPersona', seat: 1, persona: 'evil' }).success).toBe(false)
  })
})
