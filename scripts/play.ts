/**
 * Plays a whole game against the running app over real sockets: two scripted
 * humans and two AI seats, with one human dropping and reconnecting mid-game.
 * First checks that a socket to a name that is not a room is closed with the
 * room's close code, that a plain request to a room's address gets a 404, and
 * that a Hearts room opens as a lobby of four. At game over, checks that talk is
 * relayed within its limit and that the next game starts once both people say Again. The
 * rooms share the app's origin. Usage: pnpm dev (in another terminal), then
 * pnpm e2e:sockets, with APP_URL set if the app is not on http://localhost:5173.
 */
import PartySocket from 'partysocket'
import { chooseAction, chooseJodhi } from '../src/games/thunee/ai/choose'
import { HONEST } from '../src/kit/mind'
import { type Action, type GameEvent, type View, availableActions } from '../src/games/thunee/engine'
import type { Said, Say } from '../src/kit/talk'
import { type ServerMessage, UNKNOWN_ROOM_CLOSE_CODE, roomName } from '../src/protocol'

const app = new URL(process.env.APP_URL ?? 'http://localhost:5173')
const host = app.host
const protocol = app.protocol === 'https:' ? 'wss' : 'ws'
const code = Array.from({ length: 6 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('')
const room = roomName('thunee', code)

class Player {
  socket!: PartySocket
  view: View | null = null
  seat: number | null = null
  rejections: string[] = []
  errors: string[] = []
  said: Said[] = []
  events = 0
  constructor(
    readonly name: string,
    readonly token: string,
  ) {
    this.connect()
  }
  connect() {
    this.socket = new PartySocket({ host, protocol, party: 'room', room, query: { token: this.token } })
    this.socket.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data as string) as ServerMessage<View, GameEvent>
      if (msg.type === 'sync') {
        this.view = msg.view
        this.seat = msg.seat
        this.events += msg.events.length
      } else if (msg.type === 'rejected') this.rejections.push(msg.reason)
      else if (msg.type === 'said') this.said.push(msg)
      else if (msg.type === 'error') this.errors.push(msg.message)
    })
  }
  send(action: Action) {
    this.socket.send(JSON.stringify({ action }))
  }
  say(say: Say) {
    this.socket.send(JSON.stringify({ say }))
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function until(what: string, check: () => boolean, ms = 15_000) {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`)
    await sleep(25)
  }
}

/** The close code a plain WebSocket sees when it connects to `name`. */
function closeCodeFor(name: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${protocol}://${host}/parties/room/${name}?token=script-token-zzzzzzzzzzzz`)
    const timer = setTimeout(() => {
      socket.close()
      reject(new Error(`a socket to ${name} was not closed within 5 seconds`))
    }, 5000)
    socket.addEventListener('close', (e) => {
      clearTimeout(timer)
      resolve(e.code)
    })
  })
}
for (const name of ['SIM123', 'thunee-abcdef', 'rummy-ABCDEF']) {
  const closed = await closeCodeFor(name)
  if (closed !== UNKNOWN_ROOM_CLOSE_CODE) throw new Error(`a socket to ${name} closed with ${closed}, not ${UNKNOWN_ROOM_CLOSE_CODE}`)
}
console.log(`sockets to unknown room names closed with ${UNKNOWN_ROOM_CLOSE_CODE}`)

// Rooms are reached only by socket. A plain request to a room's address is refused at the edge,
// which logs nothing of it (its URL may carry a token), and no room wakes for it.
async function plainRequest(name: string): Promise<string> {
  const response = await fetch(`${app.origin}/parties/room/${name}?token=script-token-plainrequest`)
  return `${response.status} ${await response.text()}`
}
for (const [name, want] of [
  ['SIM123', '404 Unknown room'],
  [roomName('hearts', code), '404 Not found'],
  [room, '404 Not found'],
]) {
  const got = await plainRequest(name)
  if (got !== want) throw new Error(`a plain request to ${name} got ${got}, not ${want}`)
}
console.log('plain requests to rooms are refused with 404')

/** The first view a plain WebSocket is sent by the room `name`. */
function firstViewOf(name: string): Promise<{ playerCount: number; phase: { kind: string }; rules: object }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${protocol}://${host}/parties/room/${name}?token=script-token-hhhhhhhhhhhh`)
    const timer = setTimeout(() => {
      socket.close()
      reject(new Error(`no view from ${name} within 5 seconds`))
    }, 5000)
    socket.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data as string) as ServerMessage<{ playerCount: number; phase: { kind: string }; rules: object }, unknown>
      if (msg.type !== 'sync') return
      clearTimeout(timer)
      socket.close()
      resolve(msg.view)
    })
    socket.addEventListener('close', (e) => reject(new Error(`a socket to ${name} closed with ${e.code}`)))
  })
}
// The server holds Hearts' rooms too. Hearts is played through its screens by scripts/e2e-hearts.ts.
const hearts = await firstViewOf(roomName('hearts', code))
if (hearts.playerCount !== 4 || hearts.phase.kind !== 'lobby' || !('gameEndsAt' in hearts.rules)) throw new Error(`a Hearts room opened as ${JSON.stringify(hearts)}`)
console.log(`room ${roomName('hearts', code)}: a Hearts lobby of four`)

const a = new Player('Asha', 'script-token-aaaaaaaaaaaa')
const b = new Player('Bheki', 'script-token-bbbbbbbbbbbb')
await until('connections', () => a.view !== null && b.view !== null)

a.send({ type: 'sit', seat: 0, name: a.name })
await until('host seated', () => a.seat === 0)
b.send({ type: 'sit', seat: 1, name: b.name })
a.send({ type: 'addAi', seat: 2 })
a.send({ type: 'addAi', seat: 3 })
a.send({ type: 'setRules', overrides: { ballsToWin: 3, timers: true, callTimerSeconds: 3, thuneeWindowSeconds: 0 } })
await until('seats filled', () => a.view!.seats.every((s) => s.kind !== 'empty') && b.seat === 1)
a.send({ type: 'start' })
await until('game started', () => a.view!.phase.kind !== 'lobby')
console.log(`room ${room}: started`)

let dropped = false
let lastSent = ''
const started = Date.now()
while (a.view!.phase.kind !== 'gameOver') {
  if (Date.now() - started > 8 * 60_000) throw new Error('game did not finish in 8 minutes')
  for (const p of [a, b]) {
    const view = p.view!
    if (p.seat === null) continue
    const can = availableActions(view)
    const phase = view.phase
    let action: Action | null = null
    if (phase.kind === 'roundResult' && p === a) action = { type: 'nextRound' }
    else if (phase.kind === 'calling' && (can.calls.length > 0 || can.pass)) action = chooseAction(view, HONEST)
    else if (phase.kind === 'trumpSelection' && can.chooseTrump.length > 0) action = chooseAction(view, HONEST)
    else if ((phase.kind === 'playing' || phase.kind === 'trickPause') && chooseJodhi(view, HONEST)) action = chooseJodhi(view, HONEST)
    else if (phase.kind === 'playing' && can.play.length > 0) action = chooseAction(view, HONEST)
    const key = `${p.name}:${JSON.stringify(action)}:${JSON.stringify(phase).length}:${view.roundNumber}`
    if (action && key !== lastSent) {
      p.send(action)
      lastSent = key
      await sleep(60)
    }
  }
  // Half-way through the first round, Bheki loses the connection and comes back.
  const phase = b.view!.phase
  if (!dropped && phase.kind === 'playing' && phase.tricks.length === 2) {
    dropped = true
    const handBefore = JSON.stringify(phase.hand)
    b.socket.close()
    await until('seat shown disconnected', () => a.view!.seats[1].connected === false)
    b.view = null
    b.seat = null
    b.connect()
    await until('reconnect', () => b.view !== null)
    if (b.seat !== 1) throw new Error(`reconnected to seat ${b.seat}, expected 1`)
    const now = b.view!.phase
    if (!('hand' in now) || JSON.stringify(now.hand) !== handBefore) throw new Error('hand changed across reconnect')
    console.log('dropped and reconnected to seat 1 with the same hand')
  }
  await sleep(25)
}

const over = a.view!.phase
console.log(`game over: team ${over.kind === 'gameOver' ? over.winner : '?'} wins, balls ${a.view!.balls.join('-')}, rounds ${a.view!.roundNumber}`)
console.log(`events seen: ${a.events}; rejections: A ${a.rejections.length} B ${b.rejections.length}; errors: ${a.errors.length + b.errors.length}`)
if (!dropped) throw new Error('the reconnect step never ran')
if (a.errors.length + b.errors.length > 0) throw new Error(`server errors: ${[...a.errors, ...b.errors].join('; ')}`)
if (a.rejections.length + b.rejections.length > 0) console.log('rejections:', a.rejections, b.rejections)

// Talk: two lines at once reach the table as one; a throw at a computer lands on it.
a.say({ kind: 'line', id: 'yoh' })
a.say({ kind: 'line', id: 'eish' })
await until('a line relayed', () => b.said.length > 0)
await sleep(500)
if (b.said.filter((s) => s.seat === 0).length !== 1) throw new Error(`expected one line from seat 0, got ${JSON.stringify(b.said)}`)
await sleep(2600)
b.say({ kind: 'throw', id: 'rose', at: 2 })
await until('a throw relayed', () => a.said.some((s) => s.say.kind === 'throw' && s.say.at === 2))
console.log('talk relayed within its limit')

// Again: the next game starts once both people have said it.
a.send({ type: 'rematch' })
await until('the first Again shown', () => b.view!.phase.kind === 'gameOver' && b.view!.phase.again.includes(0))
b.send({ type: 'rematch' })
await until('the next game', () => a.view!.phase.kind !== 'gameOver')
console.log('both said Again; the next game began')
a.socket.close()
b.socket.close()
process.exit(0)
