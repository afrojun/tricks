/**
 * "Your games": the games this device sits in, on the Tricks home with what each waits on, and on a
 * game's home only the ones that need the player now. Needs `pnpm dev`.
 */
import type { Locator } from 'playwright-core'
import { launch, paced } from './browser'
import { addComputers } from './lobby'

const base = process.env.APP_URL ?? 'http://localhost:5173'
const shots = process.env.SHOTS
const browser = await launch()
const problems: string[] = []
const check = (ok: boolean, what: string) => {
  if (!ok) problems.push(what)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
}
const shows = (locator: Locator) =>
  locator
    .first()
    .waitFor({ timeout: 5000 })
    .then(() => true)
    .catch(() => false)

const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
await context.addInitScript(() => localStorage.setItem('tricks-muted', '1'))
await paced(context)
const page = await context.newPage()
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))

// Nothing to list on a device that sits nowhere.
await page.goto(base)
await page.getByRole('heading', { name: 'Tricks' }).waitFor()
await page.waitForTimeout(500)
check((await page.getByRole('region', { name: 'Your games' }).count()) === 0, 'no list for a device that sits nowhere')

// A Hearts game with three computers: passing waits on the player.
await page.goto(`${base}/hearts`)
await page.getByRole('button', { name: 'Create game' }).click()
await page.getByPlaceholder('Name').fill('Asha')
await page.getByRole('button', { name: 'Sit here' }).first().click()
const hearts = page.url().split('/').pop()!
await addComputers(page, 3)
await page.getByRole('button', { name: 'Start game' }).click()
await page.getByText(/Pick three/).first().waitFor()

// A Thunee lobby, sat in and left waiting.
await page.goto(`${base}/thunee`)
await page.getByRole('button', { name: 'Create game' }).click()
await page.getByRole('button', { name: 'Sit here' }).first().click()
const thunee = page.url().split('/').pop()!
await page.getByRole('button', { name: 'Add computer' }).first().waitFor()

await page.goto(base)
const list = page.getByRole('region', { name: 'Your games' })
check(await shows(list), 'the Tricks home lists the games this device sits in')
const rows = list.getByRole('link')
check(await shows(rows.filter({ hasText: /^Hearts with .+Your turn$/ })), 'a game waiting on the player says so, naming the others')
check(await shows(rows.filter({ hasText: `Thunee, game ${thunee}In the lobby` })), 'a lobby says so')
check((await rows.first().textContent())?.includes('Your turn') === true, 'the game that needs the player comes first')
if (shots) await page.screenshot({ path: `${shots}/your-games.png`, fullPage: true })

// A game's home shows only its own games that need the player.
await page.goto(`${base}/hearts`)
check(await shows(page.getByRole('region', { name: 'Your games' }).getByRole('link', { name: /Your turn/ })), 'the game’s home shows its game that needs the player')
await page.goto(`${base}/thunee`)
await page.waitForTimeout(1000)
check((await page.getByRole('region', { name: 'Your games' }).count()) === 0, 'and nothing for a lobby')

// A row opens its game; standing up in the lobby takes it off the list.
await page.goto(base)
await rows.filter({ hasText: 'In the lobby' }).first().click()
check(page.url().endsWith(`/thunee/${thunee}`), 'a row opens its game')
await page.getByRole('button', { name: 'Stand up' }).click()
await page.getByRole('button', { name: 'Sit here' }).first().waitFor()
await page.goto(base)
await shows(list)
await page.waitForTimeout(500)
check((await rows.filter({ hasText: 'In the lobby' }).count()) === 0, 'standing up takes a game off the list')
check(await shows(rows.filter({ hasText: /^Hearts with/ })), 'and leaves the others')
void hearts

await browser.close()
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n${problems.join('\n')}`)
  process.exit(1)
}
console.log('\nYour games checks passed.')
