/** Chromium for the browser scripts. */
import { getPriority, setPriority } from 'node:os'
import { type BrowserContext, chromium } from 'playwright-core'

/**
 * Starts Chromium at a lower priority, as the tests run (`vitest.config.ts`), so that other work on a shared
 * machine goes first: the browser and its renderers inherit the script's priority.
 */
export function launch() {
  setPriority(Math.max(getPriority(), 10))
  return chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' })
}

/**
 * How many times faster than real time the development server's tables run for the scripts, so they do not wait
 * out the computers: `PACE`, or 4. A production build (`pnpm preview`) runs at real time whatever it is.
 */
export const PACE = process.env.PACE ?? '4'

/** Has a context's pages run their tables, their practice and the holds between moves at the scripts' pace. */
export function paced(context: BrowserContext) {
  return context.addInitScript((pace) => localStorage.setItem('tricks-pace', pace), PACE)
}
