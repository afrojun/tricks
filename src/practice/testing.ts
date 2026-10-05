/** Plays a practice game forward the way an attentive learner would: always taking the advice. */
import { seatsToAct } from '../engine'
import { decide } from '../ai/choose'
import { HONEST } from '../ai/mind'
import type { PracticeGame } from './game'

/**
 * Up to `steps` moves: the player's decisions follow the computer's own honest choice, trick pauses
 * are continued, and time is advanced to the next deadline. Stops early at game over or when `stop` says so.
 */
export function playPractice(p: PracticeGame, steps: number, onStep?: () => void, stop?: (p: PracticeGame) => boolean): PracticeGame {
  for (let i = 0; i < steps; i++) {
    const phase = p.game.phase
    if (phase.kind === 'gameOver' || stop?.(p)) break
    if (phase.kind === 'roundResult') p.act({ type: 'nextRound' }, null)
    else if (phase.kind === 'trickPause' && p.waiting(false)) p.continueTrick()
    else if (seatsToAct(p.game).includes(p.you)) {
      const { action } = decide(p.coachView(), HONEST)
      p.act(action, action)
    } else p.advance(p.nextIn() ?? 1000, false)
    onStep?.()
  }
  return p
}
