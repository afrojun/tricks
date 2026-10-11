/**
 * Web Push from a room, with nothing but WebCrypto: the message encrypted for the device (RFC 8291,
 * `aes128gcm`) and the request signed with the app's key (VAPID, RFC 8292). Runs in the Worker and
 * in Node alike, so it is tested in Node.
 */

import type { PushTarget } from '../protocol'

/** The app's signing key: the private key as a JWK, and who to contact about its pushes. */
export interface Vapid {
  privateJwk: JsonWebKey
  subject: string
}

/** What came of one push: sent, or the subscription is gone and should be forgotten, or it failed this time. */
export type PushResult = 'sent' | 'gone' | 'failed'

/**
 * The push services a room may send to: Google's (Chrome and Android, and Chromium's own), Firefox's, Apple's and Windows'.
 * A subscription names its own endpoint, so the room posts only to these, never to any address a client gives.
 */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /^jmt\d*\.google\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^([a-z0-9-]+\.)*push\.apple\.com$/, /^([a-z0-9-]+\.)*notify\.windows\.com$/]

export function isPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint)
    return url.protocol === 'https:' && url.port === '' && PUSH_HOSTS.some((host) => host.test(url.hostname))
  } catch {
    return false
  }
}

const encoder = new TextEncoder()

export function base64url(bytes: Uint8Array): string {
  let text = ''
  for (const b of bytes) text += String.fromCharCode(b)
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  const plain = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4))
  return Uint8Array.from(plain, (c) => c.charCodeAt(0))
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

async function hkdf(salt: BufferSource, ikm: BufferSource, info: BufferSource, bytes: number): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8))
}

/** A message encrypted for one device: the `aes128gcm` body, its header holding the salt and the sender's one-time key. */
export async function encrypt(payload: Uint8Array, target: PushTarget, salt: Uint8Array<ArrayBuffer> = crypto.getRandomValues(new Uint8Array(16))): Promise<Uint8Array<ArrayBuffer>> {
  const deviceKey = fromBase64url(target.keys.p256dh)
  const auth = fromBase64url(target.keys.auth)
  const device = await crypto.subtle.importKey('raw', deviceKey, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const mine = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const myKey = new Uint8Array((await crypto.subtle.exportKey('raw', mine.publicKey)) as ArrayBuffer)
  // Cloudflare's types spell the peer's key `$public`; both runtimes read `public`.
  const ecdh = { name: 'ECDH', public: device } as unknown as Parameters<SubtleCrypto['deriveBits']>[0]
  const shared = new Uint8Array(await crypto.subtle.deriveBits(ecdh, mine.privateKey, 256))
  const ikm = await hkdf(auth, shared, concat(encoder.encode('WebPush: info\0'), deviceKey, myKey), 32)
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  // One record, marked the last with its delimiter, and no padding.
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))))
  const recordSize = new Uint8Array([0, 0, 0x10, 0]) // 4096
  return concat(salt, recordSize, new Uint8Array([myKey.length]), myKey, sealed)
}

/** The VAPID header for one push service, signed for 12 hours. */
export async function vapidAuthorization(endpoint: string, vapid: Vapid, now: number): Promise<string> {
  const { kty, crv, x, y, d } = vapid.privateJwk
  const key = await crypto.subtle.importKey('jwk', { kty, crv, x, y, d }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const part = (value: object) => base64url(encoder.encode(JSON.stringify(value)))
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 60 * 60, sub: vapid.subject })}`
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(unsigned)))
  const publicKey = concat(new Uint8Array([4]), fromBase64url(x!), fromBase64url(y!))
  return `vapid t=${unsigned}.${base64url(signature)}, k=${base64url(publicKey)}`
}

/** What a push says: a title, a line under it, the address a tap opens, and a tag that replaces an earlier one of the same game. */
export interface PushMessage {
  title: string
  body: string
  url: string
  tag: string
}

/**
 * Sends one message to one device. Never throws: a subscription the service no longer knows is `gone`,
 * anything else that goes wrong `failed`.
 */
export async function sendPush(target: PushTarget, message: PushMessage, vapid: Vapid, now: number, post: typeof fetch = fetch): Promise<PushResult> {
  if (!isPushEndpoint(target.endpoint)) return 'gone'
  try {
    const body = await encrypt(encoder.encode(JSON.stringify(message)), target)
    const response = await post(target.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidAuthorization(target.endpoint, vapid, now),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        // Kept for two days by a service whose device is off, as long as a turn waits.
        TTL: String(2 * 24 * 60 * 60),
        Urgency: 'normal',
        // A newer push about the same game replaces one still waiting at the service.
        Topic: message.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32),
      },
      body,
    })
    if (response.status === 404 || response.status === 410) return 'gone'
    return response.ok ? 'sent' : 'failed'
  } catch {
    return 'failed'
  }
}
