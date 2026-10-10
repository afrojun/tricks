import { describe, expect, test } from 'vitest'
import { type Limiter, asRoomSees, gate } from './gate'

const ADDRESS = 'https://tricks.afrojun.dev/parties/room/hearts-ABCDEF?token=x'

function socket(headers: Record<string, string>) {
  return new Request(ADDRESS, { headers: { Upgrade: 'websocket', ...headers } })
}

/** Lets `allowed` through for each address, then refuses it; remembers whom it was asked about. */
function limiter(allowed: number): Limiter & { asked: string[] } {
  const seen = new Map<string, number>()
  const asked: string[] = []
  return {
    asked,
    async limit({ key }) {
      asked.push(key)
      seen.set(key, (seen.get(key) ?? 0) + 1)
      return { success: seen.get(key)! <= allowed }
    },
  }
}

describe('the gate before a room', () => {
  test("this site's pages are let in, and another site's are not", async () => {
    const l = limiter(10)
    expect(await gate(socket({ Origin: 'https://tricks.afrojun.dev' }), l)).toBe('open')
    expect(await gate(socket({ Origin: 'https://evil.example' }), l)).toBe('foreign')
    expect(await gate(socket({ Origin: 'https://tricks.afrojun.dev.evil.example' }), l)).toBe('foreign')
    expect(await gate(socket({ Origin: 'null' }), l)).toBe('foreign')
    expect(await gate(socket({}), l)).toBe('open') // not a browser: the limit is what holds it
  })

  test('an address opening sockets too fast is refused, and others are not', async () => {
    const l = limiter(2)
    const from = (ip: string) => gate(socket({ 'CF-Connecting-IP': ip }), l)
    expect(await from('203.0.113.7')).toBe('open')
    expect(await from('203.0.113.7')).toBe('open')
    expect(await from('203.0.113.7')).toBe('tooFast')
    expect(await from('198.51.100.1')).toBe('open')
  })

  test('development, with no edge or through a tunnel on this machine, is not limited', async () => {
    const l = limiter(0)
    expect(await gate(socket({}), l)).toBe('open')
    expect(await gate(socket({ 'CF-Connecting-IP': '127.0.0.1' }), l)).toBe('open')
    expect(await gate(socket({ 'CF-Connecting-IP': '::1' }), l)).toBe('open')
    expect(l.asked).toEqual([])
  })

  test('a foreign page is refused without spending its address', async () => {
    const l = limiter(1)
    expect(await gate(socket({ Origin: 'https://evil.example', 'CF-Connecting-IP': '203.0.113.7' }), l)).toBe('foreign')
    expect(l.asked).toEqual([])
  })

  test('a room sees an id the Worker chose, and none of the headers partyserver would take from a client', () => {
    const sent = new Request(`${ADDRESS}&_pk=same`, { headers: { Upgrade: 'websocket', 'x-partykit-props': 'e30=', 'x-partykit-room': 'thunee-ZZZZZZ', Origin: 'https://tricks.afrojun.dev' } })
    const ids = new Set([asRoomSees(sent), asRoomSees(sent)].map((r) => new URL(r.url).searchParams.get('_pk')))
    expect(ids.size).toBe(2)
    expect(ids.has('same')).toBe(false)
    const seen = asRoomSees(sent)
    expect(new URL(seen.url).searchParams.get('token')).toBe('x')
    expect(seen.headers.get('x-partykit-props')).toBeNull()
    expect(seen.headers.get('x-partykit-room')).toBeNull()
    expect(seen.headers.get('Upgrade')).toBe('websocket')
  })
})
