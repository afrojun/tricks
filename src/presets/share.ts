import type { RulesOf } from './book'
import { cleanPresetName } from './storage'

/** Bumped only if the encoding itself changes; new settings do not need it. */
export const SHARE_VERSION = 1
export const SHARE_PARAM = 'rules'

export type Decoded<R> = { ok: true; name: string; overrides: Partial<R> } | { ok: false; error: string }

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): string {
  const bytes = Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

/** A compact, URL-safe string carrying a preset's name and its differences from the game's defaults. */
export function encodeShare(name: string, overrides: object): string {
  return toBase64Url(JSON.stringify({ v: SHARE_VERSION, n: name, o: overrides }))
}

/** Read with the game's own schema. Never throws: anything unreadable comes back as an error to show the user. */
export function decodeShare<R extends object>(game: RulesOf<R>, code: string): Decoded<R> {
  const unreadable: Decoded<R> = { ok: false, error: 'This rules link can’t be read. Ask for it to be sent again.' }
  let data: unknown
  try {
    data = JSON.parse(fromBase64Url(code.trim()))
  } catch {
    return unreadable
  }
  if (typeof data !== 'object' || data === null) return unreadable
  const { v, n, o } = data as Record<string, unknown>
  if (typeof v !== 'number') return unreadable
  if (v > SHARE_VERSION) {
    return { ok: false, error: `This rules link was made with a newer version of ${game.name}. Reload the page and try again.` }
  }
  const overrides = game.rules.schema.safeParse(o ?? {})
  if (!overrides.success) return unreadable
  const name = typeof n === 'string' ? cleanPresetName(n) : null
  return { ok: true, name: name ?? 'Shared rules', overrides: overrides.data }
}

/** Opens the game's home, which hands it to the game's rules screen to be saved. */
export function shareUrl<R extends object>(game: RulesOf<R>, name: string, overrides: Partial<R>, origin: string = location.origin): string {
  return `${origin}/${game.id}?${SHARE_PARAM}=${encodeShare(name, overrides)}`
}
