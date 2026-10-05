/**
 * Measures frame pacing while a card is carried around and dropped, in
 * Firefox or Chromium. Needs `pnpm dev`.
 * Usage: pnpm tsx scripts/perf-drag.ts [firefox|chromium] [theme]
 */
import { chromium, firefox } from 'playwright-core'

const engine = process.argv[2] ?? 'firefox'
const theme = process.argv[3] ?? 'modern'
const browser = engine === 'firefox' ? await firefox.launch() : await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' })
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
await context.addInitScript((t) => {
  localStorage.setItem('tricks-theme', t)
  localStorage.setItem('tricks-muted', '1')
}, theme)
const page = await context.newPage()
await page.goto(`${process.env.APP_URL ?? 'http://localhost:5173'}/thunee`)
await page.getByRole('button', { name: 'Create game' }).click()
await page.getByPlaceholder('Name').fill('Arjun')
await page.getByRole('button', { name: 'Sit here' }).first().click()
for (let i = 0; i < 3; i++) {
  await page.getByRole('button', { name: 'Add computer' }).first().click()
  await page.getByRole('button', { name: /^Straight/ }).click()
}
await page.getByRole('button', { name: 'Start game' }).click()
const tap = (name: string) => page.getByRole('button', { name, exact: true }).click({ timeout: 1000 }).catch(() => {})
for (let i = 0; i < 900 && !(await page.getByText(/Your turn/).isVisible()); i++) {
  await tap('Pass')
  await tap('No Thunee')
  if (await page.getByText('Choose trump').isVisible()) await page.locator('.panel .btn').first().click({ timeout: 1000 }).catch(() => {})
  await page.waitForTimeout(100)
}

// Passed as strings: the bundler's helpers do not exist inside the page.
/** Records the gap between animation frames until stopped. */
const startFrames = () =>
  page.evaluate(`(() => {
    window.__gaps = []
    window.__run = true
    let last = performance.now()
    requestAnimationFrame(function tick(now) {
      window.__gaps.push(now - last)
      last = now
      if (window.__run) requestAnimationFrame(tick)
    })
  })()`)
const stopFrames = () =>
  page.evaluate(`(() => {
    window.__run = false
    const gaps = window.__gaps.slice(1).sort((a, b) => a - b)
    const total = gaps.reduce((s, g) => s + g, 0)
    return {
      frames: gaps.length,
      fps: Math.round((gaps.length / total) * 1000),
      p95ms: Math.round(gaps[Math.floor(gaps.length * 0.95)] || 0),
      worstMs: Math.round(gaps[gaps.length - 1] || 0),
      slowFrames: gaps.filter((g) => g > 34).length,
    }
  })()`)

const card = page.locator('.hand .playing-card[data-dim="false"]').first()
const box = (await card.boundingBox())!
const x = box.x + box.width / 2
const y = box.y + box.height / 2

await startFrames()
await page.mouse.move(x, y)
await page.mouse.down()
// Carry the card in a wide loop over the table for about two seconds.
for (let i = 1; i <= 120; i++) {
  const t = (i / 120) * Math.PI * 2
  await page.mouse.move(x + Math.sin(t) * 110 + 60, y - 260 + Math.cos(t) * 120)
  await page.waitForTimeout(12)
}
const carry = await stopFrames()

await startFrames()
await page.mouse.up() // drop over the table: the card travels to the trick and the computers play on
await page.waitForTimeout(2500)
const play = await stopFrames()

console.log(`${engine} ${theme} carry: ${JSON.stringify(carry)}`)
console.log(`${engine} ${theme} play:  ${JSON.stringify(play)}`)
await browser.close()
