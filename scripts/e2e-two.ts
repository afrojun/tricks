/**
 * Two browsers in one two-player game: join by code, play, then one loses
 * its connection mid-hand and comes back. On the way, a line, a throw and a mute
 * between them. Needs `pnpm dev`.
 */
import { type Locator, type Page, chromium } from 'playwright-core'

const base = process.env.APP_URL ?? 'http://localhost:5173'
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' })
const problems: string[] = []

async function open(name: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(() => localStorage.setItem('tricks-muted', '1'))
  const page = await context.newPage()
  page.on('pageerror', (e) => problems.push(`${name} pageerror: ${e.message}`))
  return { context, page }
}
const check = (ok: boolean, what: string) => {
  if (!ok) problems.push(what)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
}

const a = await open('A')
const b = await open('B')

// A creates a two-player game with short timers.
await a.page.goto(`${base}/thunee`)
await a.page.getByRole('button', { name: 'Two', exact: true }).click()
await a.page.getByRole('button', { name: 'Create game' }).click()
await a.page.getByPlaceholder('Name').fill('Asha')
await a.page.getByRole('button', { name: 'Sit here' }).first().click()
await a.page.getByText('Waiting for 1 more').waitFor()
const code = a.page.url().split('/').pop()!
check((await a.page.locator('li').count()) === 2, 'two-player choice from the home screen reached the lobby')

// B joins by typing the code in lower case.
await b.page.goto(`${base}/thunee`)
await b.page.getByPlaceholder('ABCDEF').fill(code.toLowerCase())
await b.page.getByRole('button', { name: 'Join', exact: true }).click()
await b.page.getByPlaceholder('Name').fill('Bheki')
await b.page.getByRole('button', { name: 'Sit here' }).first().click()
check(b.page.url().endsWith(`/thunee/${code}`), 'lower-case code joined the same room')
check(!(await b.page.getByRole('button', { name: 'Start game' }).isVisible()), 'guest cannot start the game')
await a.page.getByRole('button', { name: 'Start game' }).click()
await b.page.getByText(/unless someone calls/).waitFor()

// Table talk: a line from A shows at A's seat on B's screen; a throw from B lands on A's; muted, A says nothing to B.
const shows = (locator: Locator) =>
  locator
    .first()
    .waitFor({ timeout: 3000 })
    .then(() => true)
    .catch(() => false)
const say = async (page: Page, line: string) => {
  await page.getByRole('button', { name: 'Table talk' }).click()
  await page.getByRole('dialog', { name: 'Table talk' }).getByRole('button', { name: line }).click()
}
await say(a.page, 'Yoh!')
check(await shows(b.page.locator('.seat .talk-said', { hasText: 'Yoh!' })), 'a line shows at the speaker’s seat for the other player')
await b.page.locator('[data-seat-name="0"]').click()
await b.page.getByRole('dialog').getByRole('button', { name: 'Rose', exact: true }).click()
check(await shows(a.page.locator('.talk-layer > *')), 'a throw flies across the other player’s table')
await b.page.locator('[data-seat-name="0"]').click()
await b.page.getByRole('dialog').getByRole('button', { name: /^Mute / }).click()
await a.page.waitForTimeout(3100)
await say(a.page, 'Eish!')
check(!(await shows(b.page.locator('.seat .talk-said', { hasText: 'Eish!' }))), 'a muted player’s line does not show')

/** Does whatever the page is being asked to do; returns true if it acted. */
async function act(page: Page): Promise<boolean> {
  const button = (name: string) => page.getByRole('button', { name, exact: true })
  for (const name of ['Pass', 'No Thunee', 'Deal next round']) {
    if (await button(name).isVisible()) {
      await button(name).click({ timeout: 1500 }).catch(() => {})
      return true
    }
  }
  if (await page.getByText('Choose trump').isVisible()) {
    await page.locator('.panel .btn').first().click({ timeout: 1500 }).catch(() => {})
    return true
  }
  if (await page.getByText(/Your (turn|lead)/).isVisible()) {
    // On the strip the card shows: its centre can be under the next card in the fan.
    await page.locator('.hand .playing-card[data-dim="false"]').first().click({ position: { x: 24, y: 30 }, timeout: 1500 }).catch(() => {})
    return true
  }
  return false
}
const handOf = (page: Page) => page.locator('.hand .playing-card').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))

let dropped = false
const started = Date.now()
while (Date.now() - started < 3 * 60_000) {
  if (await a.page.getByText(/takes? \d+ balls?|wins? the game/).first().isVisible()) break
  await act(a.page)
  await act(b.page)

  const cards = await handOf(b.page)
  const inPlay = await b.page.locator('.trick-area').isVisible()
  if (!dropped && inPlay && cards.length === 3) {
    dropped = true
    await b.context.setOffline(true)
    await b.page.getByText('Connection lost').waitFor({ timeout: 20_000 })
    check(true, 'the dropped player sees a reconnecting banner')
    await a.page.getByText('disconnected').waitFor({ timeout: 20_000 })
    check(true, 'the other player sees them as disconnected')
    await b.context.setOffline(false)
    await b.page.getByText('Connection lost').waitFor({ state: 'hidden', timeout: 30_000 })
    await a.page.getByText('disconnected').waitFor({ state: 'hidden', timeout: 20_000 })
    const after = await handOf(b.page)
    check(after.length > 0 && after.every((c) => cards.includes(c)), `back in the same seat with the same cards (${after.length})`)
    check(!(await b.page.getByPlaceholder('Name').isVisible()), 'no name prompt after reconnecting')
  }
  await a.page.waitForTimeout(120)
}

check(dropped, 'the drop-and-reconnect step ran')
check(await a.page.getByText(/takes? \d+ balls?|wins? the game/).first().isVisible(), 'the round was played to a result')
const bSees = await b.page.getByText(/takes? \d+ balls?|wins? the game/).first().waitFor({ timeout: 5000 }).then(() => true, () => false)
check(bSees, 'both players see the result')
await a.page.screenshot({ path: '/tmp/shots/two-player-result.png' })
if (problems.length) console.log('PROBLEMS:\n' + problems.join('\n'))
await browser.close()
process.exit(problems.length === 0 ? 0 : 1)
