/**
 * Section 3.2: milliseconds per decision, and where the time goes.
 *   ./node_modules/.bin/tsx src/spike/search/speed.ts [--rounds 20] [--earlyRounds 5] [--budgets 10,30,100] [--policies random,heuristic]
 *     [--repeat 1] [--only perDecision|cloning]
 * With `--repeat k` each decision is timed k times and the fastest kept, to see past other load on the machine.
 * `--only perDecision` stops after the first table; `--only cloning` runs only the cloning comparison.
 */
import { type Action, type Ctx, type Game, type Seat, type View, apply, availableActions } from '../../engine'
import { seededRng } from '../../engine/testing'
import { applyInPlace } from './applyInPlace'
import { searchEarly } from './early'
import { decisionViews } from './decisions'
import { rebuild } from './rebuild'
import { knowledge, sampleWorld } from './sample'
import { type RolloutPolicy, playOut, search } from './search'
import { args, fmt, mean, quantile } from './stats'

const opts = args()
const rounds = Number(opts.rounds ?? 20)
const budgets = (opts.budgets ?? '10,30,100').split(',').map(Number)
const policies = (opts.policies ?? 'random,heuristic').split(',') as RolloutPolicy[]
const views = decisionViews(rounds)
const only = opts.only ?? 'all'
console.log(`${views.length} decisions with two or more legal cards, from ${rounds} heuristic rounds (seeds 1-${rounds})`)
const legalCounts = views.map((v) => availableActions(v).legal.length)
console.log(`legal cards per decision: mean ${fmt(mean(legalCounts), 2)}, max ${Math.max(...legalCounts)}`)

// Warm up the JIT.
for (const v of views.slice(0, 30)) search(v, { worlds: 5, policy: 'heuristic', seed: 1 })

const time = (run: () => void) => {
  const started = performance.now()
  run()
  return performance.now() - started
}
const repeat = Number(opts.repeat ?? 1)
const fastest = (run: () => void) => Math.min(...Array.from({ length: repeat }, () => time(run)))

/** One row per policy and budget: median, 95th percentile and slowest decision. */
function timingTable(title: string, decisions: View[], run: (v: View, opts: { worlds: number; policy: RolloutPolicy; seed: number }) => unknown, timer = time) {
  console.log(`\n## ${title}\n`)
  console.log('| Policy | Worlds | Median ms | p95 ms | Max ms |')
  console.log('|---|---|---|---|---|')
  for (const policy of policies) {
    for (const worlds of budgets) {
      const ms = decisions.map((v, i) => timer(() => run(v, { worlds, policy, seed: i })))
      console.log(`| ${policy} | ${worlds} | ${fmt(quantile(ms, 0.5), 1)} | ${fmt(quantile(ms, 0.95), 1)} | ${fmt(Math.max(...ms), 1)} |`)
    }
  }
}

if (only === 'all' || only === 'perDecision') {
  timingTable(`Per decision, in place (no cloning)${repeat > 1 ? `, fastest of ${repeat}` : ''}`, views, search, fastest)
}
if (only === 'perDecision') process.exit(0)

// Calling, trump and Thunee by search (the optional extension): each candidate is played out from before card play.
if (only === 'all') {
  const early = decisionViews(Number(opts.earlyRounds ?? 5), 1, true)
  timingTable(`Calling, trump and Thunee by search, in place: ${early.length} decisions`, early, searchEarly)
}

// The engine's apply as it is: one structuredClone per action. Time the clones by wrapping the global.
const realClone = globalThis.structuredClone
let cloneMs = 0
let clones = 0
const timedClone = ((value: unknown, options?: StructuredSerializeOptions) => {
  const started = performance.now()
  const out = realClone(value, options)
  cloneMs += performance.now() - started
  clones++
  return out
}) as typeof structuredClone

console.log("\n## Per decision with the engine's cloning apply\n")
console.log('| Policy | Worlds | Median ms | p95 ms | Share of time in structuredClone | Clones per decision | In place is faster by |')
console.log('|---|---|---|---|---|---|---|')
for (const policy of policies) {
  for (const worlds of budgets.filter((b) => b <= 30)) {
    cloneMs = 0
    clones = 0
    globalThis.structuredClone = timedClone
    const ms = views.map((v, i) => time(() => search(v, { worlds, policy, seed: i, cloning: true })))
    globalThis.structuredClone = realClone
    const cloned = views.map((v, i) => time(() => search(v, { worlds, policy, seed: i, cloning: true })))
    const fast = views.map((v, i) => time(() => search(v, { worlds, policy, seed: i })))
    const total = ms.reduce((a, b) => a + b, 0)
    const ratio = cloned.reduce((a, b) => a + b, 0) / fast.reduce((a, b) => a + b, 0)
    console.log(
      `| ${policy} | ${worlds} | ${fmt(quantile(cloned, 0.5), 1)} | ${fmt(quantile(cloned, 0.95), 1)} | ${fmt((100 * cloneMs) / total, 0)}% | ${fmt(clones / views.length, 0)} | ${fmt(ratio, 2)}x |`,
    )
  }
}

if (only === 'cloning') process.exit(0)

// Where an in-place search spends its time, at 30 worlds; and the rollouts three ways.
console.log('\n## Where the time goes, 30 worlds\n')
type Step = (g: Game, actor: Seat | 'system', action: Action, ctx: Ctx) => Game
const stepWith =
  (validate: boolean): Step =>
  (g, actor, action, ctx) => {
    const r = applyInPlace(g, actor, action, ctx, validate)
    if (typeof r === 'string') throw new Error(r)
    return g
  }
const cloning: Step = (g, actor, action, ctx) => {
  const r = apply(g, actor, action, ctx)
  if ('rejected' in r) throw new Error(r.rejected)
  return r.game
}
for (const policy of policies) {
  const parts = { knowledge: 0, sample: 0, rebuild: 0, rollout: 0, trusted: 0, cloning: 0 }
  views.forEach((view, i) => {
    const me = view.seat!
    const rng = seededRng(i)
    parts.knowledge += time(() => knowledge(view))
    const k = knowledge(view)
    for (let w = 0; w < 30; w++) {
      let world!: ReturnType<typeof sampleWorld>
      parts.sample += time(() => (world = sampleWorld(k, rng)))
      for (const card of availableActions(view).legal) {
        const action: Action = { type: 'playCard', card }
        const games: Game[] = []
        parts.rebuild += time(() => games.push(rebuild(view, world), rebuild(view, world), rebuild(view, world))) / 3
        const run = (step: Step, g: Game) => time(() => playOut(step(g, me, action, { now: 0, rng }), me, 0, policy, seededRng(w), step))
        parts.rollout += run(stepWith(true), games[0])
        parts.trusted += run(stepWith(false), games[1])
        parts.cloning += run(cloning, games[2])
      }
    }
  })
  const total = parts.knowledge + parts.sample + parts.rebuild + parts.rollout
  const pct = (x: number) => `${fmt((100 * x) / total, 1)}%`
  console.log(`- ${policy}: knowledge ${pct(parts.knowledge)}, sampling ${pct(parts.sample)}, rebuild ${pct(parts.rebuild)}, rollouts ${pct(parts.rollout)}`)
  console.log(
    `- ${policy} rollouts: engine apply with cloning ${fmt(parts.cloning / 1000, 2)} s; in place ${fmt(parts.rollout / 1000, 2)} s (${fmt(parts.cloning / parts.rollout, 2)}x faster); in place without re-validating ${fmt(parts.trusted / 1000, 2)} s (${fmt(parts.cloning / parts.trusted, 2)}x)`,
  )
}
