/**
 * Spades at phone size, through the real table. A room for four in two browsers, partners with two computers on
 * the Jokers preset: both call in turn, both see the same trick, and both reach the round's result. A room for
 * three with two computers: seventeen cards in two tiers, the opening lead forced to the lowest club, and the
 * round played to its result. A room for two with one computer: the stock is drawn from, card by card, into
 * thirteen each. Then practice for four, with the coach's hint. Also checks that the home loads no other game.
 * Needs `pnpm dev`. Usage: pnpm tsx scripts/e2e-spades.ts [shots-dir]
 */
import type { Browser, Page } from 'playwright-core'
import { launch, paced } from './browser'
import { TOPICS } from '../src/games/spades/coach/topics'
import { addComputers } from './lobby'

const shots = process.argv[2] ?? '/tmp/shots'
const base = process.env.APP_URL ?? 'http://localhost:5173'
const browser: Browser = await launch()
const problems: string[] = []

async function open(name: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' })
  await context.addInitScript(() => localStorage.setItem('tricks-muted', '1'))
  await paced(context)
  const page = await context.newPage()
  page.on('pageerror', (e) => problems.push(`${name} pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && problems.push(`${name} console: ${m.text()}`))
  return page
}
const check = (ok: boolean, what: string) => {
  if (!ok) problems.push(what)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
}
const shot = (page: Page, name: string) => page.screenshot({ path: `${shots}/spades-${name}.png` })
const seen = (page: Page, text: string | RegExp, timeout = 5000) => page.getByText(text).first().waitFor({ timeout }).then(() => true, () => false)
const button = (page: Page, name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' }).first()
const visible = (page: Page, name: string | RegExp) => button(page, name).isVisible().catch(() => false)

// A long hand overlaps: each card shows only a strip at its left edge, which is where a finger lands.
const STRIP = { x: 8, y: 30 }
const handCards = (page: Page) => page.locator('.hand .playing-card')
const trickOf = (page: Page) => page.locator('.trick-area .playing-card').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')).sort())

/** Creates a room at /spades with the host seated, at a table of `size` ("Two", "Three", "Four, in pairs"). */
async function createRoom(page: Page, name: string, size: string): Promise<string> {
  await page.goto(`${base}/spades`)
  await button(page, 'Create game').click()
  await page.waitForURL(/\/spades\/[A-Z]{6}$/)
  await page.getByPlaceholder('Name').fill(name)
  await button(page, 'Sit here').click()
  await button(page, size).click()
  await page.waitForTimeout(300)
  return page.url().split('/').pop()!
}

/**
 * One move for whoever is at this page, if it is theirs: draw, call, give, play the first legal card, or move on.
 * Returns what it did.
 */
async function move(page: Page): Promise<string> {
  if (await visible(page, 'Close')) {
    await button(page, 'Close').click({ timeout: 2000 }).catch(() => {})
    return 'close'
  }
  if (await visible(page, 'Keep')) {
    await button(page, 'Keep').click({ timeout: 2000 }).catch(() => {})
    return 'draw'
  }
  if (await visible(page, 'See my cards')) {
    await button(page, 'See my cards').click({ timeout: 2000 }).catch(() => {})
    return 'look'
  }
  for (const n of [3, 2, 1]) {
    if (await visible(page, `Call ${n}`)) {
      await button(page, `Call ${n}`).click({ timeout: 2000 }).catch(() => {})
      return 'call'
    }
  }
  const card = page.locator('.hand .playing-card[data-playable="true"][data-dim="false"]').first()
  if (await card.isVisible().catch(() => false)) {
    await card.click({ position: STRIP, timeout: 2000 }).catch(() => {})
    return 'play'
  }
  if (await visible(page, 'Next round')) return 'result'
  await page.waitForTimeout(250)
  return 'wait'
}

/** Plays every page's moves until each shows the round's result. */
async function playRound(pages: Page[], guard = 800): Promise<boolean> {
  const done = new Set<Page>()
  for (let i = 0; i < guard && done.size < pages.length; i++) {
    for (const page of pages) if (!done.has(page) && (await move(page)) === 'result') done.add(page)
  }
  return done.size === pages.length
}

const a = await open('A')
const b = await open('B')

// The Tricks home lists Spades without loading any game's code; Spades loads without the others.
const requested: string[] = []
a.on('request', (r) => requested.push(new URL(r.url()).pathname))
await a.goto(base)
await a.getByRole('heading', { name: 'Tricks' }).waitFor()
await a.waitForTimeout(500)
check(!requested.some((p) => /\/src\/games\/|\/assets\/(thunee|hearts|spades)-/.test(p)), 'the Tricks home loads no game')
check(await seen(a, 'Two, three or four players'), 'the Tricks home says two, three or four play Spades')
await a.getByRole('link', { name: /^Spades/ }).click()
await a.getByRole('heading', { name: 'Spades' }).waitFor()
check(!requested.some((p) => /\/src\/games\/(thunee|hearts)\/|\/assets\/(thunee|hearts)-/.test(p)), 'Spades loads without the other games')
await shot(a, '0-home')

// ── Four, in pairs, on the Jokers preset ─────────────────────────────────

const code = await createRoom(a, 'Asha', 'Four, in pairs')
await b.goto(`${base}/spades`)
await b.getByPlaceholder('ABCDEF').fill(code)
await button(b, 'Join').click()
await b.getByPlaceholder('Name').fill('Bheki')
await button(b, 'Sit here').click()
await a.getByText('Bheki').first().waitFor()
await addComputers(a, 2)
check(await seen(a, 'Partners sit opposite'), 'the lobby pairs partners opposite')
await button(a, 'Jokers').click()
check(await seen(b, /^Jokers/), 'a guest sees the Jokers preset')
await shot(a, '1-lobby')
await button(a, 'Start game').click()
for (const [page, who] of [[a, 'A'], [b, 'B']] as const) {
  check(await seen(page, /to call|Your call/, 10_000), `${who} sees the calling begin`)
  check((await handCards(page).count()) === 13, `${who} holds thirteen cards`)
}
await shot(a, '2-calling')
// Play until a trick is on the table; both see the same cards.
for (let i = 0; i < 200 && (await trickOf(a)).length === 0; i++) for (const page of [a, b]) await move(page)
await a.waitForTimeout(800)
const onA = await trickOf(a)
const onB = await trickOf(b)
check(onA.length > 0 && JSON.stringify(onA) === JSON.stringify(onB), 'both players see the same trick')
await shot(a, '3-play')
check(await playRound([a, b]), 'both players reach the round’s result')
check((await a.locator('.result-table tbody').count()) === 2 && (await seen(a, /^Made$|^Set$/)), 'the result lines each side up, made or set')
await shot(a, '4-result')
await b.context().close()

// ── Three, each alone ────────────────────────────────────────────────────

await createRoom(a, 'Asha', 'Three')
await addComputers(a, 2)
await button(a, 'Start game').click()
check(await seen(a, /to call|Your call/, 10_000), 'three: calling begins')
check((await handCards(a).count()) === 17, 'three: seventeen cards each')
check((await a.locator('.hand-tiers .hand').count()) === 2, 'three: the hand is held in two tiers')
await shot(a, '5-three')
check(await playRound([a]), 'three: the round reaches its result')
await shot(a, '6-three-result')

// ── Two: drawing ─────────────────────────────────────────────────────────

await createRoom(a, 'Asha', 'Two')
await addComputers(a, 1)
await button(a, 'Start game').click()
check(await seen(a, /cards left/, 10_000), 'two: the stock is drawn from')
await shot(a, '7-two-draw')
for (let i = 0; i < 200 && !(await seen(a, /to call|Your call/, 100)); i++) await move(a)
check((await handCards(a).count()) === 13, 'two: each draws thirteen cards')

// ── Practice ─────────────────────────────────────────────────────────────

await a.goto(`${base}/spades/practice?players=4`)
check(await seen(a, /to call|Your call|Call how many/, 10_000), '/spades/practice opens a practice game at the calling')
check(await a.locator('.coach-strip').isVisible(), 'the practice table draws the coach')
// A new practice game opens with its lessons, the aim first; each is read with "Got it".
const gotIt = a.getByRole('button', { name: 'Got it' })
check(await seen(a, 'The aim', 5000), 'practice opens with the lesson on the aim')
for (let i = 0; i < 5 && (await gotIt.isVisible()); i++) await gotIt.click().catch(() => {})
await a.evaluate((ids) => localStorage.setItem('tricks-spades-coach-seen', JSON.stringify(ids)), Object.keys(TOPICS))
for (let i = 0; i < 40 && !(await visible(a, /^Call \d+$/)); i++) await a.waitForTimeout(250)
await button(a, 'Hint').click()
check(await seen(a, /Count your tricks|Call Nil|A hand for Nil|No high spades/, 5000), 'practice: the hint counts the hand’s tricks')
await shot(a, '8-practice')
// The hint's sheet covers the calling grid until it is closed.
await button(a, 'Close').click()
// A rule-breaking card's second tap carries the coach's warning. A click that cannot land waits its whole
// timeout, so the search is held to a deadline rather than a count alone.
let warned = false
const giveUp = Date.now() + 120_000
for (let i = 0; i < 600 && !warned && Date.now() < giveUp; i++) {
  if (await gotIt.isVisible()) await gotIt.click().catch(() => {})
  const proceed = button(a, 'Continue')
  if (await proceed.isVisible().catch(() => false)) await proceed.click().catch(() => {})
  for (const n of [3, 2, 1]) if (await visible(a, `Call ${n}`)) await button(a, `Call ${n}`).click().catch(() => {})
  const mine = (await a.locator('.hand .playing-card[data-playable="true"]').count()) > 0
  const dimmed = a.locator('.hand .playing-card[data-dim="true"]')
  if (mine && (await dimmed.count()) > 0) {
    const why = a.locator('.play-anyway-why')
    // A tap that misses (the hand moving under it) is tried again on the next turn.
    if (await dimmed.first().click({ position: STRIP, timeout: 2000 }).then(() => true, () => false)) {
      warned = await why.waitFor({ timeout: 2000 }).then(() => true, () => false)
      check(warned && /challenge you/.test((await why.textContent()) ?? ''), `the second tap shows the coach's warning (${(await why.textContent().catch(() => null)) ?? 'none'})`)
      await shot(a, '9-practice-warning')
    }
  } else if (mine) await a.locator('.hand .playing-card[data-dim="false"]').first().click({ position: STRIP, timeout: 1500 }).catch(() => {})
  await a.waitForTimeout(150)
}
check(warned, 'a practice turn offered a rule-breaking card')

await browser.close()
if (problems.length > 0) {
  console.log(`\n${problems.length} problem(s):\n${problems.join('\n')}`)
  process.exit(1)
}
console.log('spades e2e passed')
