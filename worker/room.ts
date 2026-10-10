import { type Connection, type ConnectionContext, Server, type WSMessage } from 'partyserver'
import { PING, PONG } from '../src/protocol'
import { type ConnState, TableRoom } from '../src/room/room'

/**
 * A room as a Durable Object: adapts partyserver to `TableRoom` and holds no game logic. With
 * hibernation on, Cloudflare may drop this object between messages while its sockets stay open;
 * it is built again, and `onStart` runs again, on the next message or alarm.
 */
export class Room extends Server<Env> {
  static options = { hibernate: true }
  private readonly table: TableRoom

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Heartbeats are answered at the edge, so they never wake a sleeping room.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG))
    const room = this
    this.table = new TableRoom({
      get name() {
        return room.name
      },
      storage: {
        get: <T>(key: string) => ctx.storage.get<T>(key),
        put: (key, value) => ctx.storage.put(key, value),
        setAlarm: (at) => ctx.storage.setAlarm(at),
        deleteAlarm: () => ctx.storage.deleteAlarm(),
        deleteAll: () => ctx.storage.deleteAll(),
      },
      connections: () => this.getConnections<ConnState>(),
    })
  }

  onStart() {
    return this.table.onStart()
  }

  onConnect(connection: Connection<ConnState>, ctx: ConnectionContext) {
    // Set by Cloudflare's edge, which overwrites any a client sends.
    return this.table.onConnect(connection, ctx.request.url, ctx.request.headers.get('CF-Connecting-IP'))
  }

  onClose(connection: Connection<ConnState>) {
    return this.table.onClose(connection)
  }

  // partyserver passes the connection first, the reverse of PartyKit and of TableRoom.
  onMessage(connection: Connection<ConnState>, message: WSMessage) {
    return this.table.onMessage(message, connection)
  }

  onAlarm() {
    return this.table.onAlarm()
  }

  /**
   * A room is reached only by socket. A plain request is refused without a word to the log:
   * partyserver's default logs the URL, and a socket's URL carries the device's secret token.
   */
  onRequest() {
    return new Response('Not found', { status: 404 })
  }
}
