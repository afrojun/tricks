/**
 * Drives the real app in a browser at phone size: one human against three
 * computers, with a page refresh mid-hand. Needs `pnpm dev` and `pnpm party`
 * running. Usage: pnpm tsx scripts/e2e.ts [theme] [shots-dir]
 */
import { chromium } from 'playwright-core'

const theme = process.argv[2] ?? 'retro'
const shots = process.argv[3] ?? '/tmp/shots'
const base = process.env.APP_URL ?? 'http://localhost:5173'

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
await context.addInitScript((t) => {
  localStorage.setItem('thunee-theme', t)
  localStorage.setItem('thunee-muted', '1')
}, theme)
const page = await context.newPage()
const problems: string[] = []
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`))
const shot = (name: string) => page.screenshot({ path: `${shots}/${theme}-${name}.png` })
const visible = (name: string | RegExp) => page.getByRole('button', { name }).first().isVisible()

await page.goto(base)
await shot('1-home')
await page.getByRole('button', { name: 'Create game' }).click()
await page.getByPlaceholder('Name').fill('Arjun')
await page.getByRole('button', { name: 'Sit here' }).first().click()
for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Add computer' }).first().click()
await page.getByRole('button', { name: 'Change rules' }).click()
await page.getByRole('button', { name: 'More Balls to win' }).waitFor()
for (let i = 0; i < 9; i++) await page.getByRole('button', { name: 'Less Balls to win' }).click()
await shot('2-rules-editor')
await page.getByRole('button', { name: 'Close' }).click()
await shot('3-lobby')
await page.getByRole('button', { name: 'Start game' }).click()

const seen = new Set<string>()
let refreshed = false
const started = Date.now()
while (Date.now() - started < 6 * 60_000) {
  if (await page.getByText(/win the game/).isVisible()) break

  const once = async (key: string, when: boolean) => {
    if (when && !seen.has(key)) {
      seen.add(key)
      await shot(key)
    }
  }
  await once('4-calling', await page.getByText(/unless someone calls|called \d+/).first().isVisible())
  await once('5-choose-trump', await page.getByText('Choose trump').isVisible())
  await once('6-thunee-window', await visible('No Thunee'))
  await once('8-round-result', await visible('Deal next round'))

  if (await visible('Pass')) await page.getByRole('button', { name: 'Pass' }).click()
  else if (await page.getByText('Choose trump').isVisible()) await page.locator('.panel .btn').first().click()
  else if (await visible('No Thunee')) await page.getByRole('button', { name: 'No Thunee' }).click()
  else if (await visible('Deal next round')) await page.getByRole('button', { name: 'Deal next round' }).click()
  else if (await page.getByText(/Your turn/).isVisible()) {
    await once('7-my-turn', (await page.locator('.trick-area .playing-card').count()) >= 2)
    // Refresh once, mid-hand: the seat and cards must come back with no name prompt.
    if (!refreshed && (await page.locator('.hand .playing-card').count()) <= 4) {
      refreshed = true
      const before = await page.locator('.hand .playing-card').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
      await page.reload()
      await page.getByText(/Your turn/).waitFor({ timeout: 10_000 })
      const after = await page.locator('.hand .playing-card').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
      if (JSON.stringify(before) !== JSON.stringify(after)) problems.push(`hand changed across refresh: ${before} -> ${after}`)
      if (await page.getByPlaceholder('Name').isVisible()) problems.push('asked for a name after refresh')
      console.log(`refreshed mid-hand, same ${after.length} cards`)
    }
    const legal = page.locator('.hand .playing-card[data-dim="false"]').first()
    await legal.click().catch(() => {})
  }
  await page.waitForTimeout(150)
}

await shot('9-game-over')
const finished = await page.getByText(/win the game/).isVisible()
await page.getByRole('button', { name: 'Open menu' }).click().catch(() => {})
await shot('10-menu')
console.log(`${theme}: finished=${finished} refreshed=${refreshed} screens=${[...seen].sort().join(',')}`)
if (problems.length) console.log('PROBLEMS:\n' + [...new Set(problems)].join('\n'))
await browser.close()
process.exit(finished && refreshed && problems.length === 0 ? 0 : 1)
