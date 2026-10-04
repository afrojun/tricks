const KEY = 'thunee-device-token'

/** This device's secret, created once. It proves who owns a seat and is never shown to other players. */
export function deviceToken(): string {
  let token = localStorage.getItem(KEY)
  if (!token || token.length < 16) {
    // getRandomValues works on plain-http origins, where randomUUID does not exist.
    token = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('')
    localStorage.setItem(KEY, token)
  }
  return token
}
