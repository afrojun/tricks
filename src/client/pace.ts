import { paceOf } from '../protocol'

/** Where the browser scripts set the pace: how many times faster than real time the table runs. */
export const PACE_KEY = 'tricks-pace'

/**
 * How many times faster than real time this page's tables run: rooms (which the development server's alone
 * honour), practice, and how long the screen holds each move. The browser scripts set it, so they do not wait
 * out the computers; only the development server's pages read it, and 1 everywhere else. The table's countdowns
 * follow the rate each sync carries.
 */
export function pace(): number {
  if (!import.meta.env.DEV) return 1
  try {
    return paceOf(localStorage.getItem(PACE_KEY))
  } catch {
    return 1
  }
}
