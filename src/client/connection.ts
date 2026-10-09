import PartySocket from 'partysocket'
import type { TableAction, TableView } from '../kit/table'
import { PING, PONG, type ServerMessage, TOKEN_PARAM, roomName } from '../protocol'
import { deviceToken } from './identity'
import type { Say } from '../kit/talk'
import { Playback } from './playback'
import { GameStore } from './store'
import { TalkStore } from './talk'

const PING_EVERY_MS = 5000
const MAX_UNANSWERED_PINGS = 2

/** A table as the screens see it, online or in practice: the game supplies the view, action and event types. */
export interface Session<V, A, E> {
  store: GameStore<V, E>
  /** What is being said at the table. */
  talk: TalkStore
  send: (action: A) => void
  /** Says something at the table; a seat the room does not know is ignored there. */
  say: (say: Say) => void
  close: () => void
}

/** What a session needs of a game: its id, which names its rooms, and how long each of its events holds the screen. */
export interface SessionGame<E> {
  id: string
  dwell(event: E): number
}

/** Opens a socket to a game's room and feeds everything it receives into a store. */
export function openSession<V extends TableView, A, E>(game: SessionGame<E>, code: string): Session<V, A, E> {
  const store = new GameStore<V, E>()
  const talk = new TalkStore()
  const playback = new Playback<V, E>(
    (message, receivedAt) => {
      if (message.type === 'said') return talk.receive(message)
      store.receive(message, receivedAt)
      if (message.type === 'sync') message.said?.forEach((said) => talk.receive(said))
      // Coming back to a seat the AI was minding: take it back straight away.
      if (justOpened && message.type === 'sync') {
        justOpened = false
        if (message.seat !== null && message.view.seats[message.seat].standIn) post({ type: 'reclaimSeat' } satisfies TableAction)
      }
    },
    (event) => game.dwell(event),
  )
  // The rooms are served by the same Worker as the page, so they share its origin.
  const socket = new PartySocket({
    host: location.host,
    protocol: location.protocol === 'https:' ? 'wss' : 'ws',
    party: 'room',
    room: roomName(game.id, code),
    query: { [TOKEN_PARAM]: deviceToken() },
  })
  /** Any game's actions include the table's, such as taking a seat back. */
  const post = (action: A | TableAction) => {
    playback.release()
    socket.send(JSON.stringify({ action }))
  }
  const send = (action: A) => post(action)
  const say = (said: Say) => socket.send(JSON.stringify({ say: said }))
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
    let message: ServerMessage<V, E>
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
    talk.close()
    socket.close()
  }
  return { store, talk, send, say, close }
}
