import { type Lobby, routePartykitRequest } from 'partyserver'
import { UNKNOWN_ROOM_CLOSE_CODE, isRoomName } from '../src/protocol'

export { Room } from './room'

/**
 * A name that is not a game and a code never reaches, or creates, a Durable Object. A socket to
 * one is accepted here and closed with the same code `TableRoom` uses; a plain request gets a 404.
 */
function refuseSocket(_request: Request, lobby: Lobby<Env>): Response | undefined {
  if (isRoomName(lobby.name)) return undefined
  const [client, server] = Object.values(new WebSocketPair())
  server.accept()
  server.close(UNKNOWN_ROOM_CLOSE_CODE, 'Unknown room')
  return new Response(null, { status: 101, webSocket: client })
}

function refuseRequest(_request: Request, lobby: Lobby<Env>): Response | undefined {
  return isRoomName(lobby.name) ? undefined : new Response('Unknown room', { status: 404 })
}

/** Only `/parties/*` reaches the Worker first; everything else is the app's static assets. */
export default {
  async fetch(request, env) {
    const routed = await routePartykitRequest(request, env, { onBeforeConnect: refuseSocket, onBeforeRequest: refuseRequest })
    return routed ?? new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
