/**
 * Plays every drill of every game in a browser at phone size, from the list on the game's home, by
 * always taking the coach's hint, until the drill says "Well played". Then "Next drill" leads on.
 * Needs only `pnpm dev`. Usage: pnpm tsx scripts/e2e-drills.ts [shots-dir]
 */
import { launch, paced } from './browser'

const shots = process.argv[2] ?? '/tmp/shots'
const base = process.env.APP_URL ?? 'http://localhost:5173'

const browser = await launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' })
await context.addInitScript(() => localStorage.setItem('tricks-muted', '1'))
await paced(context)
const page = await context.newPage()
const problems: string[] = []
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`))
const button = (name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' }).first()
const showing = (name: string | RegExp) => button(name).isVisible()
const shot = (name: string) => page.screenshot({ path: `${shots}/drill-${name}.png` })

/** Plays the drill on screen by its hints until its verdict; false if none came. */
async function playThrough(game: string, id: string): Promise<boolean> {
  await page.getByRole('dialog').waitFor()
  await shot(`${game}-${id}-1-brief`)
  await button('Start').click()
  let hinted = false
  const started = Date.now()
  while (Date.now() - started < 180_000) {
    const verdict = page.getByRole('dialog', { name: /Well played|Not quite/ })
    if (await verdict.isVisible()) {
      await shot(`${game}-${id}-3-verdict`)
      if (!(await page.getByRole('dialog', { name: 'Well played' }).isVisible())) problems.push(`${game} ${id}: missed by taking the hints`)
      return true
    }
    // A hint first: a pause can hold the drill's decision.
    if (!(await showing('Hint')) && (await showing('Continue'))) await button('Continue').click({ timeout: 1500 }).catch(() => {})
    else if (await showing('Hint')) {
      if (!(await button('Hint').click({ timeout: 1500 }).then(() => true, () => false))) continue
      const hint = page.getByRole('dialog', { name: 'Hint' })
      if (!(await hint.waitFor({ timeout: 1500 }).then(() => true, () => false))) continue
      if (!hinted) await shot(`${game}-${id}-2-hint`)
      hinted = true
      await hint.locator('.btn-primary').click()
    }
    await page.waitForTimeout(150)
  }
  await shot(`${game}-${id}-stuck`)
  problems.push(`${game} ${id}: no verdict; buttons: ${(await page.getByRole('button').allTextContents()).join(' | ')}`)
  return false
}

for (const game of ['thunee', 'hearts', 'spades']) {
  await page.goto(`${base}/${game}`)
  await button('Drills…').click()
  const list = page.getByRole('dialog', { name: 'Drills' })
  await shot(`${game}-0-list`)
  const titles = await list.locator('li button span.grid > span:first-child').allTextContents()
  if (titles.length === 0) problems.push(`${game}: no drills listed`)
  await list.getByRole('button').nth(1).click()
  await page.waitForURL(new RegExp(`/${game}/practice\\?drill=`))
  for (let i = 0; i < titles.length; i++) {
    const id = new URL(page.url()).searchParams.get('drill')!
    // A reload starts the same drill again.
    if (i === 0) {
      await page.reload()
      if (new URL(page.url()).searchParams.get('drill') !== id) problems.push(`${game}: a reload left the drill`)
    }
    if (!(await playThrough(game, id))) {
      await browser.close()
      console.error(problems.join('\n'))
      process.exit(1)
    }
    if (i < titles.length - 1) {
      await button('Next drill').click()
      await page.waitForURL((url) => url.searchParams.get('drill') !== id)
    }
  }
  await button('All drills').click()
  await page.getByRole('dialog', { name: 'Drills' }).waitFor()
  const ticks = await page.getByLabel('Passed').count()
  if (ticks !== titles.length) problems.push(`${game}: ${ticks} of ${titles.length} drills ticked`)
  await shot(`${game}-4-list-passed`)
}

await browser.close()
if (problems.length > 0) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log('drills e2e passed')
