import PartySocket from 'partysocket'
import type { Action } from '../engine'
import { PING, PONG, type ServerMessage, TOKEN_PARAM } from '../protocol'
import { deviceToken } from './identity'
import { GameStore } from './store'

const HOST = import.meta.env.VITE_PARTYKIT_HOST || `${location.hostname}:1999`

const PING_EVERY_MS = 5000
const MAX_UNANSWERED_PINGS = 2

export interface Session {
  store: GameStore
  send: (action: Action) => void
  close: () => void
}

/** Opens a socket to a room and feeds everything it receives into a store. */
export function openSession(room: string): Session {
  const store = new GameStore()
  const socket = new PartySocket({ host: HOST, room, query: { [TOKEN_PARAM]: deviceToken() } })
  const send = (action: Action) => socket.send(JSON.stringify({ action }))
  let everOpened = false
  let justOpened = false

  socket.addEventListener('open', () => {
    everOpened = true
    justOpened = true
    store.setConnection('open')
  })
  socket.addEventListener('close', () => store.setConnection(everOpened ? 'reconnecting' : 'connecting'))
  // A phone that sleeps or changes network can leave a socket that looks open
  // but is dead. Ping the room and reconnect if it goes quiet.
  // Counting unanswered pings, not elapsed time, keeps a throttled background tab from reconnecting.
  let unanswered = 0
  const heartbeat = setInterval(() => {
    if (socket.readyState !== WebSocket.OPEN) return
    if (unanswered >= MAX_UNANSWERED_PINGS) {
      unanswered = 0
      store.setConnection('reconnecting')
      socket.reconnect()
      return
    }
    unanswered++
    socket.send(PING)
  }, PING_EVERY_MS)
  const onOffline = () => {
    store.setConnection('reconnecting')
    socket.close()
  }
  const onOnline = () => socket.reconnect()
  addEventListener('offline', onOffline)
  addEventListener('online', onOnline)

  socket.addEventListener('message', (e) => {
    unanswered = 0
    if (e.data === PONG) return
    let message: ServerMessage
    try {
      message = JSON.parse(e.data as string)
    } catch {
      return
    }
    store.receive(message, Date.now())
    // Coming back to a seat the AI was minding: take it back straight away.
    if (justOpened && message.type === 'sync') {
      justOpened = false
      if (message.seat !== null && message.view.seats[message.seat].standIn) send({ type: 'reclaimSeat' })
    }
  })

  const close = () => {
    clearInterval(heartbeat)
    removeEventListener('offline', onOffline)
    removeEventListener('online', onOnline)
    socket.close()
  }
  return { store, send, close }
}
