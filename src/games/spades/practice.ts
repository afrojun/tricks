/** Spades' practice: its table, its trick pause, what a round keeps for the review, its tier-1 coach, and its drills. */
import type { Note } from '../../kit/coach'
import { allSeats } from '../../kit/table'
import type { GamePractice } from '../../practice/contract'
import { spadesCoach } from './coach'
import { SPADES_DRILLS } from './drills'
import type { Action, Card, Game, GameEvent, RoundSummary, View } from './engine'
import { spades } from '.'

/** Each seat's cards as dealt, or with two as drawn. */
type Deal = Card[][]

/** Play runs clockwise, so seat 1 sits on the player's left. */
const NAMES: Record<number, string[]> = { 2: ['Opponent'], 3: ['Left', 'Right'], 4: ['Left', 'Partner', 'Right'] }

export const spadesPractice: GamePractice<Game, Action, GameEvent, View, Note, Deal, RoundSummary> = {
  module: spades,

  seatNames: (playerCount) => NAMES[playerCount],

  /** Honest computers in every other seat, and Standard rules. */
  setup: (playerCount) => [
    ...(playerCount === 4 ? [] : [{ type: 'setPlayerCount', playerCount } as const]),
    ...allSeats(playerCount)
      .slice(1)
      .map((seat) => ({ type: 'addAi', seat, persona: 'straight' }) as const),
    { type: 'setRules', overrides: {} },
  ],

  /** Identifies one trick pause, so continuing it is remembered across a reload. */
  pauseId(game) {
    const phase = game.phase
    return phase.kind === 'trickPause' ? `${game.roundNumber}:${phase.play.tricks.length}` : null
  },

  isDecision: (action) => ['draw', 'call', 'callBlindNil', 'giveCards', 'playCard', 'challengePlay'].includes(action.type),

  roundBegins: (events) => events.some((e) => e.type === 'dealt'),

  /** The hands as dealt or drawn, while they are still whole: before the first call. */
  dealInPlay(game) {
    const phase = game.phase
    if (phase.kind !== 'calling' || phase.calls.some((c) => c !== null)) return null
    return { index: 0, hands: phase.hands.map((h) => [...h]) }
  },

  /** The deal that starts a game happens before anyone is listening. */
  opening: (game) => (game.roundNumber === 1 ? { type: 'dealt', roundNumber: 1, dealer: game.dealer } : null),

  summary: (view) => (view.phase.kind === 'roundResult' || view.phase.kind === 'gameOver' ? view.phase.summary : null),

  coach: spadesCoach,

  drills: SPADES_DRILLS,
}
