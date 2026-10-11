/**
 * The table's pace, which is not a house rule: the host sets it in the lobby, a guest sees it,
 * a change says who made it, the host changes it again from the menu during play, and the next
 * game the host creates starts on it. Needs `pnpm dev`.
 */
import type { Locator } from 'playwright-core'
import { launch, paced } from './browser'
import { addComputers } from './lobby'

const base = process.env.APP_URL ?? 'http://localhost:5173'
const shots = process.env.SHOTS
const browser = await launch()
const problems: string[] = []

async function open(name: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  await context.addInitScript(() => localStorage.setItem('tricks-muted', '1'))
  await paced(context)
  const page = await context.newPage()
  page.on('pageerror', (e) => problems.push(`${name} pageerror: ${e.message}`))
  return { context, page }
}
const check = (ok: boolean, what: string) => {
  if (!ok) problems.push(what)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
}
const shows = (locator: Locator) =>
  locator
    .first()
    .waitFor({ timeout: 3000 })
    .then(() => true)
    .catch(() => false)

const a = await open('A')
const b = await open('B')

// A creates a Thunee game and sits: the lobby's Pace panel starts together, without time limits.
await a.page.goto(`${base}/thunee`)
await a.page.getByRole('button', { name: 'Create game' }).click()
await a.page.getByPlaceholder('Name').fill('Asha')
await a.page.getByRole('button', { name: 'Sit here' }).first().click()
const pace = a.page.locator('section', { has: a.page.getByRole('heading', { name: 'Pace' }) })
await pace.getByRole('button', { name: 'Together' }).waitFor()
check((await pace.getByRole('button', { name: 'Together' }).getAttribute('aria-pressed')) === 'true', 'a new game is played together')
check(await shows(pace.getByText('Everyone at the table at once.')), 'the chosen pace says what it means')
const limits = pace.getByRole('switch')
check((await limits.getAttribute('aria-checked')) === 'false', 'time limits start off')
await limits.click()
check(await shows(pace.getByRole('spinbutton', { name: 'Time to call', exact: true })), 'turning on time limits shows the seconds to call')
check(await shows(pace.getByRole('spinbutton', { name: 'Time to call Thunee' })), 'and the seconds to call Thunee')
await pace.getByRole('button', { name: 'Time to call: more' }).click()

// B joins and reads the host's choice without controls.
const code = a.page.url().split('/').pop()!
await b.page.goto(`${base}/thunee/${code}`)
await b.page.getByPlaceholder('Name').fill('Bheki')
await b.page.getByRole('button', { name: 'Sit here' }).first().click()
const theirs = b.page.locator('section', { has: b.page.getByRole('heading', { name: 'Pace' }) })
check(await shows(theirs.getByText('Time to call: 11 seconds')), 'a guest sees the time limits the host set')
check((await theirs.getByRole('button').count()) === 0, 'a guest has no pace controls')

// A plays over days: B is told who changed it, and time limits are not offered.
await pace.getByRole('button', { name: 'Over days' }).click()
check(await shows(b.page.getByText('Asha set the pace to over days')), 'a pace change tells everyone who made it')
check(await shows(theirs.getByText(/The computer plays for anyone who leaves a turn waiting for two days/)), 'the guest reads what over days means')
check(await shows(pace.getByText('No time limits over days.')), 'no time limits over days')
check(!(await a.page.getByText(/, away/).isVisible()), 'nobody is marked away over days')
if (shots) await a.page.screenshot({ path: `${shots}/pace-lobby.png`, fullPage: true })

// The host starts and changes the pace back from the menu during play.
await addComputers(a.page, 2)
await a.page.getByRole('button', { name: 'Start game' }).click()
await a.page.getByRole('button', { name: 'Open menu' }).click()
const menuPace = a.page.getByRole('dialog').locator('section', { has: a.page.getByRole('heading', { name: 'Pace' }) })
await menuPace.getByRole('button', { name: 'Together' }).click()
check(await shows(b.page.getByText('Asha set the pace to together')), 'the host changes the pace during play')
if (shots) await a.page.screenshot({ path: `${shots}/pace-menu.png`, fullPage: true })

// The next game A creates starts on the pace A last chose.
await a.page.goto(`${base}/thunee`)
await a.page.getByRole('button', { name: 'Create game' }).click()
await a.page.getByRole('button', { name: 'Sit here' }).first().click()
const next = a.page.locator('section', { has: a.page.getByRole('heading', { name: 'Pace' }) })
await next.getByRole('button', { name: 'Together' }).waitFor()
await a.page.waitForTimeout(500)
check((await next.getByRole('switch').getAttribute('aria-checked')) === 'true', 'the next game starts with the host’s last time limits')

await browser.close()
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n${problems.join('\n')}`)
  process.exit(1)
}
console.log('\nPace checks passed.')
