/** Bundled for the browser by browser-speed.ts: times the search on a fixed set of decisions. */
import { decisionViews } from './decisions'
import { type RolloutPolicy, search } from './search'

export function bench(rounds: number, budgets: number[], policies: RolloutPolicy[]) {
  const views = decisionViews(rounds)
  for (const v of views.slice(0, 30)) search(v, { worlds: 5, policy: 'heuristic', seed: 1 })
  const out: { policy: RolloutPolicy; worlds: number; ms: number[] }[] = []
  for (const policy of policies) {
    for (const worlds of budgets) {
      const ms = views.map((v, i) => {
        const started = performance.now()
        search(v, { worlds, policy, seed: i })
        return performance.now() - started
      })
      out.push({ policy, worlds, ms })
    }
  }
  return { decisions: views.length, out }
}
