/**
 * Hearts in two browsers at phone size: create a room at /hearts, join it from a second browser,
 * fill the other seats with computers and start. Hearts' table is still a placeholder that shows
 * the game without taking a card, so once each player has been waited on for a minute the other
 * lets the computer play for them, and the placeholder must then follow the round to its end.
 * Also checks that the home loads no game's code and that Hearts' practice says it is coming.
 * Needs `pnpm dev`. Usage: pnpm tsx scripts/e2e-hearts.ts [shots-dir]
 */
import { type Page, chromium } from 'playwright-core'

const shots = process.argv[2] ?? '/tmp/shots'
const base = process.env.APP_URL ?? 'http://localhost:5173'
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' })
const problems: string[] = []

async function open(name: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  await context.addInitScript(() => localStorage.setItem('tricks-muted', '1'))
  const page = await context.newPage()
  page.on('pageerror', (e) => problems.push(`${name} pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && problems.push(`${name} console: ${m.text()}`))
  return page
}
const check = (ok: boolean, what: string) => {
  if (!ok) problems.push(what)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
}
const shot = (page: Page, name: string) => page.screenshot({ path: `${shots}/hearts-${name}.png` })
const seen = (page: Page, text: string | RegExp, timeout = 5000) => page.getByText(text).first().waitFor({ timeout }).then(() => true, () => false)

const a = await open('A')
const b = await open('B')

// The Tricks home lists Hearts without loading any game's code.
const requested: string[] = []
a.on('request', (r) => requested.push(new URL(r.url()).pathname))
await a.goto(base)
await a.getByRole('heading', { name: 'Tricks' }).waitFor()
await a.waitForTimeout(500)
check(!requested.some((p) => /\/src\/games\/|\/assets\/(thunee|hearts)-/.test(p)), 'the Tricks home loads no game')
await shot(a, '0-tricks-home')
await a.getByRole('link', { name: /^Hearts/ }).click()
await a.getByRole('heading', { name: 'Hearts' }).waitFor()
check(a.url().endsWith('/hearts'), 'the Hearts card leads to /hearts')
check(!requested.some((p) => /\/src\/games\/thunee\/|\/assets\/thunee-/.test(p)), 'Hearts loads without Thunee')
check(await seen(a, 'are coming to Hearts'), 'the home says practice is coming')
await shot(a, '1-home')

// A creates the room and sits; B joins by its code.
await a.getByRole('button', { name: 'Create game' }).click()
await a.waitForURL(/\/hearts\/[A-Z]{6}$/)
const code = a.url().split('/').pop()!
await a.getByPlaceholder('Name').fill('Asha')
await a.getByRole('button', { name: 'Sit here' }).first().click()
await a.getByText('Waiting for 3 more').waitFor()
await b.goto(`${base}/hearts`)
await b.getByPlaceholder('ABCDEF').fill(code)
await b.getByRole('button', { name: 'Join game' }).click()
await b.getByPlaceholder('Name').fill('Bheki')
await b.getByRole('button', { name: 'Sit here' }).first().click()
check(b.url().endsWith(`/hearts/${code}`), 'the second browser joined the same room')
for (let i = 0; i < 2; i++) {
  await a.getByRole('button', { name: 'Add computer' }).first().click()
  await a.getByRole('button', { name: /^Straight/ }).click()
}
check(!(await a.getByRole('button', { name: /players$/ }).first().isVisible()), 'Hearts offers no other table size')
check(!(await seen(a, /^Team /, 500)), 'Hearts has no teams in the lobby')
await a.getByRole('button', { name: 'See every rule' }).click()
check(await seen(a, 'Shooting the moon'), 'the rules sheet describes Hearts’ rules')
await a.getByRole('button', { name: 'Close' }).click()
// The end score moves by 25 with − and +, and any whole number between can be typed.
await a.getByRole('button', { name: 'Change rules' }).click()
const endsAt = a.getByRole('spinbutton', { name: 'The game ends at' })
await endsAt.fill('101')
await endsAt.press('Enter')
await a.waitForTimeout(500)
check((await endsAt.inputValue()) === '101', 'an end score of 101 can be typed in the rules editor')
await shot(a, '2-rules-editor')
await a.getByRole('button', { name: 'Close' }).click()
check(await seen(a, 'Standard with 1 house rule'), 'the room keeps it as a house rule')
await shot(a, '2-lobby')
await a.getByRole('button', { name: 'Start game' }).click()

for (const [page, who] of [[a, 'A'], [b, 'B']] as const) {
  check(await seen(page, 'The Hearts table is being built', 10_000), `${who} sees the placeholder table`)
  check(await seen(page, /Passing three cards to the left/), `${who} sees the pass to the left`)
  check((await page.locator('[aria-label="Your hand"] .playing-card').count()) === 13, `${who} sees a hand of thirteen`)
  check(await seen(page, 'reaches 101'), `${who} plays to the end score of 101`)
}
await shot(a, '3-passing')

/** Opens the menu and lets the computer play for whoever it offers, once they have been waited on long enough. */
async function standIn(page: Page, name: string) {
  const offer = page.getByRole('button', { name: `Computer plays for ${name}` })
  for (let tries = 0; tries < 30; tries++) {
    await page.getByRole('button', { name: 'Open menu' }).click()
    if (await offer.isVisible()) {
      await offer.click()
      await page.getByRole('button', { name: 'Close' }).click()
      return true
    }
    await page.getByRole('button', { name: 'Close' }).click()
    await page.waitForTimeout(5000)
  }
  return false
}
console.log('waiting a minute for each player to have stalled')
check(await standIn(a, 'Bheki'), 'the host lets the computer play for the other player')
check(await standIn(b, 'Asha'), 'the other player lets the computer play for the host')
check(await seen(a, 'The computer is playing for you.'), 'the host sees the computer playing for them')

check(await seen(a, 'took the trick', 60_000), 'the placeholder shows a trick taken')
await shot(a, '4-playing')
check(await seen(a, /The round is over|shot the moon/, 180_000), 'the round is played to its end')
const taken = await a.locator('tbody tr td:nth-child(2)').allTextContents()
const total = taken.reduce((sum, t) => sum + Number(t), 0)
check(total === 26 || total === 78, `this round's points add up (${taken.join(', ')})`)
check(await seen(b, /The round is over|shot the moon/, 10_000), 'both players see the round end')
await shot(a, '5-round-over')

await a.goto(`${base}/hearts/practice`)
check(await seen(a, 'Practice is coming'), '/hearts/practice says practice is coming')
await shot(a, '6-practice')

if (problems.length) console.log('PROBLEMS:\n' + problems.join('\n'))
await browser.close()
process.exit(problems.length === 0 ? 0 : 1)
