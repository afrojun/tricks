/**
 * Hand controls in a real browser: a short drag does nothing, a long drag
 * plays one card, and an illegal card asks before it is played. First, the house rules screen
 * (made, changed, renamed, copied and deleted there, then chosen on the home and in the lobby),
 * "Look", and computers added in one tap each, one changed to Sharp on its row. Last, share links.
 * Needs `pnpm dev`.
 */
import { type Locator, chromium } from 'playwright-core'
import { encodeShare } from '../src/presets/share'
import { addComputers } from './lobby'

const base = process.env.APP_URL ?? 'http://localhost:5173'
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' })
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
await context.addInitScript(() => localStorage.setItem('tricks-muted', '1'))
const page = await context.newPage()
const problems: string[] = []
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
const seen = (text: string | RegExp, timeout = 3000) => page.getByText(text).first().waitFor({ timeout }).then(() => true, () => false)
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
// The house rules screen: from the home, made, changed, renamed, copied and deleted there.
const pressed = async (name: string) => (await page.getByRole('button', { name, exact: true }).getAttribute('aria-pressed').catch(() => null)) === 'true'
const nameField = page.getByRole('textbox', { name: 'Preset name' })
await page.getByRole('link', { name: 'House rules' }).click()
await page.getByRole('heading', { name: 'House rules' }).waitFor()
check(new URL(page.url()).pathname === '/thunee/rules' && (await pressed('Traditional')) && (await seen('Built in')), '"House rules" opens the screen with the chosen preset')
await page.getByRole('button', { name: 'Add preset' }).click()
check((await nameField.inputValue()) === 'New preset' && (await nameField.evaluate((e) => e === document.activeElement)), '"Add preset" makes "New preset" and focuses its name')
await page.keyboard.type('Friday night')
await page.keyboard.press('Enter')
await page.getByRole('button', { name: 'Not allowed', exact: true }).click()
await page.reload()
await page.getByRole('heading', { name: 'House rules' }).waitFor()
check((await pressed('Friday night')) && (await nameField.inputValue()) === 'Friday night', 'a rename sticks after a reload')
check(await pressed('Not allowed'), 'a rule changed on the screen sticks after a reload')
await page.getByRole('button', { name: 'Traditional', exact: true }).click()
await page.getByRole('button', { name: 'Make a copy' }).click()
check((await pressed('Traditional copy')) && (await nameField.inputValue()) === 'Traditional copy', '"Make a copy" of Traditional makes "Traditional copy"')
await page.getByRole('button', { name: 'Delete', exact: true }).click()
check(await seen('Delete Traditional copy?'), '"Delete" asks first')
await page.getByRole('button', { name: 'Delete', exact: true }).click()
await page.waitForTimeout(200)
check(!(await page.getByRole('button', { name: 'Traditional copy', exact: true }).isVisible()), 'and deletes')
await page.getByRole('button', { name: 'Friday night', exact: true }).click()
await page.getByRole('link', { name: 'Thunee' }).click()
await page.getByRole('heading', { name: 'Thunee' }).waitFor()
check((await page.getByRole('link', { name: 'House rules' }).getAttribute('href')) === '/thunee/rules', 'the bar’s "House rules" links to the screen')
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
const rows = page.locator('main li')
const firstBot = rows.nth(1)
const filled = [await rows.count(), await page.getByRole('button', { name: 'Add computer' }).count()]
check(filled[0] === 4 && filled[1] === 0, `three taps fill three seats (${filled})`)
// Friday night has cheating off: no persona to show or change.
check(await seen('Friday night'), 'the room is created with the chosen preset')
check(!(await firstBot.getByText('computer:').isVisible()) && (await firstBot.getByText(/computer$/).isVisible()), 'with cheating off, no persona shows')
// The host picks a preset in the lobby.
const summary = page.locator('section', { has: page.getByRole('heading', { name: 'House rules' }) }).locator('p').first()
check(await pressed('Friday night'), 'the host sees the presets, the room’s pressed')
await page.getByRole('button', { name: 'Traditional', exact: true }).click()
await page.waitForTimeout(500)
check((await summary.textContent()) === 'Traditional' && (await pressed('Traditional')), `picking a preset changes the summary (${await summary.textContent()})`)
// One tap added a Straight computer; the host changes its persona on its row.
check(await firstBot.getByRole('button', { name: 'Straight', exact: true }).isVisible(), 'a computer is added Straight in one tap')
await firstBot.getByRole('button', { name: 'Straight', exact: true }).click()
await page.getByRole('dialog', { name: 'Change this computer' }).getByRole('button', { name: /^Sharp/ }).click()
await firstBot.getByRole('button', { name: 'Sharp', exact: true }).waitFor({ timeout: 3000 }).catch(() => {})
check(await firstBot.getByRole('button', { name: 'Sharp', exact: true }).isVisible(), 'the row’s button changes the computer to Sharp')
// "Change the rules": the room's rules as a shared preset, saved, and back to the room, whose seat waited.
const room = new URL(page.url()).pathname
await page.getByRole('link', { name: 'Change the rules' }).click()
await page.getByRole('heading', { name: 'House rules' }).waitFor()
const code = room.split('/').pop()
check(await seen('Shared with you'), '"Change the rules" opens the room’s rules as a shared preset')
await page.getByRole('button', { name: 'Save', exact: true }).click()
check((await pressed(`Game ${code}`)) && !new URL(page.url()).searchParams.has('rules'), '"Save" saves it, selects it, and drops it from the address')
await page.getByRole('link', { name: `Game ${code}` }).click()
await page.getByRole('heading', { name: 'Take a seat' }).waitFor()
check(new URL(page.url()).pathname === room && (await rows.first().getByText('(you)').isVisible()), 'the back link returns to the room, where the seat waited')
check(await page.getByRole('button', { name: `Game ${code}`, exact: true }).isVisible(), 'the saved preset is a chip in the lobby')
await page.getByRole('button', { name: 'Start game' }).click()

/** Plays along until it is this player's turn (and, if asked, one where an illegal card exists). */
async function toMyTurn(needIllegal = false) {
  for (let i = 0; i < 1500; i++) {
    for (const name of ['Pass', 'No Thunee', 'No Jodhi', 'Deal next round']) {
      const button = page.getByRole('button', { name, exact: true })
      if (await button.isVisible()) await tap(button)
    }
    if (await page.getByText('Choose trump').isVisible()) await tap(page.locator('.panel .btn').first())
    if (await page.getByText(/Your (turn|lead)/).isVisible()) {
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
check((await handCount()) === before && (await page.getByText(/Your (turn|lead)/).isVisible()), 'a short drag returns the card and plays nothing')
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

// A share link opens the home, which hands it to the screen.
const link = await context.newPage()
await link.goto(`${base}/thunee?rules=${encodeShare('Quick game', { ballsToWin: 6 })}`)
await link.getByText('Shared with you').waitFor({ timeout: 5000 }).catch(() => {})
check(new URL(link.url()).pathname === '/thunee/rules' && (await link.getByText('Shared with you').isVisible()), 'a share link opens the screen with "Shared with you"')
await link.getByRole('button', { name: 'Save', exact: true }).click()
check((await link.getByRole('button', { name: 'Quick game', exact: true }).getAttribute('aria-pressed')) === 'true', '"Save" adds it')
await link.goto(`${base}/thunee?rules=not-a-code`)
check(await link.getByText('This rules link can’t be read').first().waitFor({ timeout: 5000 }).then(() => true, () => false), 'a code that does not decode shows its error')

if (problems.length) console.log('PROBLEMS:\n' + problems.join('\n'))
await browser.close()
process.exit(problems.length === 0 ? 0 : 1)
