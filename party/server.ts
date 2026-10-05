import type * as Party from 'partykit/server'
import { type RoomConnection, TableRoom } from '../src/room/room'

type ConnState = { token: string }

/** Adapts a PartyKit room to `TableRoom`. No game logic lives here. */
export default class ThuneeRoom implements Party.Server {
  private readonly table: TableRoom

  constructor(readonly room: Party.Room) {
    this.table = new TableRoom({
      name: room.id,
      storage: room.storage,
      connections: () => room.getConnections<ConnState>(),
    })
  }

  onStart() {
    return this.table.onStart()
  }

  onConnect(conn: Party.Connection<ConnState>, ctx: Party.ConnectionContext) {
    return this.table.onConnect(conn as RoomConnection, ctx.request.url)
  }

  onClose(conn: Party.Connection<ConnState>) {
    return this.table.onClose(conn as RoomConnection)
  }

  onMessage(message: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection<ConnState>) {
    return this.table.onMessage(message, sender as RoomConnection)
  }

  onAlarm() {
    return this.table.onAlarm()
  }
}
