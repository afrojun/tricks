/** Chromium for the browser scripts. */
import { getPriority, setPriority } from 'node:os'
import { chromium } from 'playwright-core'

/**
 * Starts Chromium at a lower priority, as the tests run (`vitest.config.ts`), so that other work on a shared
 * machine goes first: the browser and its renderers inherit the script's priority.
 */
export function launch() {
  setPriority(Math.max(getPriority(), 10))
  return chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' })
}
