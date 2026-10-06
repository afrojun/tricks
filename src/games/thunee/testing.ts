/** Thunee's practice for tests: a game played forward the way an attentive learner would. */
import { decide } from '../../ai/choose'
import type { Note } from '../../coach/note'
import { type Action, type Card, type Game, type GameEvent, type RoundSummary, type View, seatsToAct } from './engine'
import { HONEST } from '../../kit/mind'
import type { PracticeGame } from '../../practice/game'
import { playPractice as play } from '../../practice/testing'

export type ThuneePracticeGame = PracticeGame<Game, Action, GameEvent, View, Note, Card[][], RoundSummary>

/** Moving on between rounds, or the computer's own honest choice for the player's decision. */
function learner(p: ThuneePracticeGame): Action | null {
  if (p.game.phase.kind === 'roundResult') return { type: 'nextRound' }
  return seatsToAct(p.game).includes(p.you) ? decide(p.coachView(), HONEST).action : null
}

/**
 * Up to `steps` moves: the player's decisions follow the computer's own honest choice, trick pauses
 * are continued, and time is advanced to the next deadline. Stops early at game over or when `stop` says so.
 */
export function playPractice(p: ThuneePracticeGame, steps: number, onStep?: () => void, stop?: (p: ThuneePracticeGame) => boolean): ThuneePracticeGame {
  return play(p, steps, learner, onStep, stop)
}
