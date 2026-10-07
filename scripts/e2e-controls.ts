/**
 * Hand controls in a real browser: a short drag does nothing, a long drag
 * plays one card, and an illegal card asks before it is played.
 * Needs `pnpm dev`.
 */
import { type Locator, chromium } from 'playwright-core'

const base = process.env.APP_URL ?? 'http://localhost:5173'
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' })
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
await context.addInitScript(() => localStorage.setItem('tricks-muted', '1'))
const page = await context.newPage()
const problems: string[] = []
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
const check = (ok: boolean, what: string) => {
  if (!ok) problems.push(what)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
}
const tap = (target: Locator) => target.click({ timeout: 1500 }).catch(() => {})
const handCount = () => page.locator('.hand .playing-card').count()
/** The hand's count once a play has left it: a played card stays in the hand's DOM until its travel to the table ends. */
async function settledCount(from: number): Promise<number> {
  for (let i = 0; i < 20; i++) {
    const now = await handCount()
    if (now !== from) return now
    await page.waitForTimeout(100)
  }
  return handCount()
}
const legal = () => page.locator('.hand .playing-card[data-dim="false"]').first()
const illegal = () => page.locator('.hand .playing-card[data-dim="true"]').first()

await page.goto(`${base}/thunee`)
await page.getByRole('button', { name: 'Create game' }).click()
await page.getByPlaceholder('Name').fill('Arjun')
await page.getByRole('button', { name: 'Sit here' }).first().click()
for (let i = 0; i < 3; i++) {
  await page.getByRole('button', { name: 'Add computer' }).first().click()
  await page.getByRole('button', { name: /^Straight/ }).click()
}
await page.getByRole('button', { name: 'Start game' }).click()

/** Plays along until it is this player's turn (and, if asked, one where an illegal card exists). */
async function toMyTurn(needIllegal = false) {
  for (let i = 0; i < 1500; i++) {
    for (const name of ['Pass', 'No Thunee', 'Deal next round']) {
      const button = page.getByRole('button', { name, exact: true })
      if (await button.isVisible()) await tap(button)
    }
    if (await page.getByText('Choose trump').isVisible()) await tap(page.locator('.panel .btn').first())
    if (await page.getByText(/Your turn/).isVisible()) {
      if (!needIllegal || (await illegal().count()) > 0) return
      await tap(legal())
    }
    await page.waitForTimeout(100)
  }
  throw new Error('never reached the turn needed')
}

async function dragUp(card: Locator, distance: number) {
  const box = (await card.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let step = 1; step <= 8; step++) await page.mouse.move(x, y - (distance * step) / 8, { steps: 2 })
  await page.mouse.up()
  await page.waitForTimeout(700)
}

await toMyTurn()
let before = await handCount()
await dragUp(legal(), 30)
check((await handCount()) === before && (await page.getByText(/Your turn/).isVisible()), 'a short drag returns the card and plays nothing')
await dragUp(legal(), 130)
check(before - (await settledCount(before)) === 1, 'a long drag plays exactly one card')

await toMyTurn(true)
before = await handCount()
await illegal().click()
check((await page.getByRole('button', { name: /anyway/ }).isVisible()) && (await handCount()) === before, 'an illegal card asks before it is played')
await page.locator('.hand').click({ position: { x: 3, y: 3 } })
check(!(await page.getByRole('button', { name: /anyway/ }).isVisible()), 'tapping away cancels')
await illegal().click()
await page.getByRole('button', { name: /anyway/ }).click()
check(before - (await settledCount(before)) === 1, 'confirming plays exactly that one card')

if (problems.length) console.log('PROBLEMS:\n' + problems.join('\n'))
await browser.close()
process.exit(problems.length === 0 ? 0 : 1)
