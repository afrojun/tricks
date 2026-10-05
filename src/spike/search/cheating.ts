/**
 * Section 3.3: Wild at seat 1 and Sly at seat 3 renege and bluff Jodhis; seats 0 and 2 never challenge.
 * The same deals are played with search at 0 and 2, and with the heuristic (Straight, not challenging) at 0 and 2.
 * Every world the search rebuilds is checked against the invariants and the view.
 *   ./node_modules/.bin/tsx src/spike/search/cheating.ts --a search:random:30 [--rounds 1000] [--first 20001] [--shards 6]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import type { Persona } from '../../engine'
import { type Player, type RoundRecord, heuristicPlayer, playRound, searchPlayer } from './harness'
import type { RolloutPolicy } from './search'
import { sampleStats } from './sample'
import { inChild, runShards } from './shards'
import { args, ci95, fmt } from './stats'

const PERSONAS: Persona[] = ['straight', 'wild', 'straight', 'sly']

interface Side {
  /** Balls the honest side and the cheats gained. */
  us: number
  them: number
  reason: string
  reneges: number
  bluffs: number
}

interface RoundOut {
  seed: number
  search: Side | { crash: string }
  heuristic: Side | { crash: string }
  searched: number
  /** Searched decisions where at least one constraint was dropped, and drops by kind. */
  withDrops: number
  drops: Record<string, number>
}

const opts = args()
const rounds = Number(opts.rounds ?? 1000)
const first = Number(opts.first ?? 20001)
const child = inChild()

function side(r: RoundRecord): Side {
  return { us: r.gained[0], them: r.gained[1], reason: r.summary.reason, reneges: r.reneges, bluffs: r.bluffs }
}

if (child) {
  const [, policy, worlds] = opts.a.split(':')
  const search = searchPlayer({ policy: policy as RolloutPolicy, worlds: Number(worlds), check: true }, opts.a)
  const cheat = heuristicPlayer(true)
  const straight = heuristicPlayer(false)
  const out: RoundOut[] = []
  for (let seed = first; seed < first + rounds; seed++) {
    if ((seed - first) % child.of !== child.shard) continue
    const row: RoundOut = { seed, search: { crash: '' }, heuristic: { crash: '' }, searched: 0, withDrops: 0, drops: {} }
    const run = (players: Player[]) => {
      try {
        return playRound(seed, players, PERSONAS)
      } catch (e) {
        return String((e as Error).stack ?? e)
      }
    }
    const s = run([search, cheat, search, cheat])
    const h = run([straight, cheat, straight, cheat])
    row.search = typeof s === 'string' ? { crash: s } : side(s)
    row.heuristic = typeof h === 'string' ? { crash: h } : side(h)
    if (typeof s !== 'string') {
      for (const d of s.decisions) {
        row.searched++
        if (d.searched.result.dropped.length > 0) row.withDrops++
        for (const x of d.searched.result.dropped) row.drops[x.kind] = (row.drops[x.kind] ?? 0) + 1
      }
    }
    out.push(row)
  }
  console.log(JSON.stringify({ rows: out, sampler: sampleStats }))
} else {
  const shards = Number(opts.shards ?? 6)
  const started = Date.now()
  const parts = await runShards<{ rows: RoundOut[]; sampler: typeof sampleStats }>(new URL(import.meta.url).pathname, process.argv.slice(2), shards)
  const rows = parts.flatMap((p) => p.rows).sort((a, b) => a.seed - b.seed)
  const crashes = rows.flatMap((r) => [r.search, r.heuristic].filter((x): x is { crash: string } => 'crash' in x).map((x) => `${r.seed}: ${x.crash.split('\n')[0]}`))
  const ok = rows.filter((r): r is RoundOut & { search: Side; heuristic: Side } => !('crash' in r.search) && !('crash' in r.heuristic))
  const net = (x: Side) => x.us - x.them
  const diff = ci95(ok.map((r) => net(r.search) - net(r.heuristic)))
  const per = (f: (r: (typeof ok)[number]) => number) => ok.reduce((a, r) => a + f(r), 0) / ok.length
  const searched = rows.reduce((a, r) => a + r.searched, 0)
  const withDrops = rows.reduce((a, r) => a + r.withDrops, 0)
  const drops: Record<string, number> = {}
  for (const r of rows) for (const [k, v] of Object.entries(r.drops)) drops[k] = (drops[k] ?? 0) + v
  const sampler = parts.reduce((a, p) => ({ worlds: a.worlds + p.sampler.worlds, fallbacks: a.fallbacks + p.sampler.fallbacks }), { worlds: 0, fallbacks: 0 })
  const reasons = (pick: (r: (typeof ok)[number]) => Side) => {
    const out: Record<string, number> = {}
    for (const r of ok) out[pick(r).reason] = (out[pick(r).reason] ?? 0) + 1
    return out
  }
  const summary = {
    a: opts.a,
    rounds: rows.length,
    seeds: `${first}-${first + rounds - 1}`,
    crashes: crashes.length,
    crashList: crashes.slice(0, 10),
    search: { us: per((r) => r.search.us), them: per((r) => r.search.them), reneges: per((r) => r.search.reneges), bluffs: per((r) => r.search.bluffs), endings: reasons((r) => r.search) },
    heuristic: { us: per((r) => r.heuristic.us), them: per((r) => r.heuristic.them), reneges: per((r) => r.heuristic.reneges), bluffs: per((r) => r.heuristic.bluffs), endings: reasons((r) => r.heuristic) },
    netDiff: diff,
    searched,
    withDrops,
    dropShare: withDrops / searched,
    drops,
    sampler: { ...sampler, fallbackShare: sampler.fallbacks / sampler.worlds },
    seconds: (Date.now() - started) / 1000,
  }
  mkdirSync(new URL('./results/', import.meta.url), { recursive: true })
  writeFileSync(new URL(`./results/cheating-${opts.a.replace(/:/g, '_')}-${first}-${rounds}.json`, import.meta.url), JSON.stringify(summary, null, 2) + '\n')
  console.log(JSON.stringify(summary, null, 2))
  console.log(
    `| ${opts.a} | ${rows.length} | ${crashes.length} | ${fmt(summary.search.us)} - ${fmt(summary.search.them)} | ${fmt(summary.heuristic.us)} - ${fmt(summary.heuristic.them)} | ${fmt(diff.mean)} [${fmt(diff.lo)}, ${fmt(diff.hi)}] | ${fmt(100 * summary.dropShare, 1)}% | ${fmt(100 * summary.sampler.fallbackShare, 2)}% |`,
  )
}
