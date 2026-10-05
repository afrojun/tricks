/**
 * Section 3.4: what the search could tell a player about a decision.
 *   ./node_modules/.bin/tsx src/spike/search/explain.ts [--rounds 40] [--spec search:random:100] [--show 12]
 * Decisions come from heuristic rounds (seeds 1-rounds); for each, every legal card's average result,
 * its paired standard error against the chosen card, and how often it won the trick.
 */
import { type Card, type View, type ViewPlaying, availableActions, cardText } from '../../engine'
import { decide } from '../../ai/choose'
import { HONEST } from '../../ai/mind'
import { decisionViews } from './decisions'
import { type RolloutPolicy, search } from './search'
import { args, fmt, mean, quantile, sd } from './stats'

const opts = args()
const rounds = Number(opts.rounds ?? 40)
const show = Number(opts.show ?? 12)
const [, policy, worlds] = (opts.spec ?? 'search:random:100').split(':')
const views = decisionViews(rounds)
const same = (a: Card, b: Card) => a.suit === b.suit && a.rank === b.rank

interface Row {
  view: View
  chosen: Card
  heuristic: Card
  /** Chosen minus next best, in balls and in card points, with paired standard errors. */
  gapBalls: number
  seBalls: number
  gapPoints: number
  sePoints: number
  /** What the heuristic's card costs against the chosen one, when they differ. */
  costBalls: number | null
  seCostBalls: number | null
  costPoints: number | null
  lines: string[]
}

const paired = (a: number[], b: number[]) => {
  const d = a.map((x, i) => x - b[i])
  return { gap: mean(d), se: sd(d) / Math.sqrt(d.length) }
}

const rows: Row[] = views.map((view, i) => {
  const r = search(view, { worlds: Number(worlds), policy: policy as RolloutPolicy, seed: i, keep: true })
  const [best, next] = r.stats
  const honest = decide(view, HONEST).action
  const heuristic = honest.type === 'playCard' ? honest.card : best.card
  const h = r.stats.find((s) => same(s.card, heuristic))!
  const balls = paired(best.values!, next.values!)
  const points = paired(best.margins!, next.margins!)
  const cost = same(h.card, best.card) ? null : paired(best.values!, h.values!)
  const phase = view.phase as ViewPlaying
  const lines = r.stats.map(
    (s) =>
      `${cardText(s.card).padEnd(4)} balls ${fmt(s.mean, 2).padStart(6)}  points ${fmt(s.margin, 1).padStart(7)}  wins trick ${fmt(100 * s.wonByMe, 0).padStart(3)}% (team ${fmt(100 * s.wonByTeam, 0).padStart(3)}%)${same(s.card, heuristic) ? '  <- heuristic' : ''}`,
  )
  lines.unshift(
    `seat ${view.seat}, trick ${phase.tricks.length + 1}, trumper ${phase.trumper}, trump ${phase.trump ?? 'hidden'}, on the table: ${phase.current.map((p) => cardText(p.card)).join(' ') || '(leading)'}, hand: ${phase.hand.map(cardText).join(' ')}`,
  )
  return {
    view,
    chosen: best.card,
    heuristic,
    gapBalls: balls.gap,
    seBalls: balls.se,
    gapPoints: points.gap,
    sePoints: points.se,
    costBalls: cost?.gap ?? null,
    seCostBalls: cost?.se ?? null,
    costPoints: same(h.card, best.card) ? null : best.margin - h.margin,
    lines,
  }
})

console.log(`${rows.length} decisions with two or more legal cards from ${rounds} heuristic rounds, ${opts.spec ?? 'search:random:100'}\n`)
const legal = rows.map((r) => availableActions(r.view).legal.length)
const clear = rows.filter((r) => r.gapBalls > 2 * r.seBalls)
const tied = rows.filter((r) => r.gapBalls === 0)
const differ = rows.filter((r) => r.costBalls !== null)
const clearCost = differ.filter((r) => r.costBalls! > 2 * r.seCostBalls!)
console.log(`- legal cards per decision: mean ${fmt(mean(legal), 2)}`)
console.log(`- best card ahead of the next best by more than two standard errors, in balls: ${clear.length} (${fmt((100 * clear.length) / rows.length, 0)}%)`)
console.log(`- best and next best exactly level in balls (decided by card points): ${tied.length} (${fmt((100 * tied.length) / rows.length, 0)}%)`)
console.log(`- gap to the next best, balls: median ${fmt(quantile(rows.map((r) => r.gapBalls), 0.5), 3)}, 90th percentile ${fmt(quantile(rows.map((r) => r.gapBalls), 0.9), 3)}`)
console.log(`- gap to the next best, card points: median ${fmt(quantile(rows.map((r) => r.gapPoints), 0.5), 1)}, 90th percentile ${fmt(quantile(rows.map((r) => r.gapPoints), 0.9), 1)}`)
console.log(`- search and heuristic differ: ${differ.length} (${fmt((100 * differ.length) / rows.length, 0)}%); of those the heuristic's card is worse by more than two standard errors in balls: ${clearCost.length}`)
console.log(`- cost of the heuristic's card when they differ, balls: median ${fmt(quantile(differ.map((r) => r.costBalls!), 0.5), 3)}, mean ${fmt(mean(differ.map((r) => r.costBalls!)), 3)}; card points: median ${fmt(quantile(differ.map((r) => r.costPoints!), 0.5), 1)}`)
console.log(`\n## ${show} examples (evenly spaced)\n`)
for (let i = 0; i < show; i++) {
  const r = rows[Math.floor((i * rows.length) / show)]
  console.log('```')
  console.log(r.lines.join('\n'))
  console.log(`gap to next best: ${fmt(r.gapBalls, 3)} balls (se ${fmt(r.seBalls, 3)}), ${fmt(r.gapPoints, 1)} points (se ${fmt(r.sePoints, 1)})`)
  console.log('```')
}
