import { type Lobby, routePartykitRequest } from 'partyserver'
import { isRoomName } from '../src/protocol'

export { Room } from './room'

/** A name that is not a game and a code never reaches, or creates, a Durable Object. */
const refuseUnknown = (_request: Request, lobby: Lobby<Env>) => (isRoomName(lobby.name) ? undefined : new Response('Unknown room', { status: 404 }))

/** Only `/parties/*` reaches the Worker first; everything else is the app's static assets. */
export default {
  async fetch(request, env) {
    const routed = await routePartykitRequest(request, env, { onBeforeConnect: refuseUnknown, onBeforeRequest: refuseUnknown })
    return routed ?? new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
