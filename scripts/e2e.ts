/**
 * Drives the real app in a browser at phone size: from the Tricks home into
 * Thunee, one human against three computers, with a page refresh mid-hand.
 * Needs `pnpm dev` running. Usage: pnpm tsx scripts/e2e.ts [theme] [shots-dir]
 */
import { launch, paced, tapCard } from './browser'
import { addComputers } from './lobby'

const theme = process.argv[2] ?? 'green'
const shots = process.argv[3] ?? '/tmp/shots'
const base = process.env.APP_URL ?? 'http://localhost:5173'

const browser = await launch()
// Reduced motion, as every browser script asks, unless MOTION=1.
const reduced = process.env.MOTION !== '1'
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  reducedMotion: reduced ? 'reduce' : 'no-preference',
  recordVideo: process.env.VIDEO ? { dir: process.env.VIDEO, size: { width: 390, height: 844 } } : undefined,
})
await context.addInitScript((t) => {
  localStorage.setItem('tricks-theme', t)
  localStorage.setItem('tricks-muted', '1')
}, theme)
await paced(context)
const page = await context.newPage()
const problems: string[] = []
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`))
const shot = (name: string) => page.screenshot({ path: `${shots}/${theme}-${name}.png` })
const visible = (name: string | RegExp) => page.getByRole('button', { name }).first().isVisible()

await page.goto(base)
await shot('0-tricks-home')
await page.getByRole('link', { name: /^Thunee/ }).click()
await page.getByRole('heading', { name: 'Thunee' }).waitFor()
if (!page.url().endsWith('/thunee')) problems.push(`the Thunee card led to ${page.url()}`)
await shot('1-home')
// A game's home leads to Tricks and to the other game; Tricks leads back.
if (!(await page.getByRole('link', { name: 'Tricks', exact: true }).isVisible())) problems.push('the game home has no Tricks link')
if (!(await page.getByRole('link', { name: /^Hearts/ }).isVisible())) problems.push('the game home has no link to Hearts')
await page.getByRole('link', { name: 'Tricks', exact: true }).click()
await page.getByRole('heading', { name: 'Tricks' }).waitFor()
if (new URL(page.url()).pathname !== '/') problems.push(`the Tricks link led to ${page.url()}`)
await page.getByRole('link', { name: /^Thunee/ }).click()
await page.getByRole('heading', { name: 'Thunee' }).waitFor()
// A short game: a preset made on the house rules screen, which a new room then starts with.
await page.getByRole('link', { name: 'House rules' }).click()
await page.getByRole('heading', { name: 'House rules' }).waitFor()
await page.getByRole('button', { name: 'Add preset' }).click()
await page.keyboard.type('Short')
await page.keyboard.press('Enter')
await page.getByRole('button', { name: 'Balls to win: more' }).waitFor()
for (let i = 0; i < 9; i++) await page.getByRole('button', { name: 'Balls to win: less' }).click()
await shot('2-rules-editor')
await page.getByRole('link', { name: 'Thunee' }).click()
await page.getByRole('heading', { name: 'Thunee' }).waitFor()
await page.getByRole('button', { name: 'Create game' }).click()
await page.waitForURL(/\/thunee\/[A-Z]{6}$/)
await page.getByPlaceholder('Name').fill('Arjun')
await page.getByRole('button', { name: 'Sit here' }).first().click()
await page.getByRole('button', { name: 'Short', exact: true }).waitFor()
// The room takes the preset as the host sits, a moment after the buttons show.
if (!(await page.getByRole('button', { name: 'Short', exact: true, pressed: true }).waitFor({ timeout: 5000 }).then(() => true, () => false))) problems.push('the room did not start on the new preset')
await addComputers(page, 3)
await page.getByText('Short', { exact: true }).first().waitFor()
await shot('3-lobby')
await page.getByRole('button', { name: 'Start game' }).click()

const seen = new Set<string>()
let refreshed = false
const started = Date.now()
while (Date.now() - started < 6 * 60_000) {
  // The game over has its own screen, marked "Game over" over the winner.
  if (await page.getByText(/^Game over/).isVisible()) break

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

  // A control can disappear between being seen and being clicked; that is the game moving on, not a failure.
  const tap = (target: ReturnType<typeof page.locator>) => target.click({ timeout: 1500 }).catch(() => {})
  if (await visible('Pass')) await tap(page.getByRole('button', { name: 'Pass' }))
  else if (await page.getByText('Choose trump').isVisible()) await tap(page.locator('.panel .btn').first())
  else if (await visible('No Thunee')) await tap(page.getByRole('button', { name: 'No Thunee' }))
  // Without timers the computer partner's lead waits for this answer.
  else if (await visible('No Jodhi')) await tap(page.getByRole('button', { name: 'No Jodhi' }))
  else if (await visible('Deal next round')) await tap(page.getByRole('button', { name: 'Deal next round' }))
  else if (await page.getByText(/Your (turn|lead)/).isVisible()) {
    await once('7-my-turn', (await page.locator('.trick-area .playing-card').count()) >= 2)
    // Refresh once, mid-hand: the seat and cards must come back with no name prompt.
    if (!refreshed && (await page.locator('.hand .playing-card').count()) <= 4) {
      refreshed = true
      const before = await page.locator('.hand .playing-card').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
      await page.reload()
      await page.getByText(/Your (turn|lead)/).waitFor({ timeout: 10_000 })
      const after = await page.locator('.hand .playing-card').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
      if (JSON.stringify(before) !== JSON.stringify(after)) problems.push(`hand changed across refresh: ${before} -> ${after}`)
      if (await page.getByPlaceholder('Name').isVisible()) problems.push('asked for a name after refresh')
      console.log(`refreshed mid-hand, same ${after.length} cards`)
    }
    const legal = page.locator('.hand .playing-card[data-dim="false"]').first()
    await tapCard(legal, { timeout: 1500 }).catch(() => {})
  }
  await page.waitForTimeout(150)
}

await shot('9-game-over')
const finished = await page.getByText(/^Game over/).isVisible()
await page.getByRole('button', { name: 'Open menu' }).click().catch(() => {})
await shot('10-menu')
// Old addresses are not redirected: they show the Tricks home.
await page.goto(`${base}/game/ABCDEF`)
const tricksHome = await page.getByRole('heading', { name: 'Tricks' }).waitFor({ timeout: 5000 }).then(() => true, () => false)
if (!tricksHome) problems.push('an old /game address did not show the Tricks home')
console.log(`${theme}${reduced ? ' (reduced motion)' : ''}: finished=${finished} refreshed=${refreshed} screens=${[...seen].sort().join(',')}`)
if (problems.length) console.log('PROBLEMS:\n' + [...new Set(problems)].join('\n'))
await context.close() // flushes the video, if one is being recorded
await browser.close()
process.exit(finished && refreshed && problems.length === 0 ? 0 : 1)
