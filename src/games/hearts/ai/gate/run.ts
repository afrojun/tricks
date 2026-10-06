/**
 * The search player's gate for Hearts (section 6 of the search-player spec), seeded, in one command:
 *
 *   ./node_modules/.bin/tsx src/games/hearts/ai/gate/run.ts [part ...]
 *
 * Parts: strength, random, self, cheating, determinism, speed, browser; all of them when none is named. A short
 * run unless GATE=full. GATE_WORLDS (a list, such as 10,20,30), GATE_DEALS, GATE_ROUNDS and GATE_THREADS change
 * the sizes, and GATE_SEARCHES=pass or play searches only that part. The gate is bundled with Vite, as the app
 * is, and timed in Node and in headless Chromium (`/usr/bin/chromium`, or CHROMIUM). A full run, or one given
 * its sizes, writes its results, raw timings included, to `results/`; the short default only prints them.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { loadavg, tmpdir } from 'node:os'
import { relative } from 'node:path'
import { Worker } from 'node:worker_threads'
import { chromium } from 'playwright-core'
import { build } from 'vite'
import type * as Bench from './bench'
import type { CheatRound, Replay, SelfDeal, StrengthDeal } from './measure'
import { interval, quantile, show } from './play'

const FULL = process.env.GATE === 'full'
const parts = process.argv.slice(2)
const wanted = (part: string) => parts.length === 0 || parts.includes(part)
const size = (name: string, short: number, full: number) => Number(process.env[name] ?? (FULL ? full : short))
const WORLDS = (process.env.GATE_WORLDS ?? '30').split(',').map(Number)
const SPEED_WORLDS = (process.env.GATE_WORLDS ?? '10,20,30').split(',').map(Number)
const THREADS = Number(process.env.GATE_THREADS ?? 6)
/** What the search player decides in the strength runs: both, or only the pass or the play (a diagnostic). */
const SEARCHES = (process.env.GATE_SEARCHES ?? 'both') as 'both' | 'pass' | 'play'
const named = SEARCHES === 'both' ? '' : `-${SEARCHES}`
const RESULTS = new URL('./results/', import.meta.url)
mkdirSync(RESULTS, { recursive: true })

const load = () => loadavg().map((l) => l.toFixed(1)).join(' ')
/** The command that reruns this, with every setting it was given. */
const command = [
  ...Object.entries(process.env)
    .filter(([key]) => key.startsWith('GATE'))
    .sort()
    .map(([key, value]) => `${key}=${value}`),
  './node_modules/.bin/tsx',
  relative(process.cwd(), process.argv[1]),
  ...parts,
].join(' ')
const stamp = () => ({ date: new Date().toISOString(), full: FULL, load: load(), command })
/** A full run, or one given its sizes, is saved; the short default only prints, so it never overwrites a full result. */
const SAVING = FULL || Object.keys(process.env).some((key) => key.startsWith('GATE_'))
const save = (name: string, data: object) => SAVING && writeFileSync(new URL(name, RESULTS), `${JSON.stringify({ ...stamp(), ...data })}\n`)
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

// ── The bundle ───────────────────────────────────────────────────────────

async function bundle(format: 'es' | 'iife'): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: { write: false, minify: true, lib: { entry: new URL('./bench.ts', import.meta.url).pathname, name: 'Gate', formats: [format], fileName: () => `gate.${format}.js` } },
  })
  const output = (Array.isArray(result) ? result[0] : result) as { output: { code?: string }[] }
  return output.output.find((o) => o.code)!.code!
}

const file = `${tmpdir()}/tricks-gate-${process.pid}.mjs`
writeFileSync(file, await bundle('es'))
const workerFile = `${tmpdir()}/tricks-gate-worker-${process.pid}.mjs`
writeFileSync(
  workerFile,
  `import { parentPort, workerData } from 'node:worker_threads'
const gate = await import(workerData.file)
for (const args of workerData.jobs) parentPort.postMessage(gate[workerData.fn](...args))
`,
)
const gate: typeof Bench = await import(file)

/** Runs `fn` on every job across worker threads, reporting progress now and then. */
async function shared<T>(fn: keyof typeof Bench, jobs: unknown[][], label: string): Promise<T[]> {
  const results: T[] = []
  const started = Date.now()
  await Promise.all(
    Array.from({ length: THREADS }, (_, i) => {
      const mine = jobs.filter((_, j) => j % THREADS === i)
      if (mine.length === 0) return Promise.resolve()
      return new Promise<void>((resolve, reject) => {
        const worker = new Worker(workerFile, { workerData: { file, fn, jobs: mine } })
        worker.on('message', (result: T) => {
          results.push(result)
          if (results.length % Math.max(1, Math.round(jobs.length / 10)) === 0 || results.length === jobs.length) {
            console.log(`  ${label}: ${results.length}/${jobs.length} in ${((Date.now() - started) / 1000).toFixed(0)} s, load ${load()}`)
          }
        })
        worker.on('error', reject)
        worker.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`a worker exited with ${code}`))))
      })
    }),
  )
  return results
}

// ── Strength ─────────────────────────────────────────────────────────────

async function strength(against: 'written' | 'random', deals: number, worlds: number) {
  const rows = await shared<StrengthDeal>(
    'strengthDeal',
    Array.from({ length: deals }, (_, i) => [i + 1, worlds, against, SEARCHES]),
    `strength against ${against}, ${worlds} worlds`,
  )
  rows.sort((a, b) => a.deal - b.deal)
  const byDeal = rows.map((r) => mean(r.differences))
  const difference = interval(byDeal)
  const byDirection = ['left', 'right', 'across', 'none'].map((d, i) => [d, show(interval(rows.map((r) => mean(r.differences.slice(i * 4, i * 4 + 4)))))])
  const searched = rows.reduce((a, r) => a + r.searched, 0)
  const agreed = rows.reduce((a, r) => a + r.agreed, 0)
  const summary = {
    deals,
    worlds,
    against,
    searches: SEARCHES,
    searchPoints: show(interval(rows.map((r) => mean(r.search)))),
    baselinePoints: show(interval(rows.map((r) => mean(r.baseline)))),
    difference: show(difference),
    passes: difference.mean + difference.half < 0,
    byDirection: Object.fromEntries(byDirection),
    sameAsHandWritten: `${agreed} of ${searched} searched decisions (${((100 * agreed) / searched).toFixed(1)}%)`,
  }
  console.log(`strength against ${against}, ${deals} deals x 4 directions x 4 seats, ${worlds} worlds:`, summary)
  save(`strength-${against}-w${worlds}${named}.json`, {
    summary,
    perDeal: rows.map((r) => [r.deal, +mean(r.differences).toFixed(4), +mean(r.search).toFixed(4), +mean(r.baseline).toFixed(4)]),
  })
}

async function self(deals: number, worlds: number) {
  const rows = await shared<SelfDeal>('selfDeal', Array.from({ length: deals }, (_, i) => [i + 1, worlds]), `four search players, ${worlds} worlds`)
  const rounds = rows.length * 4
  const moons = rows.reduce((a, r) => a + r.moons, 0)
  const total = rows.reduce((a, r) => a + r.points.flat().reduce((x, y) => x + y, 0), 0)
  const perSeat = total / (rounds * 4)
  // 26 points a round, a quarter to each seat; a moon (others add) puts 78 on the table instead.
  const expected = 6.5 + (13 * moons) / rounds
  const summary = {
    deals,
    worlds,
    rounds,
    moons,
    perSeatPerRound: +perSeat.toFixed(4),
    sixAndAHalfPlusMoons: +expected.toFixed(4),
    holds: Math.abs(perSeat - expected) < 1e-9,
    bySeat: [0, 1, 2, 3].map((s) => show(interval(rows.map((r) => mean(r.points.map((p) => p[s])))))),
  }
  console.log('four search players:', summary)
  save(`self-w${worlds}.json`, { summary })
}

// ── Cheating and determinism ─────────────────────────────────────────────

async function cheating(rounds: number, worlds: number) {
  const rows = await shared<CheatRound>('cheatRound', Array.from({ length: rounds }, (_, i) => [20_001 + i, worlds]), `cheating, ${worlds} worlds`)
  rows.sort((a, b) => a.seed - b.seed)
  const errors = rows.filter((r) => r.error !== null)
  const ok = rows.filter((r) => r.error === null)
  const searched = ok.reduce((a, r) => a + r.searched, 0)
  const summary = {
    rounds,
    worlds,
    failures: errors.length,
    firstFailure: errors[0]?.error ?? null,
    worldsChecked: ok.reduce((a, r) => a + r.worlds, 0),
    searchPoints: show(interval(ok.map((r) => r.search))),
    handWrittenPoints: show(interval(ok.map((r) => r.written))),
    difference: show(interval(ok.map((r) => r.search - r.written))),
    cheatsPerRound: { search: +mean(ok.map((r) => r.cheats)).toFixed(3), handWritten: +mean(ok.map((r) => r.cheatsWritten)).toFixed(3) },
    decisionsDroppingEvidence: `${ok.reduce((a, r) => a + r.dropping, 0)} of ${searched}`,
    piecesDropped: ok.reduce((a, r) => a + r.dropped, 0),
  }
  console.log('cheating, Sly at seat 1 and Wild at seat 3, nobody accusing:', summary)
  save(`cheating-w${worlds}.json`, { summary, perRound: ok.map((r) => [r.seed, r.search, r.written, r.cheats]) })
}

async function determinism(rounds: number, worlds: number) {
  const rows = await shared<Replay>('replay', Array.from({ length: rounds }, (_, i) => [i + 1, worlds]), `replays, ${worlds} worlds`)
  const summary = { rounds, worlds, decisions: rows.reduce((a, r) => a + r.decisions, 0), differed: rows.reduce((a, r) => a + r.differed, 0) }
  console.log('determinism, every decision asked again from its reloaded save:', summary)
  save(`determinism-w${worlds}.json`, { summary })
}

// ── Speed ────────────────────────────────────────────────────────────────

type Timing = Bench.Timing

/** Median and p95 of the decisions that searched, overall and by kind; every decision; and each round's total. */
function speedSummary(timings: Timing[], key: 'ms' | 'cpu') {
  const searched = timings.filter((t) => t.candidates > 1)
  const of = (ts: Timing[]) => ({ n: ts.length, median: +quantile(ts.map((t) => t[key]!), 0.5).toFixed(1), p95: +quantile(ts.map((t) => t[key]!), 0.95).toFixed(1), max: +Math.max(...ts.map((t) => t[key]!)).toFixed(1) })
  const rounds = [...new Set(timings.map((t) => t.round))].map((r) => timings.filter((t) => t.round === r).reduce((a, t) => a + t[key]!, 0))
  return {
    searched: of(searched),
    pass: of(searched.filter((t) => t.kind === 'pass')),
    firstTrick: of(searched.filter((t) => t.kind === 'first')),
    play: of(searched.filter((t) => t.kind === 'play')),
    everyDecision: of(timings),
    roundOfFour: { median: +quantile(rounds, 0.5).toFixed(0), max: +Math.max(...rounds).toFixed(0) },
  }
}

/** Raw timings, small: one string per run, `kind candidates ms[ cpu]` per decision, rounds apart. */
const raw = (timings: Timing[]) => timings.map((t) => `${t.round} ${t.kind[0]} ${t.candidates} ${t.ms.toFixed(2)}${t.cpu === null ? '' : ` ${t.cpu.toFixed(2)}`}`).join(';')

async function speedNode(rounds: number) {
  const cpu = () => {
    const used = process.cpuUsage()
    return (used.user + used.system) / 1000
  }
  const out: Record<string, object> = {}
  const raws: Record<string, string> = {}
  for (const worlds of SPEED_WORLDS) {
    const timings = gate.speed(rounds, worlds, () => performance.now(), cpu)
    out[`w${worlds}`] = { wall: speedSummary(timings, 'ms'), cpu: speedSummary(timings, 'cpu') }
    raws[`w${worlds}`] = raw(timings)
    console.log(`speed in Node, ${rounds} rounds, ${worlds} worlds, load ${load()}:`, JSON.stringify(out[`w${worlds}`]))
  }
  save('speed-node.json', { rounds, summary: out, raw: raws })
}

async function speedBrowser(rounds: number, rates: number[]) {
  const code = await bundle('iife')
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' })
  const out: Record<string, object> = {}
  const raws: Record<string, string> = {}
  for (const rate of rates) {
    for (const worlds of SPEED_WORLDS) {
      const page = await browser.newPage()
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate })
      await page.addScriptTag({ content: code })
      const timings = (await page.evaluate(
        ([r, w]) => (globalThis as unknown as { Gate: typeof Bench }).Gate.speed(r, w, () => performance.now()),
        [rounds, worlds] as [number, number],
      )) as Timing[]
      await page.close()
      out[`x${rate}-w${worlds}`] = speedSummary(timings, 'ms')
      raws[`x${rate}-w${worlds}`] = raw(timings)
      console.log(`speed in Chromium ${browser.version()}, ${rate}x throttled, ${rounds} rounds, ${worlds} worlds, load ${load()}:`, JSON.stringify(out[`x${rate}-w${worlds}`]))
    }
  }
  const version = browser.version()
  await browser.close()
  save('speed-chromium.json', { chromium: version, rounds, summary: out, raw: raws })
}

// ── The run ──────────────────────────────────────────────────────────────

console.log(`The Hearts gate, ${FULL ? 'full' : 'short'} run, load ${load()}`)
for (const worlds of WORLDS) {
  if (wanted('strength')) await strength('written', size('GATE_DEALS', 4, 400), worlds)
  if (wanted('random')) await strength('random', size('GATE_DEALS', 2, 100), worlds)
  if (wanted('self')) await self(size('GATE_DEALS', 2, 50), worlds)
  if (wanted('cheating')) await cheating(size('GATE_ROUNDS', 10, 500), worlds)
  if (wanted('determinism')) await determinism(size('GATE_ROUNDS', 1, 5), worlds)
}
if (wanted('speed')) await speedNode(size('GATE_ROUNDS', 2, 20))
if (wanted('browser')) await speedBrowser(size('GATE_ROUNDS', 1, 20), [1, 4])
