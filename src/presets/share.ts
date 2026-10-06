import { type RuleOverrides, ruleOverridesSchema } from '../games/thunee/engine'
import { cleanPresetName } from './storage'

/** Bumped only if the encoding itself changes; new settings do not need it. */
export const SHARE_VERSION = 1
export const SHARE_PARAM = 'rules'

export type Decoded = { ok: true; name: string; overrides: RuleOverrides } | { ok: false; error: string }

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): string {
  const bytes = Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

/** A compact, URL-safe string carrying a preset's name and its differences from Traditional. */
export function encodeShare(name: string, overrides: RuleOverrides): string {
  return toBase64Url(JSON.stringify({ v: SHARE_VERSION, n: name, o: overrides }))
}

/** Never throws: anything unreadable comes back as an error to show the user. */
export function decodeShare(code: string): Decoded {
  const unreadable: Decoded = { ok: false, error: "This rules link can't be read. Ask for it to be sent again." }
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
    return { ok: false, error: 'This rules link was made with a newer version of Thunee. Reload the page and try again.' }
  }
  const overrides = ruleOverridesSchema.safeParse(o ?? {})
  if (!overrides.success) return unreadable
  const name = typeof n === 'string' ? cleanPresetName(n) : null
  return { ok: true, name: name ?? 'Shared rules', overrides: overrides.data }
}

/** Opens Thunee's home, which offers to save the preset. */
export function shareUrl(name: string, overrides: RuleOverrides, origin: string = location.origin): string {
  return `${origin}/thunee?${SHARE_PARAM}=${encodeShare(name, overrides)}`
}
