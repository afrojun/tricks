import PartySocket from 'partysocket'
import type { Action } from '../engine'
import { type GameId, PING, PONG, type ServerMessage, TOKEN_PARAM, roomName } from '../protocol'
import { deviceToken } from './identity'
import { Playback } from './playback'
import { GameStore } from './store'

const PING_EVERY_MS = 5000
const MAX_UNANSWERED_PINGS = 2

export interface Session {
  store: GameStore
  send: (action: Action) => void
  close: () => void
}

/** Opens a socket to a game's room and feeds everything it receives into a store. */
export function openSession(game: GameId, code: string): Session {
  const store = new GameStore()
  const playback = new Playback((message, receivedAt) => {
    store.receive(message, receivedAt)
    // Coming back to a seat the AI was minding: take it back straight away.
    if (justOpened && message.type === 'sync') {
      justOpened = false
      if (message.seat !== null && message.view.seats[message.seat].standIn) send({ type: 'reclaimSeat' })
    }
  })
  // The rooms are served by the same Worker as the page, so they share its origin.
  const socket = new PartySocket({
    host: location.host,
    protocol: location.protocol === 'https:' ? 'wss' : 'ws',
    party: 'room',
    room: roomName(game, code),
    query: { [TOKEN_PARAM]: deviceToken() },
  })
  const send = (action: Action) => {
    playback.release()
    socket.send(JSON.stringify({ action }))
  }
  let everOpened = false
  let justOpened = false

  socket.addEventListener('open', () => {
    everOpened = true
    justOpened = true
    playback.reset()
    store.setConnection('open')
  })
  socket.addEventListener('close', () => {
    playback.reset() // nothing from the old connection may arrive after the store starts waiting for a fresh view
    store.setConnection(everOpened ? 'reconnecting' : 'connecting')
  })
  // A phone that sleeps or changes network can leave a socket that looks open
  // but is dead. Ping the room and reconnect if it goes quiet.
  // Counting unanswered pings, not elapsed time, keeps a throttled background tab from reconnecting.
  let unanswered = 0
  const heartbeat = setInterval(() => {
    if (socket.readyState !== WebSocket.OPEN) return
    if (unanswered >= MAX_UNANSWERED_PINGS) {
      unanswered = 0
      playback.reset()
      store.setConnection('reconnecting')
      socket.reconnect()
      return
    }
    unanswered++
    socket.send(PING)
  }, PING_EVERY_MS)
  const onOffline = () => {
    playback.reset()
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
    playback.push(message)
  })

  const close = () => {
    clearInterval(heartbeat)
    playback.reset()
    removeEventListener('offline', onOffline)
    removeEventListener('online', onOnline)
    socket.close()
  }
  return { store, send, close }
}
