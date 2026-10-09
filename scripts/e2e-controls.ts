/**
 * Hand controls in a real browser: a short drag does nothing, a long drag
 * plays one card, and an illegal card asks before it is played. First, the game home's
 * "House rules" and "Look" sheets open and close, and computers are added in one tap each
 * and one is changed to Sharp on its row.
 * Needs `pnpm dev`.
 */
import { type Locator, chromium } from 'playwright-core'
import { addComputers } from './lobby'

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
/** A point on the strip a card shows in the fanned hand: its centre can be under the next card. */
const STRIP = { x: 24, y: 30 }
const tap = (target: Locator) => target.click({ position: STRIP, timeout: 1500 }).catch(() => {})
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
// The home's bar: the house rules of the chosen preset, and the look.
await page.getByRole('button', { name: 'House rules', exact: true }).click()
const rules = page.getByRole('dialog', { name: 'House rules' })
check((await rules.isVisible()) && (await rules.getByText('Traditional: no house rules.', { exact: true }).isVisible()), 'House rules opens a sheet naming the chosen preset')
await rules.getByRole('button', { name: 'Close' }).click()
check(!(await rules.isVisible()), 'the house rules close')
await page.getByRole('button', { name: 'Look', exact: true }).click()
const look = page.getByRole('dialog', { name: 'Look' })
const themeBefore = await page.evaluate(() => document.documentElement.dataset.theme)
await look.getByRole('button', { name: 'Blue', exact: true }).first().click()
const themeAfter = await page.evaluate(() => document.documentElement.dataset.theme)
check(themeAfter !== themeBefore, `a theme button changes the table (${themeBefore} to ${themeAfter})`)
await look.getByRole('button', { name: 'Close' }).click()
check(!(await look.isVisible()), 'the look closes')
await page.getByRole('button', { name: 'Create game' }).click()
await page.getByPlaceholder('Name').fill('Arjun')
await page.getByRole('button', { name: 'Sit here' }).first().click()
await addComputers(page, 3)
// One tap adds a Straight computer; the host changes its persona on its row.
const rows = page.locator('main li')
const firstBot = rows.nth(1)
check(await firstBot.getByRole('button', { name: 'Straight', exact: true }).isVisible(), 'a computer is added Straight in one tap')
await firstBot.getByRole('button', { name: 'Straight', exact: true }).click()
const persona = page.getByRole('dialog', { name: 'Change this computer' })
await persona.getByRole('button', { name: /^Sharp/ }).click()
await firstBot.getByRole('button', { name: 'Sharp', exact: true }).waitFor({ timeout: 3000 }).catch(() => {})
check(await firstBot.getByRole('button', { name: 'Sharp', exact: true }).isVisible(), 'the row’s button changes the computer to Sharp')
check((await rows.count()) === 4 && (await page.getByRole('button', { name: 'Add computer' }).count()) === 0, 'three taps fill three seats')
await page.getByRole('button', { name: 'Change rules' }).click()
await page.getByRole('button', { name: 'Not allowed', exact: true }).click()
await page.getByRole('button', { name: 'Close' }).click()
await page.getByText(/1 house rule/).waitFor({ timeout: 3000 }).catch(() => {})
check(!(await firstBot.getByRole('button', { name: 'Sharp', exact: true }).isVisible()) && !(await firstBot.getByText('computer:').isVisible()), 'with cheating off, no persona shows')
// Back to Traditional: the hand's checks need a card that breaks a rule.
await page.getByRole('button', { name: 'Change rules' }).click()
await page.getByRole('button', { name: 'Traditional', exact: true }).click()
await page.getByRole('button', { name: 'Close' }).click()
await page.getByRole('button', { name: 'Start game' }).click()

/** Plays along until it is this player's turn (and, if asked, one where an illegal card exists). */
async function toMyTurn(needIllegal = false) {
  for (let i = 0; i < 1500; i++) {
    for (const name of ['Pass', 'No Thunee', 'No Jodhi', 'Deal next round']) {
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
  const x = box.x + STRIP.x
  const y = box.y + STRIP.y
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
await illegal().click({ position: STRIP })
check((await page.getByRole('button', { name: /anyway/ }).isVisible()) && (await handCount()) === before, 'an illegal card asks before it is played')
await page.locator('.hand').click({ position: { x: 3, y: 3 } })
check(!(await page.getByRole('button', { name: /anyway/ }).isVisible()), 'tapping away cancels')
await illegal().click({ position: STRIP })
await page.getByRole('button', { name: /anyway/ }).click()
check(before - (await settledCount(before)) === 1, 'confirming plays exactly that one card')

if (problems.length) console.log('PROBLEMS:\n' + problems.join('\n'))
await browser.close()
process.exit(problems.length === 0 ? 0 : 1)
