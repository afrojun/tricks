const KEY = 'thunee-device-token'

/** This device's secret, created once. It proves who owns a seat and is never shown to other players. */
export function deviceToken(): string {
  let token = localStorage.getItem(KEY)
  if (!token || token.length < 16) {
    token = crypto.randomUUID().replaceAll('-', '')
    localStorage.setItem(KEY, token)
  }
  return token
}
