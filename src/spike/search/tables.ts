/**
 * Prints the results tables from the saved runs in results/.
 *   ./node_modules/.bin/tsx src/spike/search/tables.ts
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fmt } from './stats'

const dir = new URL('./results/', import.meta.url)
const load = (name: string) => JSON.parse(readFileSync(new URL(name, dir), 'utf8'))
const files = readdirSync(dir).filter((f) => f.endsWith('.json'))

console.log('## Strength (duplicate pairs, Traditional, everyone honest)\n')
console.log('| Side A | Side B | Pairs | A balls/round | B balls/round | A - B [95% CI] | Width < 0.1 after | Searched decisions | Same card as heuristic |')
console.log('|---|---|---|---|---|---|---|---|---|')
for (const f of files.filter((f) => f.startsWith('strength-'))) {
  const s = load(f).summary
  const agree = s.agreement === null ? '-' : `${fmt(100 * s.agreement, 1)}%`
  console.log(
    `| ${s.a} | ${s.b} | ${s.pairs} | ${fmt(s.aPerRound)} | ${fmt(s.bPerRound)} | ${fmt(s.diff)} [${fmt(s.lo)}, ${fmt(s.hi)}] | ${s.narrowAt ?? 'not reached'} | ${s.searched} | ${agree} |`,
  )
}

console.log('\n## Before card play (the extension): decisions searched, and how many differed from the heuristic\n')
for (const f of files.filter((f) => f.startsWith('strength-') && f.includes('early'))) {
  const s = load(f).summary
  const parts = Object.entries(s.early as Record<string, [number, number]>).map(([k, [n, d]]) => `${k} ${d}/${n} (${fmt((100 * d) / n, 0)}%)`)
  console.log(`- ${s.a}: ${parts.join(', ')}`)
}

console.log('\n## Cheating (seeds 20001-21000; seats 0 and 2 never challenge)\n')
console.log('| Design | Search | Rounds | Crashes | Search side: won - lost per round | Heuristic side: won - lost | Net difference [95% CI] | Same, rounds decided by play in both copies (n) | Decisions / rounds with a dropped constraint | Distinct drops per round | Drops by kind | Sampler fallbacks |')
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|')
for (const f of files.filter((f) => f.startsWith('cheating-'))) {
  const s = load(f)
  const tag = f.split('-')[1]
  const d = s.netDiff
  const p = s.netDiffDecidedByPlay
  console.log(
    `| ${tag} | ${s.a} | ${s.rounds} | ${s.crashes} | ${fmt(s.search.us)} - ${fmt(s.search.them)} | ${fmt(s.heuristic.us)} - ${fmt(s.heuristic.them)} | ${fmt(d.mean)} [${fmt(d.lo)}, ${fmt(d.hi)}] | ${fmt(p.mean)} [${fmt(p.lo)}, ${fmt(p.hi)}] (${s.decidedByPlayInBoth}) | ${fmt(100 * s.dropShare, 1)}% / ${fmt(100 * s.roundsWithDrops, 1)}% | ${fmt(s.distinctDropsPerRound, 2)} | ${JSON.stringify(s.drops)} | ${fmt(100 * s.sampler.fallbackShare, 2)}% |`,
  )
}
console.log('\nCheats per round (search copy / heuristic copy): reneges and Jodhi bluffs; endings')
for (const f of files.filter((f) => f.startsWith('cheating-'))) {
  const s = load(f)
  console.log(
    `- ${f.split('-')[1]} ${s.a}: reneges ${fmt(s.search.reneges, 2)} / ${fmt(s.heuristic.reneges, 2)}, bluffs ${fmt(s.search.bluffs, 2)} / ${fmt(s.heuristic.bluffs, 2)}; endings ${JSON.stringify(s.search.endings)} / ${JSON.stringify(s.heuristic.endings)}`,
  )
}
