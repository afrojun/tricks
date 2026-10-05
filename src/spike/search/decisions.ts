/**
 * A fixed, seeded set of decisions to time the search on: every choice of two or more legal cards in heuristic rounds,
 * or with `before`, every calling, trump and Thunee decision with two or more candidates.
 */
import { type View, availableActions, nextDeadline, seatsToAct, teamOf, viewFor } from '../../engine'
import { Table } from '../../engine/testing'
import { chooseAction, chooseJodhi } from '../../ai/choose'
import { HONEST } from '../../ai/mind'
import { earlyCandidates } from './early'

export function decisionViews(rounds: number, firstSeed = 1, before = false): View[] {
  const out: View[] = []
  for (let seed = firstSeed; seed < firstSeed + rounds; seed++) {
    const t = new Table(4, {}, seed).do(0, { type: 'start' })
    for (let guard = 0; guard < 2000; guard++) {
      const phase = t.game.phase
      if (phase.kind === 'roundResult' || phase.kind === 'gameOver') break
      const waiting = seatsToAct(t.game)
      if (waiting.length === 0) {
        if (phase.kind === 'trickPause' && phase.play.jodhiOpenFor !== null) {
          for (let s = 0; s < 4; s++) {
            if (teamOf(s) !== phase.play.jodhiOpenFor) continue
            const claim = chooseJodhi(viewFor(t.game, s, 'full'), HONEST)
            if (claim) t.do(s, claim)
          }
        }
        t.now = nextDeadline(t.game)!
        t.do('system', { type: 'tick' })
        continue
      }
      const view = viewFor(t.game, waiting[0], 'full')
      if (!before && phase.kind === 'playing' && availableActions(view).legal.length > 1) out.push(view)
      if (before && phase.kind !== 'playing' && earlyCandidates(view).length > 1) out.push(view)
      t.do(waiting[0], chooseAction(view, HONEST))
    }
  }
  return out
}
