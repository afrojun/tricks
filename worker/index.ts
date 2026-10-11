import { type Lobby, routePartykitRequest } from 'partyserver'
import { isRoomName } from '../src/games'
import { UNKNOWN_ROOM_CLOSE_CODE } from '../src/protocol'
import { asRoomSees, gate } from '../src/room/gate'

export { Room } from './room'

/**
 * A name that is not a game and a code never reaches, or creates, a Durable Object. A socket to
 * one is accepted here and closed with the same code `TableRoom` uses. A socket from another
 * site's page, or from an address opening them too fast, is refused before any room wakes. The
 * rest go on with an id the Worker chose.
 */
async function admitSocket(request: Request, lobby: Lobby<Env>, env: Env): Promise<Request | Response> {
  if (!isRoomName(lobby.name)) {
    console.log(JSON.stringify({ refused: 'unknownRoom' }))
    const [client, server] = Object.values(new WebSocketPair())
    server.accept()
    server.close(UNKNOWN_ROOM_CLOSE_CODE, 'Unknown room')
    return new Response(null, { status: 101, webSocket: client })
  }
  const verdict = await gate(request, env.CONNECTS)
  if (verdict !== 'open') console.log(JSON.stringify({ refused: verdict, origin: verdict === 'foreign' ? request.headers.get('Origin')?.slice(0, 100) : undefined }))
  if (verdict === 'foreign') return new Response('Forbidden', { status: 403 })
  if (verdict === 'tooFast') return new Response('Too many requests', { status: 429 })
  return asRoomSees(request)
}

/** A room is reached only by socket: a plain request never wakes one. */
function refuseRequest(_request: Request, lobby: Lobby<Env>): Response {
  return isRoomName(lobby.name) ? new Response('Not found', { status: 404 }) : new Response('Unknown room', { status: 404 })
}

/** Only `/parties/*` reaches the Worker first; everything else is the app's static assets. */
export default {
  async fetch(request, env) {
    const routed = await routePartykitRequest(request, env, {
      onBeforeConnect: (req, lobby) => admitSocket(req, lobby, env),
      onBeforeRequest: refuseRequest,
    })
    return routed ?? new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
