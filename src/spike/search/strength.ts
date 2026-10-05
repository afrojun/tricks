/**
 * Section 3.1: side A against side B on duplicate deals, Traditional rules, everyone honest.
 *   ./node_modules/.bin/tsx src/spike/search/strength.ts --a search:random:10 --b heuristic [--pairs 1000] [--first 1] [--shards 6]
 * A player is `heuristic`, `random`, or `search:<random|heuristic|randomClaims>:<worlds>[:notie][:early]`
 * (`notie`: no tiebreak by card points; `early`: calling, trump and Thunee by search too).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { cardId } from '../../engine'
import { type Player, heuristicPlayer, playPair, randomPlayer, searchPlayer } from './harness'
import type { RolloutPolicy } from './search'
import { inChild, runShards } from './shards'
import { args, ci95, fmt, quantile } from './stats'

export function parsePlayer(spec: string): Player {
  if (spec === 'heuristic') return heuristicPlayer()
  if (spec === 'random') return randomPlayer()
  const [kind, policy, worlds, ...flags] = spec.split(':')
  if (kind !== 'search') throw new Error(`unknown player ${spec}`)
  return searchPlayer({ policy: policy as RolloutPolicy, worlds: Number(worlds), tiebreak: !flags.includes('notie'), early: flags.includes('early') }, spec)
}

interface PairOut {
  seed: number
  a: number
  b: number
  /** Searched decisions by either side, how many matched the heuristic's card, and their times. */
  searched: number
  agree: number
  ms: number[]
  reasons: string[]
  /** Decisions before card play by search, and how many differed from the heuristic, by phase. */
  early: Record<string, [number, number]>
}

const opts = args()
const pairs = Number(opts.pairs ?? 1000)
const first = Number(opts.first ?? 1)
const child = inChild()

if (child) {
  const a = parsePlayer(opts.a)
  const b = parsePlayer(opts.b)
  const out: PairOut[] = []
  for (let seed = first; seed < first + pairs; seed++) {
    if ((seed - first) % child.of !== child.shard) continue
    const p = playPair(seed, a, b)
    const decisions = p.rounds.flatMap((r) => r.decisions)
    out.push({
      seed,
      a: p.a,
      b: p.b,
      searched: decisions.length,
      agree: decisions.filter((d) => d.searched.heuristic && cardId(d.searched.heuristic) === cardId(d.searched.result.card)).length,
      ms: decisions.map((d) => Math.round(d.searched.ms * 10) / 10),
      reasons: p.rounds.map((r) => r.summary.reason),
      early: p.rounds.flatMap((r) => r.early).reduce<Record<string, [number, number]>>((acc, e) => {
        const [n, d] = acc[e.kind] ?? [0, 0]
        acc[e.kind] = [n + 1, d + (e.differs ? 1 : 0)]
        return acc
      }, {}),
    })
  }
  console.log(JSON.stringify(out))
} else {
  const shards = Number(opts.shards ?? 6)
  const started = Date.now()
  const results = (await runShards<PairOut[]>(new URL(import.meta.url).pathname, process.argv.slice(2), shards)).flat()
  results.sort((x, y) => x.seed - y.seed)
  const diffs = results.map((r) => (r.a - r.b) / 2)
  const ci = ci95(diffs)
  // The first multiple of 50 pairs at which the interval was narrower than 0.1 balls per round.
  let narrowAt: number | null = null
  for (let n = 50; n <= diffs.length && narrowAt === null; n += 50) if (2 * ci95(diffs.slice(0, n)).half < 0.1) narrowAt = n
  const searched = results.reduce((s, r) => s + r.searched, 0)
  const agree = results.reduce((s, r) => s + r.agree, 0)
  const ms = results.flatMap((r) => r.ms)
  const summary = {
    a: opts.a,
    b: opts.b,
    pairs: results.length,
    rounds: results.length * 2,
    seeds: `${first}-${first + pairs - 1}`,
    aPerRound: results.reduce((s, r) => s + r.a, 0) / (2 * results.length),
    bPerRound: results.reduce((s, r) => s + r.b, 0) / (2 * results.length),
    diff: ci.mean,
    lo: ci.lo,
    hi: ci.hi,
    narrowAt,
    searched,
    agreement: searched > 0 ? agree / searched : null,
    msMedian: quantile(ms, 0.5),
    msP95: quantile(ms, 0.95),
    early: results.reduce<Record<string, [number, number]>>((acc, r) => {
      for (const [k, [n, d]] of Object.entries(r.early)) acc[k] = [(acc[k]?.[0] ?? 0) + n, (acc[k]?.[1] ?? 0) + d]
      return acc
    }, {}),
    seconds: (Date.now() - started) / 1000,
  }
  mkdirSync(new URL('./results/', import.meta.url), { recursive: true })
  const name = `strength-${opts.a}-vs-${opts.b}-${first}-${pairs}`.replace(/:/g, '_')
  writeFileSync(new URL(`./results/${name}.json`, import.meta.url), JSON.stringify({ summary, pairs: results.map(({ ms: _ms, ...r }) => r) }) + '\n')
  console.log(JSON.stringify(summary))
  console.log(
    `| ${opts.a} | ${opts.b} | ${summary.pairs} | ${fmt(summary.aPerRound)} | ${fmt(summary.bPerRound)} | ${fmt(ci.mean)} [${fmt(ci.lo)}, ${fmt(ci.hi)}] | ${narrowAt ?? 'not reached'} | ${summary.agreement === null ? '-' : fmt(100 * summary.agreement, 1) + '%'} | ${fmt(summary.msMedian, 1)} / ${fmt(summary.msP95, 1)} | ${fmt(summary.seconds, 0)} s |`,
  )
}
