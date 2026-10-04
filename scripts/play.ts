/**
 * Plays a whole game against a running PartyKit dev server over real sockets:
 * two scripted humans and two AI seats, with one human dropping and
 * reconnecting mid-game. Usage: pnpm party (in another terminal), then
 * pnpm tsx scripts/play.ts
 */
import PartySocket from 'partysocket'
import { chooseAction, chooseJodhi } from '../src/ai/choose'
import { type Action, type View, availableActions } from '../src/engine'
import type { ServerMessage } from '../src/protocol'

const host = process.env.PARTYKIT_HOST ?? 'localhost:1999'
const room = `SIM${Math.floor(Math.random() * 900 + 100)}`

class Player {
  socket!: PartySocket
  view: View | null = null
  seat: number | null = null
  rejections: string[] = []
  errors: string[] = []
  events = 0
  constructor(
    readonly name: string,
    readonly token: string,
  ) {
    this.connect()
  }
  connect() {
    this.socket = new PartySocket({ host, room, query: { token: this.token } })
    this.socket.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data as string) as ServerMessage
      if (msg.type === 'sync') {
        this.view = msg.view
        this.seat = msg.seat
        this.events += msg.events.length
      } else if (msg.type === 'rejected') this.rejections.push(msg.reason)
      else this.errors.push(msg.message)
    })
  }
  send(action: Action) {
    this.socket.send(JSON.stringify({ action }))
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

const a = new Player('Asha', 'script-token-aaaaaaaaaaaa')
const b = new Player('Bheki', 'script-token-bbbbbbbbbbbb')
await until('connections', () => a.view !== null && b.view !== null)

a.send({ type: 'sit', seat: 0, name: a.name })
await until('host seated', () => a.seat === 0)
b.send({ type: 'sit', seat: 1, name: b.name })
a.send({ type: 'addAi', seat: 2 })
a.send({ type: 'addAi', seat: 3 })
a.send({ type: 'setRules', overrides: { ballsToWin: 3, callTimerSeconds: 3, thuneeWindowSeconds: 0 } })
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
    else if (phase.kind === 'calling' && (can.calls.length > 0 || can.pass)) action = chooseAction(view)
    else if (phase.kind === 'trumpSelection' && can.chooseTrump.length > 0) action = chooseAction(view)
    else if ((phase.kind === 'playing' || phase.kind === 'trickPause') && chooseJodhi(view)) action = chooseJodhi(view)
    else if (phase.kind === 'playing' && can.play.length > 0) action = chooseAction(view)
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
a.socket.close()
b.socket.close()
process.exit(0)
