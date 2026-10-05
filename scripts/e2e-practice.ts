/**
 * Plays one practice round in a browser at phone size by always taking the coach's hint, through to
 * the coach's review. Needs only `pnpm dev`. Usage: pnpm tsx scripts/e2e-practice.ts [theme] [shots-dir]
 */
import { chromium } from 'playwright-core'

const theme = process.argv[2] ?? 'retro'
const shots = process.argv[3] ?? '/tmp/shots'
const base = process.env.APP_URL ?? 'http://localhost:5173'

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' })
await context.addInitScript((t) => {
  localStorage.setItem('thunee-theme', t)
  localStorage.setItem('thunee-muted', '1')
}, theme)
const page = await context.newPage()
const problems: string[] = []
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`))
const seen = new Set<string>()
const shot = async (name: string) => {
  if (seen.has(name)) return
  seen.add(name)
  await page.screenshot({ path: `${shots}/practice-${theme}-${name}.png` })
}
const button = (name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' }).first()
const showing = (name: string | RegExp) => button(name).isVisible()

await page.goto(base)
await shot('1-home')
await button('Practice with four').click()

let hints = 0
const started = Date.now()
while (Date.now() - started < 4 * 60_000) {
  if (await page.getByRole('heading', { name: 'Coach’s review' }).isVisible()) break
  if (await showing('Got it')) {
    await shot('2-topic')
    await button('Got it').click()
  } else if (await showing('Do it anyway')) {
    await shot('6-warning')
    await button('Do it anyway').click()
  } else if (await showing('Continue')) {
    await shot('5-trick-pause')
    await button('Continue').click()
  } else if (await showing('Hint')) {
    await shot(hints === 0 ? '3-decision' : `3-decision-${hints}`)
    await button('Hint').click()
    const hint = page.getByRole('dialog', { name: 'Hint' })
    // A topic introduction may arrive first; the loop deals with it and comes back.
    if (!(await hint.waitFor({ timeout: 1500 }).then(() => true, () => false))) continue
    if (hints < 3) await shot(`4-hint-${hints}`)
    hints++
    // The hint sheet's main button carries out the suggestion.
    await hint.locator('.btn-primary').click()
  }
  await page.waitForTimeout(150)
}

if (!(await page.getByRole('heading', { name: 'Coach’s review' }).isVisible())) problems.push('never reached the coach’s review')
else {
  // The round result introduces balls the first time.
  if (await showing('Got it')) await button('Got it').click()
  await page.getByRole('heading', { name: 'Coach’s review' }).scrollIntoViewIfNeeded()
  await shot('7-review')
  if (await showing('See all hands')) {
    await button('See all hands').click()
    await shot('8-hands')
    await button('Close').click()
  }
  // A reload continues the same game.
  await page.reload()
  await page.getByRole('heading', { name: 'Coach’s review' }).waitFor({ timeout: 5000 }).catch(() => problems.push('reload lost the round result'))
}

await browser.close()
console.log(`hints taken: ${hints}; screenshots: ${[...seen].join(', ')}`)
if (problems.length > 0) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log('practice e2e passed')
