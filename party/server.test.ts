import type * as Party from 'partykit/server'
import { describe, expect, test } from 'vitest'
import { chooseAction, chooseJodhi } from '../src/ai/choose'
import type { Action, View } from '../src/engine'
import { seededRng } from '../src/engine/testing'
import type { ServerMessage } from '../src/protocol'
import ThuneeRoom from './server'

type Sync = Extract<ServerMessage, { type: 'sync' }>

class FakeConn {
  state: { token: string } | null = null
  inbox: ServerMessage[] = []
  constructor(
    readonly id: string,
    readonly token: string,
  ) {}
  setState(s: { token: string }) {
    this.state = s
    return s
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

/** A stand-in for a PartyKit room: storage, an alarm, a clock, and connections. */
class World {
  data = new Map<string, unknown>()
  alarm: number | null = null
  now = 1_000_000
  conns: FakeConn[] = []
  writes: string[] = []
  server!: ThuneeRoom
  private nextId = 0

  room = {
    id: 'TEST',
    storage: {
      get: async (key: string) => structuredClone(this.data.get(key)),
      put: async (key: string, value: unknown) => {
        this.writes.push('put')
        this.data.set(key, structuredClone(value))
      },
      setAlarm: async (at: number) => void (this.alarm = at),
      deleteAlarm: async () => void (this.alarm = null),
    },
    getConnections: () => this.conns,
  } as unknown as Party.Room

  /** Builds a new server instance over the same storage, as after a restart. */
  async boot() {
    this.conns = []
    this.server = new ThuneeRoom(this.room, { now: () => this.now, rng: seededRng(42) })
    await this.server.onStart()
    return this
  }

  async connect(token: string) {
    const conn = new FakeConn(`c${this.nextId++}`, token)
    const original = conn.send.bind(conn)
    conn.send = (raw: string) => {
      this.writes.push('send')
      original(raw)
    }
    this.conns.push(conn)
    const url = `https://x/parties/main/TEST?token=${token}`
    await this.server.onConnect(conn as never, { request: { url } } as never)
    return conn
  }

  async close(conn: FakeConn) {
    this.conns = this.conns.filter((c) => c !== conn)
    await this.server.onClose(conn as never)
  }

  send(conn: FakeConn, action: Action | object) {
    return this.server.onMessage(JSON.stringify({ action }), conn as never)
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
      await w.server.onMessage(raw, conns[0] as never)
    }
    expect(conns[0].take()).toEqual(Array(5).fill({ type: 'rejected', reason: 'malformed' }))
  })

  test('a ping is answered with a pong and changes nothing', async () => {
    const { w, conns } = await startedGame()
    const version = conns[0].sync.version
    conns[0].take()
    await w.server.onMessage('ping', conns[0] as never)
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
        await w.send(me, chooseAction(me.view))
      } else if (phase.kind === 'playing' && phase.turn === 0) {
        await w.send(me, chooseJodhi(me.view) ?? chooseAction(me.view))
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
