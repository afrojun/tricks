import { describe, expect, test, vi } from 'vitest'
import { chooseAction, chooseJodhi } from '../games/thunee/ai/choose'
import { HONEST } from '../kit/mind'
import type { TableState } from '../kit/table'
import type { Action, GameEvent, View } from '../games/thunee/engine'
import { type Game, createGame } from '../games/thunee/engine'
import { Table, card, seededRng } from '../games/thunee/engine/testing'
import { gameOf, isRoomName } from '../games'
import { type View as HeartsView, availableActions as heartsAvailable, createGame as createHearts, FORMAT_VERSION as HEARTS_FORMAT } from '../games/hearts'
import { GameStore } from '../client/store'
import { type ServerMessage as GenericServerMessage, UNKNOWN_ROOM_CLOSE_CODE, roomName } from '../protocol'
import { type RoomConnection, type RoomHost, TableRoom } from './room'

type ServerMessage = GenericServerMessage<View, GameEvent>
type Sync = Extract<ServerMessage, { type: 'sync' }>

class FakeConn implements RoomConnection {
  state: { token: string } | null = null
  inbox: ServerMessage[] = []
  closed: { code: number; reason: string } | null = null
  constructor(
    readonly id: string,
    readonly token: string,
  ) {}
  setState(s: { token: string }) {
    this.state = s
    return s
  }
  close(code: number, reason: string) {
    this.closed = { code, reason }
  }
  raw: string[] = []
  send(raw: string) {
    this.raw.push(raw)
    if (raw !== 'pong') this.inbox.push(JSON.parse(raw))
  }
  get sync(): Sync {
    return this.inbox.filter((m): m is Sync => m.type === 'sync').at(-1)!
  }
  get view(): View {
    return this.sync.view
  }
  take(): ServerMessage[] {
    return this.inbox.splice(0)
  }
}

/** A stand-in for the room's host: storage, an alarm, a clock, and connections. */
class World {
  data = new Map<string, unknown>()
  alarm: number | null = null
  now = 1_000_000
  conns: FakeConn[] = []
  writes: string[] = []
  server!: TableRoom
  private nextId = 0

  host: RoomHost = {
    name: 'thunee-TESTAB',
    storage: {
      get: async <T>(key: string) => structuredClone(this.data.get(key)) as T | undefined,
      put: async (key: string, value: unknown) => {
        this.writes.push('put')
        this.data.set(key, structuredClone(value))
      },
      setAlarm: async (at: number) => void (this.alarm = at),
      deleteAlarm: async () => void (this.alarm = null),
    },
    connections: () => this.conns,
  }

  /** Builds a new server instance over the same storage, as after a restart: every socket is gone. */
  async boot() {
    this.conns = []
    return this.wake()
  }

  /** Builds a new server instance over the same storage and the same open sockets, as after hibernation. */
  async wake() {
    this.server = new TableRoom(this.host, { now: () => this.now, rng: seededRng(42) })
    await this.server.onStart()
    return this
  }

  /** A socket that goes away without the room hearing of it, as while the room sleeps. */
  lose(conn: FakeConn) {
    this.conns = this.conns.filter((c) => c !== conn)
  }

  async connect(token: string) {
    const conn = new FakeConn(`c${this.nextId++}`, token)
    const original = conn.send.bind(conn)
    conn.send = (raw: string) => {
      this.writes.push('send')
      original(raw)
    }
    this.conns.push(conn)
    await this.server.onConnect(conn, `https://x/parties/room/${this.host.name}?token=${token}`)
    return conn
  }

  async close(conn: FakeConn) {
    this.conns = this.conns.filter((c) => c !== conn)
    await this.server.onClose(conn)
  }

  send(conn: FakeConn, action: Action | object) {
    return this.server.onMessage(JSON.stringify({ action }), conn)
  }

  async fireAlarm() {
    if (this.alarm === null) throw new Error('no alarm set')
    this.now = Math.max(this.now, this.alarm)
    this.alarm = null
    await this.server.onAlarm()
  }
}

const TOKENS = ['a', 'b', 'c', 'd'].map((x) => x.repeat(20))

/** Four humans seated and the game started. */
async function startedGame() {
  const w = await new World().boot()
  const conns: FakeConn[] = []
  for (const [seat, token] of TOKENS.entries()) {
    const conn = await w.connect(token)
    await w.send(conn, { type: 'sit', seat, name: `P${seat}` })
    conns.push(conn)
  }
  await w.send(conns[0], { type: 'start' })
  return { w, conns }
}

describe('room names', () => {
  test('a room is named by a known game and a six-letter code', () => {
    expect(roomName('thunee', 'ABCDEF')).toBe('thunee-ABCDEF')
    expect(isRoomName('thunee-ABCDEF')).toBe(true)
    expect(isRoomName('hearts-ABCDEF')).toBe(true)
    for (const name of ['thunee-ABCDE', 'thunee-ABCDEFG', 'thunee-abcdef', 'thunee_ABCDEF', 'spades-ABCDEF', 'ABCDEF', 'main', '']) {
      expect(isRoomName(name)).toBe(false)
    }
  })

  test('a connection to a room with any other name is closed and sent nothing', async () => {
    const w = new World()
    w.host = { ...w.host, name: 'SIM123' }
    await w.boot()
    const conn = await w.connect(TOKENS[0])
    expect(conn.closed).toEqual({ code: UNKNOWN_ROOM_CLOSE_CODE, reason: expect.any(String) })
    expect(conn.raw).toEqual([])
    await w.send(conn, { type: 'sit', seat: 0, name: 'Nobody' })
    expect(w.data.size).toBe(0)
  })

  test('a room named by a game the server does not hold is refused the same way, saved state or not', async () => {
    const w = new World()
    w.host = { ...w.host, name: 'spades-ABCDEF' }
    w.data.set('state', { game: createGame(), tokens: {}, version: 3, eventCount: 0, emptySince: null })
    await w.boot()
    const conn = await w.connect(TOKENS[0])
    expect(conn.closed).toEqual({ code: UNKNOWN_ROOM_CLOSE_CODE, reason: expect.any(String) })
    expect(conn.raw).toEqual([])
    await w.send(conn, { type: 'sit', seat: 0, name: 'Nobody' })
    await w.server.onAlarm()
    await w.close(conn)
    expect(w.writes).toEqual([])
  })
})

describe('a room for any game', () => {
  /** A Hearts room with one human at seat 0 and three computers, started. */
  async function heartsGame() {
    const w = new World()
    w.host = { ...w.host, name: 'hearts-ABCDEF' }
    await w.boot()
    const me = await w.connect(TOKENS[0])
    const lobby = me.view as unknown as HeartsView
    expect(lobby).toMatchObject({ seat: null, playerCount: 4, phase: { kind: 'lobby' }, rules: { gameEndsAt: 100 } })
    await w.send(me, { type: 'sit', seat: 0, name: 'Human' })
    for (const seat of [1, 2, 3]) await w.send(me, { type: 'addAi', seat })
    await w.send(me, { type: 'start' })
    return { w, me, view: () => me.view as unknown as HeartsView }
  }

  test('a Hearts room seats a player, takes computers and starts, and its views are Hearts’', async () => {
    const { me, view } = await heartsGame()
    expect(me.inbox.filter((m) => m.type === 'rejected' || m.type === 'error')).toEqual([])
    expect(view()).toMatchObject({ seat: 0, phase: { kind: 'passing' }, direction: 'left' })
    expect(view().seats.map((s) => s.kind)).toEqual(['human', 'ai', 'ai', 'ai'])
    expect((view().phase as { hand: unknown[] }).hand).toHaveLength(13)
  })

  test('a Hearts round proceeds with its computer players, the human passing and playing', async () => {
    const { w, me, view } = await heartsGame()
    let mine = 0
    for (let guard = 0; guard < 500 && view().phase.kind !== 'roundResult'; guard++) {
      const can = heartsAvailable(view())
      if (can.pass.length > 0) await w.send(me, { type: 'choosePass', cards: can.pass.slice(0, 3) } as never)
      else if (can.legal.length > 0) {
        mine++
        await w.send(me, { type: 'playCard', card: can.legal[0] } as never)
      } else await w.fireAlarm() // computers' passes and cards, and trick pauses
    }
    expect(view().phase.kind).toBe('roundResult')
    expect(mine).toBe(13)
    const played = me.inbox.flatMap((m) => (m.type === 'sync' ? m.events : [])).filter((e) => e.type === 'cardPlayed')
    expect(played).toHaveLength(52)
    expect(me.inbox.filter((m) => m.type === 'rejected' || m.type === 'error')).toEqual([])
    expect(JSON.stringify(me.inbox)).not.toContain('"handBefore"')
  })

  test('each room reads messages with its own game’s schema', async () => {
    const { w, me } = await heartsGame()
    me.take()
    await w.send(me, { type: 'call', amount: 10 })
    await w.send(me, { type: 'choosePass', cards: [{ suit: 'clubs', rank: '2' }] })
    expect(me.take()).toEqual(Array(2).fill({ type: 'rejected', reason: 'malformed' }))

    const { w: t, conns } = await startedGame()
    conns[0].take()
    await t.send(conns[0], { type: 'choosePass', cards: [] })
    expect(conns[0].take()).toEqual([{ type: 'rejected', reason: 'malformed' }])
  })

  test('a room saved in another format for its game starts a fresh lobby of that game', async () => {
    const w = new World()
    w.host = { ...w.host, name: 'hearts-ABCDEF' }
    const old = { ...createHearts(), formatVersion: HEARTS_FORMAT + 1 }
    old.seats[0] = { ...old.seats[0], name: 'Old', kind: 'human', connected: true }
    w.data.set('state', { game: old, tokens: { [TOKENS[0]]: 0 }, version: 3, eventCount: 0, emptySince: null })
    await w.boot()
    const me = await w.connect(TOKENS[0])
    expect(me.sync).toMatchObject({ seat: null, version: 0, view: { phase: { kind: 'lobby' }, rules: { gameEndsAt: 100 } } })
    expect(me.view.seats.every((x) => x.kind === 'empty')).toBe(true)
  })

  test('a Hearts room keeps its saved game across a wake, with its sockets’ seats connected', async () => {
    const { w, me, view } = await heartsGame()
    const before = view()
    await w.wake()
    const watcher = await w.connect('w'.repeat(20))
    expect(watcher.sync.version).toBe(me.sync.version)
    expect((watcher.view as unknown as HeartsView).phase.kind).toBe(before.phase.kind)
    expect(watcher.view.seats.map((s) => s.connected)).toEqual([true, true, true, true])
  })
})

describe('identity', () => {
  test('a new connection gets the current view with no events', async () => {
    const w = await new World().boot()
    const conn = await w.connect(TOKENS[0])
    expect(conn.inbox).toHaveLength(1)
    expect(conn.sync).toMatchObject({ type: 'sync', seat: null, events: [], view: { phase: { kind: 'lobby' } } })
  })

  test('a token that sat reconnects to the same seat with its hand', async () => {
    const { w, conns } = await startedGame()
    const hand = (conns[2].view.phase as { hand: unknown[] }).hand
    expect(hand).toHaveLength(4)
    await w.close(conns[2])
    expect(conns[0].view.seats[2].connected).toBe(false)

    const back = await w.connect(TOKENS[2])
    expect(back.inbox[0]).toMatchObject({ type: 'sync', seat: 2, events: [] })
    expect((back.inbox[0] as Sync).view.phase).toMatchObject({ hand })
    expect(conns[0].view.seats[2].connected).toBe(true)
  })

  test('two connections on one token: closing one keeps the seat connected', async () => {
    const { w, conns } = await startedGame()
    const secondTab = await w.connect(TOKENS[1])
    expect(secondTab.sync.seat).toBe(1)
    await w.close(conns[1])
    expect(conns[0].view.seats[1].connected).toBe(true)
    await w.close(secondTab)
    expect(conns[0].view.seats[1].connected).toBe(false)
  })

  test('an unknown token is a spectator and never receives a hand, a token or another seat’s cards', async () => {
    const { w, conns } = await startedGame()
    const watcher = await w.connect('z'.repeat(20))
    expect(watcher.sync.seat).toBeNull()
    expect(watcher.view.phase).toMatchObject({ kind: 'calling', hand: [] })
    const everything = JSON.stringify([watcher.inbox, conns[0].inbox])
    for (const token of TOKENS) expect(everything).not.toContain(token)
    expect(JSON.stringify(conns[0].view)).not.toContain('"stock"')
  })

  test('a missing or too-short token cannot take a seat that survives a reconnect', async () => {
    const w = await new World().boot()
    const conn = await w.connect('short')
    await w.send(conn, { type: 'sit', seat: 0, name: 'Anon' })
    expect(conn.sync.seat).toBe(0)
    await w.close(conn)
    expect((await w.connect('short')).sync.seat).toBeNull()
  })
})

describe('tokens are looked up only among the room’s own', () => {
  // Names every object inherits. The first two are long enough to be kept as tokens; the others are
  // too short and become anonymous, but are checked all the same.
  const INHERITED = ['__defineGetter__', 'propertyIsEnumerable', 'constructor', 'toString']
  const GAMES = ['thunee-TESTAB', 'hearts-ABCDEF']

  async function room(name: string) {
    const w = new World()
    w.host = { ...w.host, name }
    return w.boot()
  }
  /** Seats `me` at 0, fills the other seats with computers and starts. */
  async function start(w: World, me: FakeConn) {
    await w.send(me, { type: 'sit', seat: 0, name: 'Human' })
    for (const seat of [1, 2, 3]) await w.send(me, { type: 'addAi', seat })
    await w.send(me, { type: 'start' })
  }
  const saved = (w: World) => w.data.get('state') as { game: TableState; version: number }
  /** The one alarm is set to the saved game's next deadline (no human has left, so no abandonment clock). */
  function expectArmed(w: World) {
    const due = gameOf(w.host.name)!.nextDeadline(saved(w).game)
    expect(due).not.toBeNull()
    expect(w.alarm).toBe(Math.max(due!, w.now + 1))
  }
  const troubles = (conns: FakeConn[]) => conns.flatMap((c) => c.inbox).filter((m) => m.type === 'error' || m.type === 'rejected')

  for (const name of GAMES) {
    for (const token of INHERITED) {
      test(`${name}: "${token}" in the lobby is a spectator, and the game still starts, is saved and has its alarm`, async () => {
        const w = await room(name)
        const stranger = await w.connect(token)
        expect(stranger.sync.seat).toBeNull()
        const me = await w.connect(TOKENS[0])
        await start(w, me)
        expect(saved(w).game.phase.kind).not.toBe('lobby')
        expectArmed(w)
        expect(stranger.sync).toMatchObject({ seat: null, version: saved(w).version })
        expect(me.sync.version).toBe(saved(w).version)
        expect(troubles([me, stranger])).toEqual([])
      })
    }

    test(`${name}: inherited names connecting during play are spectators, and play goes on`, async () => {
      const w = await room(name)
      const me = await w.connect(TOKENS[0])
      await start(w, me)
      const strangers = []
      for (const token of INHERITED) strangers.push(await w.connect(token))
      for (const s of strangers) expect(s.sync).toMatchObject({ seat: null, version: me.sync.version })
      const version = me.sync.version
      await w.fireAlarm() // a computer's turn
      expect(me.sync.version).toBeGreaterThan(version)
      for (const s of strangers) expect(s.sync.version).toBe(me.sync.version)
      expectArmed(w)
      expect(troubles([me, ...strangers])).toEqual([])
    })

    test(`${name}: a wake that must tell the table of a lost seat completes with inherited names connected`, async () => {
      const w = await room(name)
      const me = await w.connect(TOKENS[0])
      const other = await w.connect(TOKENS[1])
      await w.send(me, { type: 'sit', seat: 0, name: 'Human' })
      await w.send(other, { type: 'sit', seat: 1, name: 'Other' })
      for (const seat of [2, 3]) await w.send(me, { type: 'addAi', seat })
      await w.send(me, { type: 'start' })
      const strangers = []
      for (const token of INHERITED) strangers.push(await w.connect(token))
      const version = me.sync.version
      w.lose(other)
      w.alarm = null // as if the alarm were lost with the old instance
      await w.wake()
      expect(me.sync.version).toBe(version + 1)
      expect(me.view.seats[1].connected).toBe(false)
      for (const s of strangers) expect(s.sync).toMatchObject({ seat: null, version: version + 1 })
      expectArmed(w)
      expect(troubles([me, ...strangers])).toEqual([])
    })
  }

  test('a token named like an inherited property may still sit, and comes back to its seat', async () => {
    const w = await new World().boot()
    const odd = await w.connect('__defineGetter__')
    await w.send(odd, { type: 'sit', seat: 2, name: 'Odd' })
    expect(odd.sync.seat).toBe(2)
    await w.close(odd)
    const back = await w.connect('__defineGetter__')
    expect(back.sync.seat).toBe(2)
    expect(back.view.seats[2]).toMatchObject({ kind: 'human', connected: true })
  })

  test('a token saved against a seat no human holds is a spectator', async () => {
    const w = new World()
    w.data.set('state', { game: createGame(), tokens: { [TOKENS[0]]: 1, [TOKENS[1]]: 1.5, [TOKENS[2]]: 'x' }, version: 3, eventCount: 0, emptySince: null })
    await w.boot()
    for (const token of TOKENS.slice(0, 3)) {
      const conn = await w.connect(token)
      expect(conn.sync.seat).toBeNull()
      expect(troubles([conn])).toEqual([])
    }
  })

  test('a socket whose send throws keeps nobody else from the new view, and the room keeps its alarm', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { w, conns } = await startedGame()
      const [broken, ...rest] = conns // the first socket the room tells
      broken.send = () => {
        throw new Error('the socket is gone')
      }
      const version = rest[0].sync.version
      await w.send(conns[2], { type: 'pass' })
      for (const c of rest) expect(c.sync.version).toBe(version + 1)
      expect(saved(w).version).toBe(version + 1)
      expectArmed(w)
      expect(errors).toHaveBeenCalled()
      // The room is not stuck: its alarm closes the call window and everyone else sees that too.
      await w.fireAlarm()
      for (const c of rest) expect(c.view.phase.kind).toBe('trumpSelection')
      for (const c of rest) expect(c.sync.version).toBe(saved(w).version)
      expect(troubles(rest)).toEqual([])
    } finally {
      errors.mockRestore()
    }
  })
})

describe('messages', () => {
  test('a rejected action goes to the sender only and changes nothing', async () => {
    const { w, conns } = await startedGame()
    const version = conns[0].sync.version
    conns.forEach((c) => c.take())
    await w.send(conns[1], { type: 'start' })
    expect(conns[1].take()).toEqual([{ type: 'rejected', reason: 'wrongPhase' }])
    expect(conns[0].take()).toEqual([])
    await w.send(conns[2], { type: 'rematch' })
    expect(conns[2].take()).toEqual([{ type: 'rejected', reason: 'wrongPhase' }])
    const fresh = await w.connect('y'.repeat(20))
    expect(fresh.sync.version).toBe(version)
  })

  test('malformed JSON, unknown actions, system actions and oversized messages are rejected', async () => {
    const { w, conns } = await startedGame()
    conns[0].take()
    for (const raw of ['{not json', '{"action":{"type":"nope"}}', '{"action":{"type":"tick"}}', '[]', 'x'.repeat(5000)]) {
      await w.server.onMessage(raw, conns[0])
    }
    expect(conns[0].take()).toEqual(Array(5).fill({ type: 'rejected', reason: 'malformed' }))
  })

  test('a ping is answered with a pong and changes nothing', async () => {
    const { w, conns } = await startedGame()
    const version = conns[0].sync.version
    conns[0].take()
    await w.server.onMessage('ping', conns[0])
    expect(conns[0].raw.at(-1)).toBe('pong')
    expect(conns[0].take()).toEqual([])
    expect((await w.connect('p'.repeat(20))).sync.version).toBe(version)
  })

  test('state is written before any sync is sent', async () => {
    const { w, conns } = await startedGame()
    w.writes.length = 0
    await w.send(conns[2], { type: 'pass' })
    expect(w.writes[0]).toBe('put')
    expect(w.writes.slice(1).every((x) => x === 'send')).toBe(true)
    expect(w.writes.length).toBeGreaterThan(1)
  })

  test('events are numbered consecutively and versions increase by one', async () => {
    const { w, conns } = await startedGame()
    const numbers = conns[0].inbox.flatMap((m) => (m.type === 'sync' ? m.events.map((e) => e.n) : []))
    expect(numbers).toEqual(numbers.map((_, i) => numbers[0] + i))
    const before = conns[0].sync.version
    await w.send(conns[2], { type: 'pass' })
    expect(conns[0].sync.version).toBe(before + 1)
  })
})

describe('timers', () => {
  test('the alarm tracks the call window and closes it when it fires', async () => {
    const { w, conns } = await startedGame()
    expect(w.alarm).toBe(w.now + 10_000)
    await w.fireAlarm()
    expect(conns[0].view.phase.kind).toBe('trumpSelection')
    expect(w.alarm).toBeNull()
  })

  test('an alarm that fires early is re-armed instead of leaving the game with none', async () => {
    const { w, conns } = await startedGame()
    const deadline = w.alarm!
    w.alarm = null
    w.now = deadline - 5 // fired 5 ms early
    await w.server.onAlarm()
    expect(conns[0].view.phase.kind).toBe('calling')
    expect(w.alarm).toBe(deadline)
  })

  test('a restart in the middle of the call window resumes and closes it', async () => {
    const { w } = await startedGame()
    const deadline = w.alarm!
    w.alarm = null // as if the alarm were lost with the old instance
    await w.boot()
    expect(w.alarm).toBe(deadline)
    const back = await w.connect(TOKENS[0])
    expect(back.sync).toMatchObject({ seat: 0, view: { phase: { kind: 'calling' } } })
    await w.fireAlarm()
    expect(back.view.phase.kind).toBe('trumpSelection')
  })

  test('after a restart every human seat is disconnected until it reconnects', async () => {
    const { w } = await startedGame()
    await w.boot()
    const watcher = await w.connect('w'.repeat(20))
    expect(watcher.view.seats.map((s) => s.connected)).toEqual([false, false, false, false])
    await w.connect(TOKENS[3])
    expect(watcher.view.seats.map((s) => s.connected)).toEqual([false, false, false, true])
  })

  test('an unreadable saved format starts a fresh lobby', async () => {
    const w = new World()
    w.data.set('state', { game: { formatVersion: 999 }, tokens: {}, version: 7, eventCount: 0 })
    await w.boot()
    expect((await w.connect(TOKENS[0])).sync).toMatchObject({ version: 0, view: { phase: { kind: 'lobby' } } })
  })

  test('a client that reconnects to a room reset by a new format hears the new game’s events', async () => {
    const { w, conns } = await startedGame()
    const store = new GameStore<View, GameEvent>()
    const heard: number[] = []
    store.onEvent((e) => heard.push(e.n))
    const feed = (conn: FakeConn) => {
      for (const message of conn.take()) store.receive(message, w.now)
    }
    store.setConnection('open')
    feed(conns[0])
    await w.send(conns[2], { type: 'pass' })
    feed(conns[0])
    expect(heard.length).toBeGreaterThan(0)
    const highest = Math.max(...heard)

    // A deploy raises the format: the sockets drop, and the room comes back as a fresh lobby.
    const state = w.data.get('state') as { game: Game }
    w.data.set('state', { ...state, game: { ...state.game, formatVersion: 999 } })
    store.setConnection('reconnecting')
    await w.boot()
    store.setConnection('open')
    const back = await w.connect(TOKENS[0])
    feed(back)
    expect(store.getState()).toMatchObject({ version: 0, seat: null, view: { phase: { kind: 'lobby' } } })

    const before = heard.length
    await w.send(back, { type: 'sit', seat: 0, name: 'Again' })
    const numbers = back.sync.events.map((e) => e.n)
    expect(numbers[0]).toBe(1)
    expect(Math.max(...numbers)).toBeLessThan(highest) // numbered from one again, below what the client heard
    feed(back)
    expect(heard.slice(before)).toEqual(numbers)
  })

  test('a format 1 save is discarded and replaced by an empty lobby', async () => {
    const w = new World()
    const old = { ...createGame(), formatVersion: 1 }
    old.seats[0] = { ...old.seats[0], name: 'Old', kind: 'human', connected: true }
    w.data.set('state', { game: old, tokens: { [TOKENS[0]]: 0 }, version: 3, eventCount: 0, emptySince: null })
    await w.boot()
    const me = await w.connect(TOKENS[0])
    expect(me.sync).toMatchObject({ seat: null, version: 0, view: { phase: { kind: 'lobby' } } })
    expect(me.view.seats.every((x) => x.kind === 'empty')).toBe(true)
  })
})

describe('waking from hibernation', () => {
  test('a wake with the sockets still open leaves their seats connected, and they play on', async () => {
    const { w, conns } = await startedGame()
    const version = conns[0].sync.version
    await w.wake()
    const watcher = await w.connect('w'.repeat(20))
    expect(watcher.view.seats.map((s) => s.connected)).toEqual([true, true, true, true])
    expect(watcher.sync.version).toBe(version)

    conns.forEach((c) => c.take())
    await w.send(conns[2], { type: 'pass' }) // the token is read back from the socket's state
    expect(conns[2].inbox.filter((m) => m.type === 'rejected')).toEqual([])
    expect(conns[0].sync.version).toBe(version + 1)
  })

  test('a wake with nothing changed writes nothing and sends nothing', async () => {
    const { w } = await startedGame()
    w.writes.length = 0
    await w.wake()
    expect(w.writes).toEqual([])
  })

  test('a restart of a room everyone had already left writes nothing', async () => {
    const { w, conns } = await startedGame()
    for (const conn of conns) await w.close(conn)
    w.writes.length = 0
    await w.boot()
    expect(w.writes).toEqual([])
  })

  test('a seat whose only socket went away while the room slept is disconnected on wake, and the table is told', async () => {
    const { w, conns } = await startedGame()
    const secondTab = await w.connect(TOKENS[1])
    w.lose(conns[3])
    w.lose(conns[1]) // seat 1 still has its second tab
    const version = conns[0].sync.version
    await w.wake()
    expect(conns[0].sync).toMatchObject({ version: version + 1, events: [] })
    expect(conns[0].view.seats.map((s) => s.connected)).toEqual([true, true, true, false])
    expect(secondTab.sync.seat).toBe(1)
    expect(w.data.get('state')).toMatchObject({ version: version + 1 })
  })

  test('a close that wakes the room is not applied a second time', async () => {
    const { w, conns } = await startedGame()
    w.lose(conns[3]) // a closing socket is no longer open when the room wakes for its close
    await w.wake()
    expect(conns[0].view.seats[3].connected).toBe(false)
    const version = conns[0].sync.version
    w.writes.length = 0
    await w.server.onClose(conns[3])
    expect(w.writes).toEqual([])
    expect(conns[0].sync.version).toBe(version)
  })
})

describe('AI seats', () => {
  test('one human and three AIs play a whole game on alarms', async () => {
    const w = await new World().boot()
    const me = await w.connect(TOKENS[0])
    await w.send(me, { type: 'sit', seat: 0, name: 'Human' })
    for (const seat of [1, 2, 3]) await w.send(me, { type: 'addAi', seat })
    await w.send(me, { type: 'setRules', overrides: { ballsToWin: 4 } })
    await w.send(me, { type: 'start' })

    let rounds = 0
    for (let guard = 0; guard < 4000 && me.view.phase.kind !== 'gameOver'; guard++) {
      const phase = me.view.phase
      expect(me.inbox.some((m) => m.type === 'error')).toBe(false)
      if (phase.kind === 'roundResult') {
        rounds++
        await w.send(me, { type: 'nextRound' })
      } else if (phase.kind === 'trumpSelection' && phase.trumper === 0) {
        await w.send(me, chooseAction(me.view, HONEST))
      } else if (phase.kind === 'playing' && phase.turn === 0) {
        await w.send(me, chooseJodhi(me.view, HONEST) ?? chooseAction(me.view, HONEST))
      } else {
        await w.fireAlarm() // AI turns, call windows and trick pauses
      }
    }
    expect(me.view.phase.kind).toBe('gameOver')
    expect(rounds).toBeGreaterThan(0)
    expect(me.inbox.filter((m) => m.type === 'rejected')).toEqual([])
    expect(JSON.stringify(me.inbox)).not.toContain('"handBefore"')
  })

  test('the host can hand a disconnected seat to the AI, and the player takes it back', async () => {
    const { w, conns } = await startedGame()
    await w.close(conns[2])
    await w.send(conns[0], { type: 'replaceWithAi', seat: 2 })
    expect(conns[0].view.seats[2]).toMatchObject({ kind: 'human', standIn: true })
    await w.fireAlarm() // the stand-in answers the call window
    expect(conns[0].view.phase).toMatchObject({ kind: 'calling' })
    expect((conns[0].view.phase as { passed: number[]; call: unknown }).passed.includes(2) || (conns[0].view.phase as { call: { seat: number } | null }).call?.seat === 2).toBe(true)

    const back = await w.connect(TOKENS[2])
    expect(back.sync.seat).toBe(2)
    await w.send(back, { type: 'reclaimSeat' })
    expect(back.view.seats[2]).toMatchObject({ standIn: false, connected: true })
  })
})

describe('abandoned rooms', () => {
  const DAY = 24 * 60 * 60 * 1000

  /** One human and three computers, started, then the human disconnects. */
  async function abandoned() {
    const w = await new World().boot()
    const me = await w.connect(TOKENS[0])
    await w.send(me, { type: 'sit', seat: 0, name: 'Human' })
    for (const seat of [1, 2, 3]) await w.send(me, { type: 'addAi', seat })
    await w.send(me, { type: 'start' })
    const leftAt = w.now
    await w.close(me)
    return { w, leftAt }
  }
  /** Fires alarms until the next one is more than a minute away, or `limit` is reached. */
  async function settle(w: World, limit = 500) {
    for (let i = 0; i < limit && w.alarm !== null && w.alarm - w.now < 60_000; i++) await w.fireAlarm()
  }

  test('a room with no human connected for a day resets to an empty lobby', async () => {
    const { w, leftAt } = await abandoned()
    await settle(w) // the computers play on until the game needs the human
    expect(w.alarm).toBe(leftAt + DAY)
    await w.fireAlarm()
    expect(w.alarm).toBeNull()

    const back = await w.connect(TOKENS[0])
    expect(back.sync.seat).toBeNull()
    expect(back.view.phase.kind).toBe('lobby')
    expect(back.view.seats.every((s) => s.kind === 'empty')).toBe(true)
    expect(back.view.host).toBeNull()
  })

  test('coming back before the day is up cancels the reset', async () => {
    const { w, leftAt } = await abandoned()
    await settle(w)
    w.now = leftAt + DAY - 1000
    const back = await w.connect(TOKENS[0])
    expect(back.sync.seat).toBe(0)
    expect(back.view.phase.kind).not.toBe('lobby')
    expect(w.alarm === null || w.alarm < leftAt + DAY - 1000 + 60_000).toBe(true) // only game timers remain
    // Leaving again starts a fresh day.
    await w.close(back)
    await settle(w)
    expect(w.alarm).toBe(leftAt + DAY - 1000 + DAY)
  })

  test('the countdown survives a room restart', async () => {
    const { w, leftAt } = await abandoned()
    await settle(w)
    w.alarm = null
    await w.boot()
    expect(w.alarm).toBe(leftAt + DAY)
    await w.fireAlarm()
    expect((await w.connect(TOKENS[0])).view.phase.kind).toBe('lobby')
  })

  test('a watching spectator does not keep the room alive, and sees the reset', async () => {
    const { w } = await abandoned()
    const watcher = await w.connect('s'.repeat(20))
    const before = watcher.sync.version
    await settle(w)
    await w.fireAlarm()
    expect(watcher.view.phase.kind).toBe('lobby')
    expect(watcher.sync.version).toBeGreaterThan(before) // clients ignore lower versions
  })

  test('a lobby everyone left is reset too, but an untouched room never sets an alarm', async () => {
    const w = await new World().boot()
    const visitor = await w.connect(TOKENS[0])
    await w.close(visitor)
    expect(w.alarm).toBeNull()

    const me = await w.connect(TOKENS[0])
    await w.send(me, { type: 'sit', seat: 0, name: 'Human' })
    await w.close(me)
    expect(w.alarm).toBe(w.now + DAY)
    await w.fireAlarm()
    expect(w.alarm).toBeNull()
    expect((await w.connect(TOKENS[0])).sync.seat).toBeNull()
  })
})

describe('computer personas', () => {
  const D1 = ['Jh 9h Ks Qs 10c Qd', 'Js 9s As 10s Kd Qc', 'Jc 9c Ac Kc Ah 10h', 'Jd 9d Ad 10d Kh Qh']

  /** A saved room in which seats 0 and 2 are Straight computers and seat 1 (a human) has just reneged. */
  async function afterRenege() {
    const t = new Table(4, { redealIfNoTrumps: false }).deal(D1).toPlay('spades').play('Kc Qh 10c Js').endPause()
    const game: Game = {
      ...t.game,
      host: 1,
      seats: t.game.seats.map((s, i) => (i % 2 === 0 ? { ...s, kind: 'ai' as const, name: `Bot ${i}` } : s)),
    }
    const w = new World()
    w.data.set('state', { game, tokens: { [TOKENS[1]]: 1, [TOKENS[3]]: 3 }, version: 1, eventCount: 0, emptySince: null })
    await w.boot()
    return { w, me: await w.connect(TOKENS[1]) }
  }

  test('a computer catches a clumsy renege the moment it shows', async () => {
    const { w, me } = await afterRenege()
    await w.send(me, { type: 'playCard', card: card('Qc') })
    expect(me.view.phase).toMatchObject({ kind: 'roundResult', summary: { reason: 'challenge', challenge: { accused: 1, guilty: true } } })
    expect(me.inbox.some((m) => m.type === 'error')).toBe(false)
  })
})
