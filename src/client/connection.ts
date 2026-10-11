import PartySocket from 'partysocket'
import type { TableAction, TableView } from '../kit/table'
import { PACE_PARAM, PING, PONG, type PushTarget, REPLACED_CLOSE_CODE, ROOM_FULL_CLOSE_CODE, type ServerMessage, TOKEN_PARAM, roomName } from '../protocol'
import { deviceToken } from './identity'
import { currentTarget } from './notify'
import { forgetRoom, keepRoom } from './rooms'
import { pace } from './pace'
import type { Say } from '../kit/talk'
import { Playback } from './playback'
import { type ConnectionStatus, GameStore } from './store'
import { TalkStore } from './talk'

const PING_EVERY_MS = 5000
const MAX_UNANSWERED_PINGS = 2
/** Closes after which the socket waits for the player: reconnecting by itself would only close another. */
const HELD: Partial<Record<number, ConnectionStatus>> = { [REPLACED_CLOSE_CODE]: 'replaced', [ROOM_FULL_CLOSE_CODE]: 'full' }

/** A table as the screens see it, online or in practice: the game supplies the view, action and event types. */
export interface Session<V extends TableView, A, E> {
  store: GameStore<V, E>
  /** What is being said at the table. */
  talk: TalkStore
  send: (action: A) => void
  /** Says something at the table; a seat the room does not know is ignored there. */
  say: (say: Say) => void
  /** Tells the other players a card is lifted in this player's hand, or no longer is. */
  lift: (up: boolean) => void
  /** Tells the room where this device's notifications go, or that it wants none. Nothing in practice. */
  push: (target: PushTarget | null) => void
  /** Opens the table again after the room closed it (`replaced` or `full`). */
  reconnect: () => void
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
  const speed = pace()
  const playback = new Playback<V, E>(
    (message, receivedAt) => {
      if (message.type === 'said') return talk.receive(message)
      store.receive(message, receivedAt)
      if (message.type === 'sync') message.said?.forEach((said) => talk.receive(said))
      if (message.type === 'sync') {
        remember(message.seat !== null)
        tellPush(message)
      }
      // Coming back to a seat the AI was minding: take it back straight away.
      if (justOpened && message.type === 'sync') {
        justOpened = false
        if (message.seat !== null && message.view.seats[message.seat].standIn) post({ type: 'reclaimSeat' } satisfies TableAction)
      }
    },
    (event) => game.dwell(event) / speed,
  )
  // The rooms are served by the same Worker as the page, so they share its origin.
  const socket = new PartySocket({
    host: location.host,
    protocol: location.protocol === 'https:' ? 'wss' : 'ws',
    party: 'room',
    room: roomName(game.id, code),
    query: { [TOKEN_PARAM]: deviceToken(), ...(speed > 1 && { [PACE_PARAM]: String(speed) }) },
    shouldReconnectOnClose: (e) => HELD[e.code] === undefined,
  })
  /** Any game's actions include the table's, such as taking a seat back. */
  const post = (action: A | TableAction) => {
    playback.release()
    socket.send(JSON.stringify({ action }))
  }
  const send = (action: A) => post(action)
  const say = (said: Say) => socket.send(JSON.stringify({ say: said }))
  // A lift is only worth telling as it happens: one queued while the socket was down would be stale when sent.
  const lift = (up: boolean) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ lift: up }))
  }
  /**
   * Whether this device sits here, as "Your games" keeps it: kept when a sync first gives it a seat on
   * this visit, forgotten when one gives it none (it stood up, or the room was reset).
   */
  let seated: boolean | null = null
  /** Whether this socket has told the room about notifications since it last found a seat. */
  let told = false
  const remember = (now: boolean) => {
    if (now === seated) return
    seated = now
    // A seat taken again is told again: standing up made the room forget this device's notifications.
    told = false
    if (now) keepRoom(game.id, code)
    else forgetRoom(game.id, code)
  }
  // Once a socket finds its seat, the room hears where this device's notifications go, or that it wants none.
  const tellPush = (sync: { seat: number | null }) => {
    if (told || sync.seat === null) return
    told = true
    void currentTarget().then(push)
  }
  const push = (target: PushTarget | null) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ push: target }))
  }
  let everOpened = false
  let justOpened = false
  /** Why the room closed this socket, while the page waits for the player to come back. */
  let held: ConnectionStatus | undefined

  socket.addEventListener('open', () => {
    everOpened = true
    justOpened = true
    told = false
    playback.reset()
    store.setConnection('open')
  })
  socket.addEventListener('close', (e) => {
    playback.reset() // nothing from the old connection may arrive after the store starts waiting for a fresh view
    // A close the page made itself, on the room's word, carries whatever code; the word stands.
    held = HELD[e.code] ?? held
    store.setConnection(held ?? (everOpened ? 'reconnecting' : 'connecting'))
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
    if (held) return
    playback.reset()
    store.setConnection('reconnecting')
    socket.close()
  }
  const onOnline = () => {
    if (!held) socket.reconnect()
  }
  const reconnect = () => {
    held = undefined
    store.setConnection(everOpened ? 'reconnecting' : 'connecting')
    socket.reconnect()
  }
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
    if (message.type === 'closing') {
      // The room's close may never arrive: close the socket here, and wait for the player.
      held = HELD[message.code]
      if (held) socket.close(message.code)
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
  return { store, talk, send, say, lift, push, reconnect, close }
}
