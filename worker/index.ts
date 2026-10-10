import { type Lobby, routePartykitRequest } from 'partyserver'
import { isRoomName } from '../src/games'
import { UNKNOWN_ROOM_CLOSE_CODE } from '../src/protocol'
import { gate } from '../src/room/gate'

export { Room } from './room'

/**
 * A name that is not a game and a code never reaches, or creates, a Durable Object. A socket to
 * one is accepted here and closed with the same code `TableRoom` uses. A socket from another
 * site's page, or from an address opening them too fast, is refused before any room wakes.
 */
async function refuseSocket(request: Request, lobby: Lobby<Env>, env: Env): Promise<Response | undefined> {
  if (!isRoomName(lobby.name)) {
    const [client, server] = Object.values(new WebSocketPair())
    server.accept()
    server.close(UNKNOWN_ROOM_CLOSE_CODE, 'Unknown room')
    return new Response(null, { status: 101, webSocket: client })
  }
  const verdict = await gate(request, env.CONNECTS)
  if (verdict === 'foreign') return new Response('Forbidden', { status: 403 })
  if (verdict === 'tooFast') return new Response('Too many requests', { status: 429 })
  return undefined
}

/** A room is reached only by socket: a plain request never wakes one. */
function refuseRequest(): Response {
  return new Response('Not found', { status: 404 })
}

/** Only `/parties/*` reaches the Worker first; everything else is the app's static assets. */
export default {
  async fetch(request, env) {
    const routed = await routePartykitRequest(request, env, {
      onBeforeConnect: (req, lobby) => refuseSocket(req, lobby, env),
      onBeforeRequest: refuseRequest,
    })
    return routed ?? new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
