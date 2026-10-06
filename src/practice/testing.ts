/** Plays a practice game forward the way an attentive learner would. For tests. */
import type { TableState, TableView } from '../kit/table'
import type { Note } from './contract'
import type { PracticeGame } from './game'

/**
 * Up to `steps` moves: the player takes what `choose` gives (moving on between rounds, or a
 * decision), pauses are continued, and otherwise time is advanced to the next deadline. Stops
 * early at game over or when `stop` says so.
 */
export function playPractice<G extends TableState, A extends { type: string }, E, V extends TableView, N extends Note, D, S>(
  p: PracticeGame<G, A, E, V, N, D, S>,
  steps: number,
  choose: (p: PracticeGame<G, A, E, V, N, D, S>) => A | null,
  onStep?: () => void,
  stop?: (p: PracticeGame<G, A, E, V, N, D, S>) => boolean,
): PracticeGame<G, A, E, V, N, D, S> {
  for (let i = 0; i < steps; i++) {
    if (p.game.phase.kind === 'gameOver' || stop?.(p)) break
    if (p.paused()) p.continueTrick()
    else {
      const action = choose(p)
      if (action !== null) p.act(action, action)
      else p.advance(p.nextIn() ?? 1000, false)
    }
    onStep?.()
  }
  return p
}
