/**
 * Hearts in two browsers at phone size, through the real table: create a room at /hearts, join
 * it from a second browser, fill the other seats with computers and start. Both players pass
 * three cards and play; both see the same trick; the host accuses a computer, both see the round
 * result, and the second round passes to the right. There the host plays a rule-breaking card
 * after a second tap. Then the second player goes away, the host lets the computer play for
 * them, and they take the seat back on return. Next a whole game in a new room, one human and
 * three computers with the end score typed and stepped down to 25: every round played through
 * its thirteen tricks to the result, each result's points added up, on to game over and the
 * host's rematch. Also checks that the home loads no game's code, and Hearts' practice: the coach,
 * a new practice game dropping the old game's picks, and the coach's warning on a second tap.
 * Needs `pnpm dev`. Usage: pnpm tsx scripts/e2e-hearts.ts [shots-dir]
 */
import { type Browser, type Page, chromium } from 'playwright-core'

const shots = process.argv[2] ?? '/tmp/shots'
const base = process.env.APP_URL ?? 'http://localhost:5173'
const browser: Browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' })
const problems: string[] = []

async function open(name: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  await context.addInitScript(() => localStorage.setItem('tricks-muted', '1'))
  const page = await context.newPage()
  watch(page, name)
  return page
}
function watch(page: Page, name: string) {
  page.on('pageerror', (e) => problems.push(`${name} pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && problems.push(`${name} console: ${m.text()}`))
}
const check = (ok: boolean, what: string) => {
  if (!ok) problems.push(what)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
}
const shot = (page: Page, name: string) => page.screenshot({ path: `${shots}/hearts-${name}.png` })
const seen = (page: Page, text: string | RegExp, timeout = 5000) => page.getByText(text).first().waitFor({ timeout }).then(() => true, () => false)

// Thirteen cards overlap: each shows only a strip at its left edge, which is where a finger lands.
const STRIP = { x: 8, y: 30 }
const handCards = (page: Page) => page.locator('.hand .playing-card')
const handSize = (page: Page) => handCards(page).count()
const trickOf = (page: Page) => page.locator('.trick-area .playing-card').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')).sort())
const myTurn = (page: Page) => page.getByText(/^Your turn/).isVisible()

const a = await open('A')
let b = await open('B')

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
const practised = await seen(a, /^Practice$/, 1000)
check(practised || (await seen(a, 'are coming to Hearts')), `the home ${practised ? 'offers practice' : 'says practice is coming'}`)
await shot(a, '1-home')
check(await a.getByRole('link', { name: 'Tricks', exact: true }).isVisible(), 'the Hearts home links to Tricks')
check(await a.getByRole('link', { name: /^Thunee/ }).isVisible(), 'the Hearts home links to Thunee')
await a.getByRole('link', { name: 'Tricks', exact: true }).click()
await a.getByRole('heading', { name: 'Tricks' }).waitFor()
check(new URL(a.url()).pathname === '/', 'the Tricks link leads to /')
await a.getByRole('link', { name: /^Hearts/ }).click()
await a.getByRole('heading', { name: 'Hearts' }).waitFor()

// A creates the room and sits; B joins by its code.
await a.getByRole('button', { name: 'Create game' }).click()
await a.waitForURL(/\/hearts\/[A-Z]{6}$/)
const code = a.url().split('/').pop()!
await a.getByPlaceholder('Name').fill('Asha')
await a.getByRole('button', { name: 'Sit here' }).first().click()
await a.getByText('Waiting for 3 more').waitFor()
await b.goto(`${base}/hearts`)
await b.getByPlaceholder('ABCDEF').fill(code)
await b.getByRole('button', { name: 'Join', exact: true }).click()
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

// ── Round 1: the pass ────────────────────────────────────────────────────

for (const [page, who] of [[a, 'A'], [b, 'B']] as const) {
  check(await seen(page, 'Passing left', 10_000), `${who} sees the pass to the left`)
  check((await handSize(page)) === 13, `${who} holds thirteen cards in one row`)
  check(await seen(page, 'Ends at 101'), `${who} plays to the end score of 101`)
}
const passLeft = a.getByRole('button', { name: 'Pass left' })
check(await passLeft.isDisabled(), 'Pass left waits for three cards')
/** Picks the first three cards of the hand, a tap each. */
async function pickThree(page: Page) {
  for (const i of [0, 1, 2]) await handCards(page).nth(i).click({ position: STRIP })
}
await pickThree(a)
check((await a.locator('.hand .playing-card.picked').count()) === 3, 'three taps pick three cards')
await handCards(a).nth(3).click({ position: STRIP })
check((await a.locator('.hand .playing-card.picked').count()) === 3, 'a fourth card is not picked')
await handCards(a).nth(2).click({ position: STRIP })
await handCards(a).nth(2).click({ position: STRIP })
check((await a.locator('.hand .playing-card.picked').count()) === 3 && (await passLeft.isEnabled()), 'a picked card can be put back and picked again')
await shot(a, '3-pass')
await passLeft.click()
check(await seen(a, /Waiting for .*Bheki/), 'A sees whom the table is waiting on')
check(await seen(a, /ready for/), 'A sees the three cards are ready to go')
await pickThree(b)
await b.getByRole('button', { name: 'Pass left' }).click()

for (const [page, who] of [[a, 'A'], [b, 'B']] as const) {
  check(await seen(page, /Passed left/, 10_000), `${who} sees the cards change hands`)
  await page.waitForTimeout(800)
  check((await page.locator('.hand .card-tag').count()) === 3, `${who}'s three new cards are marked`)
}

// ── Round 1: play, the same trick in both browsers, and an accusation ─────

/** Plays the first card the rules allow, at the player's turn. Returns whether one was played: the turn has passed on. */
async function playLegal(page: Page) {
  if (!(await myTurn(page))) return false
  await page.locator('.hand .playing-card[data-dim="false"]').first().click({ position: STRIP, timeout: 1500 }).catch(() => {})
  return page.getByText(/^Your turn/).waitFor({ state: 'hidden', timeout: 1500 }).then(() => true, () => false)
}

let played = 0
let sameTrick = false
let accused = false
let trickShot = false
for (let i = 0; i < 600 && !accused; i++) {
  // Both see the same trick: while A is to play nothing moves, so B's paced playback catches up.
  if (!sameTrick && (await myTurn(a)) && (await trickOf(a)).length >= 2) {
    const want = JSON.stringify(await trickOf(a))
    for (let t = 0; t < 20 && JSON.stringify(await trickOf(b)) !== want; t++) await b.waitForTimeout(250)
    sameTrick = JSON.stringify(await trickOf(b)) === want
    check(sameTrick, `both browsers show the same trick (${want})`)
    if (!trickShot) {
      trickShot = true
      await shot(a, '4-trick')
    }
  }
  if (await playLegal(a)) played++
  await playLegal(b)
  const challenge = a.getByRole('button', { name: 'Challenge' })
  if (played >= 3 && sameTrick && (await challenge.isEnabled().catch(() => false))) {
    await challenge.click()
    await a.getByRole('dialog', { name: 'Challenge for 26 points' }).waitFor()
    await shot(a, '5-accuse')
    const accuse = a.getByRole('button', { name: /^Bot .* broke a rule$/ }).first()
    const target = (await accuse.textContent())!.replace(' broke a rule', '')
    await accuse.click()
    accused = true
    const moment = a.locator('.moment', { hasText: 'Challenge' })
    check(await moment.waitFor({ timeout: 3000 }).then(() => true, () => false), `A challenges ${target}, and the challenge takes the middle of the table`)
    check(await seen(a, `You accused ${target}, but ${target} played by the rules. You take 26; nobody else scores.`, 10_000), 'the round result names the accusation and its verdict')
  }
  await a.waitForTimeout(100)
}
check(played >= 3, `A played ${played} cards by tapping them`)
check(accused, 'A accused a player')

// ── The round result ─────────────────────────────────────────────────────

check(await seen(a, 'Round 1 is over', 10_000), 'A sees the round result')
check(await seen(b, `Asha accused`, 10_000), 'B sees the same verdict')
await a.waitForTimeout(2500) // the moments pass
const rows = await a.locator('tbody tr td:nth-child(2)').allTextContents()
check(JSON.stringify(rows) === JSON.stringify(['+26', '0', '0', '0']), `only the wrong accuser scores this round (${rows.join(', ')})`)
await shot(a, '6-round-result')
await a.getByRole('button', { name: 'Next round' }).click()

// ── Round 2: the pass to the right, and a card after a second tap ─────────

for (const [page, who] of [[a, 'A'], [b, 'B']] as const) {
  check(await seen(page, 'Passing right', 10_000), `${who} reaches the second round, passing right`)
}
check(await seen(a, 'Round 2'), 'the header counts the second round')
await pickThree(a)
await shot(a, '7-pass-right')
await a.getByRole('button', { name: 'Pass right' }).click()
await pickThree(b)
await b.getByRole('button', { name: 'Pass right' }).click()

let anyway = false
for (let i = 0; i < 600 && !anyway; i++) {
  // A rule-breaking card is dimmed; at the opening lead only the two of clubs may be played at all.
  const dimmed = a.locator('.hand .playing-card[data-dim="true"]')
  if ((await myTurn(a)) && !(await a.getByText(/two of clubs/).isVisible()) && (await dimmed.count()) > 0) {
    const before = await handSize(a)
    await dimmed.first().click({ position: STRIP })
    const confirm = a.getByRole('button', { name: /^Play .* anyway$/ })
    check((await confirm.isVisible()) && (await handSize(a)) === before, 'a rule-breaking card asks before it is played')
    await shot(a, '8-play-anyway')
    await confirm.click()
    // A played card leaves the hand once it has travelled to the trick.
    for (let t = 0; t < 20 && (await handSize(a)) === before; t++) await a.waitForTimeout(100)
    check(before - (await handSize(a)) === 1, 'the second tap plays that one card')
    anyway = true
  } else await playLegal(a)
  await playLegal(b)
  await a.waitForTimeout(100)
}
check(anyway, 'A played a card after a second tap')

// ── Away and back ────────────────────────────────────────────────────────

const bContext = b.context()
await b.close()
check(await seen(a, 'disconnected', 20_000), 'A sees B go away')
await a.getByRole('button', { name: 'Open menu' }).click()
const standIn = a.getByRole('button', { name: 'Computer plays for Bheki' })
check(await standIn.isVisible(), 'the menu offers the computer for a player who is away')
await standIn.click()
await a.getByRole('button', { name: 'Close' }).click()
check(await seen(a, 'computer playing'), 'the computer plays for B')
await shot(a, '9-stand-in')
b = await bContext.newPage()
watch(b, 'B again')
await b.goto(`${base}/hearts/${code}`)
check(await seen(b, 'Round 2', 10_000), 'B comes back to the table')
check(await a.getByText('computer playing').waitFor({ state: 'hidden', timeout: 10_000 }).then(() => true, () => false), 'B takes the seat back')

// ── A whole game: every round to its result, game over and a rematch ─────

// The rule changes A's browser sends to its room.
const ruleChanges: string[] = []
a.on('websocket', (ws) => ws.on('framesent', (f) => typeof f.payload === 'string' && f.payload.includes('"setRules"') && ruleChanges.push(f.payload)))
await a.goto(`${base}/hearts`)
await a.getByRole('button', { name: 'Create game' }).click()
await a.waitForURL(/\/hearts\/[A-Z]{6}$/)
check(a.url().split('/').pop() !== code, 'A opens a new room for a whole game')
await a.getByPlaceholder('Name').fill('Asha')
await a.getByRole('button', { name: 'Sit here' }).first().click()
for (let i = 0; i < 3; i++) {
  await a.getByRole('button', { name: 'Add computer' }).first().click()
  await a.getByRole('button', { name: /^Straight/ }).click()
}
// Typed and then stepped at once, before the room has answered: one change, from what was typed.
await a.getByRole('button', { name: 'Change rules' }).click()
const gameEnds = a.getByRole('spinbutton', { name: 'The game ends at' })
ruleChanges.length = 0 // sitting down sent the creator's choices from the home screen
await gameEnds.fill('50')
await a.getByRole('button', { name: 'Less The game ends at' }).click()
await a.waitForTimeout(500)
check((await gameEnds.inputValue()) === '25', `typing 50 then − sets the end score to 25 (${await gameEnds.inputValue()})`)
check(ruleChanges.length === 1 && ruleChanges[0].includes('"gameEndsAt":25'), `and sends one change (${ruleChanges.join(' ')})`)
await a.getByRole('button', { name: 'Close' }).click()
await a.getByRole('button', { name: 'Start game' }).click()
check(await seen(a, 'Ends at 25', 10_000), 'the whole game plays to 25')

/** Picks cards from the left of the hand until three are picked. */
async function pickToThree(page: Page) {
  const picked = page.locator('.hand .playing-card.picked')
  for (let i = 0; i < 13 && (await picked.count()) < 3; i++) {
    const card = handCards(page).nth(i)
    if (!((await card.getAttribute('class')) ?? '').includes('picked')) await card.click({ position: STRIP })
  }
}
const numberOf = (text: string) => Number(text.trim().replace('−', '-').replace('+', ''))
const roundOver = a.getByRole('heading', { name: / is over$/ })
// The game over has its own screen: the standings by total, and the last round's headline under them.
const gameOver = a.getByText('Game over', { exact: true })
const passButton = a.getByRole('button', { name: /^Pass (left|right|across)$/ })
/** Each player's total so far, by the name the table shows them by. */
let scores = new Map<string, number>()
const listed = (totals: Map<string, number>) => [...totals].map(([name, total]) => `${name} ${total}`).join(', ')
let rounds = 0
let mine = 0
let winner: string | null = null
const wholeGameEnds = Date.now() + 12 * 60_000
while (winner === null && Date.now() < wholeGameEnds) {
  const over = await gameOver.isVisible()
  if (over || (await roundOver.isVisible())) {
    rounds++
    const headline = (await (over ? a.getByText(/^Last round:/) : a.locator('section.panel > p').first()).textContent()) ?? ''
    // A round's table is name, this round, total; the game over's is place, name, total.
    const column = async (n: number) => (await a.locator(`tbody tr td:nth-child(${n})`).allTextContents()).map((text) => text.trim())
    const names = await column(over ? 2 : 1)
    const totals = (await column(3)).map(numberOf)
    // The game over shows only the totals: the last round's points are what each total rose by.
    const points = over ? names.map((name, i) => totals[i] - (scores.get(name) ?? 0)) : (await column(2)).map(numberOf)
    check(!/accused|caught/.test(headline), `round ${rounds} ended with its tricks, not an accusation (${headline})`)
    check(mine === 13, `A played all thirteen of their cards in round ${rounds} by tapping them (${mine})`)
    const total = points.reduce((s, p) => s + p, 0)
    // 26 points are taken every round; a moon gives the three others 26 each.
    check(total === 26 || total === 78, `round ${rounds}'s points add up (${points.join(', ')})`)
    if (!over) {
      check(
        names.every((name, i) => totals[i] === (scores.get(name) ?? 0) + points[i]),
        `round ${rounds}: each total is the last plus this round (${listed(scores)} + ${points.join(', ')} = ${totals.join(', ')})`,
      )
    }
    scores = new Map(names.map((name, i) => [name, totals[i]]))
    mine = 0
    if (rounds === 1) await shot(a, over ? 'whole-1-game-over' : 'whole-1-round-result')
    if (over) {
      const title = (await a.getByRole('heading', { name: /^You win$| wins$/ }).textContent())!.trim()
      winner = title === 'You win' ? 'You' : title.replace(/ wins$/, '')
      continue
    }
    await a.getByRole('button', { name: 'Next round' }).click()
    await roundOver.waitFor({ state: 'hidden', timeout: 10_000 })
  } else if (await passButton.isVisible()) {
    await pickToThree(a)
    await passButton.click({ timeout: 1500 }).catch(() => {})
  } else if (await playLegal(a)) mine++
  else await a.waitForTimeout(100)
}
const finals = [...scores.values()]
check(winner !== null, `the whole game ends, after ${rounds} rounds`)
check(Math.max(...finals) >= 25, `someone reached 25 (${listed(scores)})`)
check(winner !== null && scores.get(winner) === Math.min(...finals), `the winner, ${winner}, has the fewest points (${listed(scores)})`)
await shot(a, 'whole-2-game-over')
await a.getByRole('button', { name: 'Play again' }).click()
check(await seen(a, 'Passing left', 10_000), 'the host’s rematch starts a new game at the pass to the left')
check(await seen(a, 'Round 1'), 'the rematch starts at round 1')
check((await a.getByText('0 total', { exact: true }).count()) === 4, 'every score is back to 0')
await shot(a, 'whole-3-rematch')

// ── Practice ─────────────────────────────────────────────────────────────

await a.goto(`${base}/hearts/practice?players=4`)
if (practised) {
  check(await seen(a, 'Passing left', 10_000), '/hearts/practice opens a practice game at the pass')
  check(await a.locator('.coach-strip').isVisible(), 'the practice table draws the coach')
  await shot(a, '10-practice')

  // Cards picked in one practice game are not carried into the next.
  const picked = () => a.locator('.hand .playing-card.picked').count()
  await pickThree(a)
  check((await picked()) === 3, 'three cards are picked in practice')
  const labels = () => handCards(a).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')).join())
  const before = await labels()
  await a.getByRole('button', { name: 'Open menu' }).click()
  await a.getByRole('button', { name: 'New practice game' }).click()
  // The old hand leaves as the new one arrives: wait for thirteen new cards alone.
  for (let t = 0; t < 40 && ((await handSize(a)) !== 13 || (await labels()) === before); t++) await a.waitForTimeout(100)
  check((await picked()) === 0, 'a new practice game starts with nothing picked')
  await pickThree(a)
  check((await picked()) === 3, 'and three of its own cards can be picked')
  await a.getByRole('button', { name: 'Pass left' }).click()
  check(await seen(a, 'Passed left', 10_000), 'and passed')

  // A rule-breaking card's second tap carries the coach's warning. In practice the coach's line
  // replaces the hint, so the player's turn is when the hand can be played.
  let warned = false
  for (let i = 0; i < 600 && !warned; i++) {
    const proceed = a.getByRole('button', { name: 'Continue' })
    if (await proceed.isVisible()) await proceed.click().catch(() => {})
    const mine = (await a.locator('.hand .playing-card[data-playable="true"]').count()) > 0
    const dimmed = a.locator('.hand .playing-card[data-dim="true"]')
    // At the opening lead only the two of clubs may be played at all: no trick is complete and none is begun.
    const opening = (await a.getByRole('button', { name: 'Last trick' }).isDisabled()) && (await a.locator('.trick-area .playing-card').count()) === 0
    if (mine && !opening && (await dimmed.count()) > 0) {
      await dimmed.first().click({ position: STRIP })
      const why = a.locator('.play-anyway-why')
      warned = await why.waitFor({ timeout: 2000 }).then(() => true, () => false)
      check(warned && /accuse you/.test((await why.textContent()) ?? ''), `the second tap shows the coach's warning (${(await why.textContent().catch(() => null)) ?? 'none'})`)
      await shot(a, '11-practice-warning')
      await a.locator('.hand').click({ position: { x: 3, y: 3 } })
    } else if (mine) await a.locator('.hand .playing-card[data-dim="false"]').first().click({ position: STRIP, timeout: 1500 }).catch(() => {})
    await a.waitForTimeout(150)
  }
  check(warned, 'a practice turn offered a rule-breaking card')
} else {
  check(await seen(a, 'Practice is coming'), '/hearts/practice says practice is coming')
  await shot(a, '10-practice')
}

if (problems.length) console.log('PROBLEMS:\n' + problems.join('\n'))
await browser.close()
process.exit(problems.length === 0 ? 0 : 1)
