/** Thunee's practice: its table, its trick pause, what a round keeps for the review, and its coach. For the practice screen. */
import { thuneeCoach } from './coach'
import { THUNEE_DRILLS } from './drills'
import type { Note } from './coach/note'
import { type Action, type Card, type Game, type GameEvent, type RoundSummary, type View, allSeats } from './engine'
import type { GamePractice } from '../../practice/contract'
import type { PracticeSession } from '../../practice/session'
import { thunee } from '.'

/** Computer seats are named by where they sit, as seen from seat 0. */
const NAMES: Record<2 | 4, string[]> = { 2: ['Opponent'], 4: ['Right', 'Partner', 'Left'] }

/** One half's dealt hands, by seat: a round keeps one for each half dealt so far. */
type Deal = Card[][]

/** A practice game of Thunee, as its screens use it. */
export type ThuneePracticeSession = PracticeSession<View, Action, GameEvent, Note, Deal>

export const thuneePractice: GamePractice<Game, Action, GameEvent, View, Note, Deal, RoundSummary> = {
  module: thunee,

  seatNames: (playerCount) => NAMES[playerCount as 2 | 4],

  /** Honest computers in every other seat, and Traditional rules. */
  setup: (playerCount) => [
    ...(playerCount === 2 ? [{ type: 'setPlayerCount', playerCount: 2 } as const] : []),
    ...allSeats(playerCount)
      .slice(1)
      .map((seat) => ({ type: 'addAi', seat, persona: 'straight' }) as const),
    { type: 'setRules', overrides: {} },
  ],

  /**
   * Identifies one trick pause, so continuing it is remembered across a reload. A pause with no
   * deadline is not one to continue past: it waits for the player to call Jodhi or say no.
   */
  pauseId(game) {
    const phase = game.phase
    return phase.kind === 'trickPause' && phase.deadline !== null ? `${game.roundNumber}:${phase.play.tricks.length}` : null
  },

  isDecision: (action) => action.type !== 'nextRound' && action.type !== 'rematch' && action.type !== 'tick',

  roundBegins: (events) => events.some((e) => e.type === 'dealt' && e.half === 1),

  dealInPlay(game) {
    const phase = game.phase
    if (phase.kind !== 'playing' && phase.kind !== 'trickPause') return null
    return { index: phase.play.half - 1, hands: phase.play.dealt.map((h) => [...h]) }
  },

  /** The deal that starts a game happens before anyone is listening. */
  opening: (game) => (game.roundNumber === 1 ? { type: 'dealt', roundNumber: game.roundNumber, dealer: game.dealer, half: 1 } : null),

  summary: (view) => (view.phase.kind === 'roundResult' || view.phase.kind === 'gameOver' ? view.phase.summary : null),

  coach: thuneeCoach,

  drills: THUNEE_DRILLS,
}
