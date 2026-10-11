/** Chromium for the browser scripts. */
import { getPriority, setPriority } from 'node:os'
import { type BrowserContext, type Locator, chromium } from 'playwright-core'

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

/**
 * Taps a card in a hand where a finger would: on a point of it that no other card covers. A hand's cards overlap
 * and tilt, so a fixed spot near a card's edge can lie under a neighbour's corner, and a click there never lands.
 * Fails as a click does when it cannot tap.
 */
export async function tapCard(card: Locator, options: { timeout?: number } = {}): Promise<void> {
  const point = await card.evaluate((el) => {
    const box = el.getBoundingClientRect()
    for (let y = 0.15; y < 0.9; y += 0.15) {
      for (let x = 0.04; x < 0.96; x += 0.04) {
        const top = document.elementFromPoint(box.left + box.width * x, box.top + box.height * y)
        if (top !== null && el.contains(top)) return { x: box.width * x, y: box.height * y }
      }
    }
    return null
  }, undefined, options)
  await card.click({ ...options, position: point ?? { x: 8, y: 30 } })
}
