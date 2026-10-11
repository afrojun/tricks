import { describe, expect, test } from 'vitest'
import type { PushTarget } from '../protocol'
import { base64url, encrypt, fromBase64url, isPushEndpoint, sendPush, vapidAuthorization } from './webpush'

const decoder = new TextDecoder()

/** A device as its browser is: a key pair and an auth secret, and the subscription it hands out. */
async function device(endpoint = 'https://fcm.googleapis.com/fcm/send/abc') {
  const keys = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const auth = crypto.getRandomValues(new Uint8Array(16))
  const p256dh = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey))
  const target: PushTarget = { endpoint, keys: { p256dh: base64url(p256dh), auth: base64url(auth) } }
  return { keys, auth, p256dh, target }
}

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: string | Uint8Array<ArrayBuffer>, bytes: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const infoBytes = typeof info === 'string' ? new TextEncoder().encode(info) : info
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: infoBytes }, key, bytes * 8))
}

/** What the device's browser does with a push: RFC 8291 from the receiving side, written apart from the sender's. */
async function decrypt(body: Uint8Array, d: Awaited<ReturnType<typeof device>>): Promise<string> {
  const salt = body.slice(0, 16)
  const recordSize = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0)
  const idLength = body[20]
  const senderKey = body.slice(21, 21 + idLength)
  const sealed = body.slice(21 + idLength)
  expect(recordSize).toBe(4096)
  const sender = await crypto.subtle.importKey('raw', senderKey, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: sender }, d.keys.privateKey, 256))
  const info = new Uint8Array([...new TextEncoder().encode('WebPush: info\0'), ...d.p256dh, ...senderKey])
  const ikm = await hkdf(d.auth, shared, info, 32)
  const cek = await hkdf(salt, ikm, 'Content-Encoding: aes128gcm\0', 16)
  const nonce = await hkdf(salt, ikm, 'Content-Encoding: nonce\0', 12)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, sealed))
  expect(plain.at(-1)).toBe(2)
  return decoder.decode(plain.slice(0, -1))
}

async function signingKey() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  return { pair, vapid: { privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey), subject: 'https://tricks.example' } }
}

describe('web push', () => {
  test('a message is encrypted so that only the device reads it', async () => {
    const d = await device()
    const body = await encrypt(new TextEncoder().encode('{"title":"Your turn"}'), d.target)
    expect(await decrypt(body, d)).toBe('{"title":"Your turn"}')
    const other = await device()
    await expect(decrypt(body, other)).rejects.toThrow()
  })

  test('the request is signed for the push service, with the app’s public key', async () => {
    const { pair, vapid } = await signingKey()
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', vapid, 1_000_000_000)
    const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!
    const [head, claims, signature] = jwt.split('.')
    expect(JSON.parse(decoder.decode(fromBase64url(claims)))).toEqual({ aud: 'https://fcm.googleapis.com', exp: 1_000_000 + 12 * 3600, sub: 'https://tricks.example' })
    const verified = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, fromBase64url(signature), new TextEncoder().encode(`${head}.${claims}`))
    expect(verified).toBe(true)
    expect(k).toBe(base64url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))))
  })

  test('only the known push services are posted to', () => {
    for (const ok of ['https://fcm.googleapis.com/fcm/send/x', 'https://jmt17.google.com/fcm/send/x', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/x', 'https://wns2-par02p.notify.windows.com/w/?token=x']) {
      expect(isPushEndpoint(ok), ok).toBe(true)
    }
    for (const bad of ['http://fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'https://evil.com/fcm.googleapis.com', 'https://fcm.googleapis.com.evil.com/x', 'https://127.0.0.1/x', 'https://notapple.com/x', 'https://mail.google.com/x', 'https://jmt17.google.com.evil.com/x', 'not a url']) {
      expect(isPushEndpoint(bad), bad).toBe(false)
    }
  })

  test('a gone subscription, a failure and a success are told apart, and nothing throws', async () => {
    const d = await device()
    const { vapid } = await signingKey()
    const message = { title: 'Your turn', body: 'Hearts with Asha', url: '/hearts/ABCDEF', tag: 'hearts-ABCDEF' }
    const sent: RequestInit[] = []
    const answer = (status: number) => (async (_url: unknown, init?: RequestInit) => {
      sent.push(init!)
      return new Response(null, { status })
    }) as typeof fetch
    expect(await sendPush(d.target, message, vapid, 0, answer(201))).toBe('sent')
    expect(await sendPush(d.target, message, vapid, 0, answer(410))).toBe('gone')
    expect(await sendPush(d.target, message, vapid, 0, answer(404))).toBe('gone')
    expect(await sendPush(d.target, message, vapid, 0, answer(500))).toBe('failed')
    expect(await sendPush(d.target, message, vapid, 0, (async () => { throw new Error('offline') }) as typeof fetch)).toBe('failed')
    expect(await sendPush({ ...d.target, endpoint: 'https://evil.com/x' }, message, vapid, 0, answer(201))).toBe('gone')
    expect(await sendPush({ ...d.target, keys: { p256dh: 'short', auth: 'x' } }, message, vapid, 0, answer(201))).toBe('failed')
    const headers = sent[0].headers as Record<string, string>
    expect(headers.Topic).toBe('hearts-ABCDEF')
    expect(JSON.parse(await decrypt(new Uint8Array(sent[0].body as ArrayBuffer), d))).toEqual(message)
  })
})
