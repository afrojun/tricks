/**
 * Section 3.2, a phone proxy: the same decisions timed in headless Chromium,
 * unthrottled and with DevTools CPU throttling (4x and 6x slower). Not a phone.
 *   ./node_modules/.bin/tsx src/spike/search/browser-speed.ts [--rounds 10] [--budgets 10,30,100] [--rates 1,4,6]
 */
import { chromium } from 'playwright-core'
import { build } from 'vite'
import type { bench } from './browserBench'
import { args, fmt, quantile } from './stats'

const opts = args()
const rounds = Number(opts.rounds ?? 10)
const budgets = (opts.budgets ?? '10,30,100').split(',').map(Number)
const rates = (opts.rates ?? '1,4,6').split(',').map(Number)
const policies = (opts.policies ?? 'random,heuristic').split(',')

const result = await build({
  configFile: false,
  logLevel: 'silent',
  build: {
    write: false,
    minify: true,
    lib: { entry: new URL('./browserBench.ts', import.meta.url).pathname, name: 'Spike', formats: ['iife'], fileName: () => 'bench.js' },
  },
})
const output = (Array.isArray(result) ? result[0] : result) as { output: { code?: string }[] }
const code = output.output.find((o) => o.code)!.code!

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' })
console.log(`Chromium ${browser.version()}, ${rounds} heuristic rounds of decisions\n`)
console.log('| CPU throttling | Policy | Worlds | Median ms | p95 ms |')
console.log('|---|---|---|---|---|')
for (const rate of rates) {
  const page = await browser.newPage()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate })
  await page.addScriptTag({ content: code })
  const r = (await page.evaluate(
    ([n, b, p]) => (globalThis as unknown as { Spike: { bench: typeof bench } }).Spike.bench(n, b, p),
    [rounds, budgets, policies] as [number, number[], ('random' | 'heuristic')[]],
  )) as ReturnType<typeof bench>
  for (const row of r.out) console.log(`| ${rate}x | ${row.policy} | ${row.worlds} | ${fmt(quantile(row.ms, 0.5), 1)} | ${fmt(quantile(row.ms, 0.95), 1)} |`)
  await page.close()
}
await browser.close()
