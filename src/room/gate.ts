/**
 * What the Worker checks of a socket to a room before any room wakes for it: that a page of this
 * site opened it, and that its address is not opening sockets faster than people do.
 */

/** The rate limiter Cloudflare binds to the Worker, keyed by address. */
export interface Limiter {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

export type GateVerdict = 'open' | 'foreign' | 'tooFast'

/** Development has no edge: its sockets come from this machine, or through a tunnel on it. */
const LOOPBACK = new Set(['127.0.0.1', '::1'])

export async function gate(request: Request, limiter: Limiter): Promise<GateVerdict> {
  // A browser always says which page opened a socket. Another site's page may not use the rooms;
  // a client that is not a browser can say anything, which is what the limit below is for.
  const origin = request.headers.get('Origin')
  if (origin !== null && hostOf(origin) !== new URL(request.url).host) return 'foreign'
  // Set by Cloudflare's edge, which overwrites any a client sends.
  const ip = request.headers.get('CF-Connecting-IP')
  if (ip === null || LOOPBACK.has(ip)) return 'open'
  const { success } = await limiter.limit({ key: ip })
  return success ? 'open' : 'tooFast'
}

/**
 * The socket's request as a room should see it. partyserver takes a connection's id from the
 * client's `_pk`, props from its `x-partykit-props` and, failing all else, its name from
 * `x-partykit-room`. The room counts sockets by id, so the Worker chooses every id itself, and
 * passes neither header on.
 */
export function asRoomSees(request: Request): Request {
  const url = new URL(request.url)
  url.searchParams.set('_pk', crypto.randomUUID())
  const seen = new Request(url, request)
  seen.headers.delete('x-partykit-props')
  // The room's name is its Durable Object's; one a client names must never stand in for it.
  seen.headers.delete('x-partykit-room')
  return seen
}

function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host
  } catch {
    return null
  }
}
