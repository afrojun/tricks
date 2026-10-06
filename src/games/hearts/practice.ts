/** Hearts' practice: its table, its trick pause, what a round keeps for the review, and its tier-1 coach. For the practice screen. */
import type { Note } from '../../kit/coach'
import type { GamePractice } from '../../practice/contract'
import { heartsCoach } from './coach'
import { type Action, type Card, type Game, type GameEvent, type RoundSummary, type View, passDirection } from './engine'
import { hearts } from '.'

/** Each seat's thirteen cards as dealt, before any pass. */
type Deal = Card[][]

export const heartsPractice: GamePractice<Game, Action, GameEvent, View, Note, Deal, RoundSummary> = {
  module: hearts,

  /** Play runs clockwise, so seat 1 sits on the player's left. */
  seatNames: () => ['Left', 'Across', 'Right'],

  /** Honest computers in the other three seats, and Standard rules. */
  setup: () => [...[1, 2, 3].map((seat) => ({ type: 'addAi', seat, persona: 'straight' }) as const), { type: 'setRules', overrides: {} }],

  /** Identifies one trick pause, so continuing it is remembered across a reload. */
  pauseId(game) {
    const phase = game.phase
    return phase.kind === 'trickPause' ? `${game.roundNumber}:${phase.play.tricks.length}` : null
  },

  isDecision: (action) => action.type === 'choosePass' || action.type === 'playCard' || action.type === 'challengePlay',

  roundBegins: (events) => events.some((e) => e.type === 'dealt'),

  /** The hands before the pass; in a round without one, the hands before the first card. */
  dealInPlay(game) {
    const phase = game.phase
    if (phase.kind === 'passing') return { index: 0, hands: phase.hands.map((h) => [...h]) }
    const unplayed = phase.kind === 'playing' && phase.play.tricks.length === 0 && phase.play.current.length === 0
    if (unplayed && passDirection(game.rules, game.roundNumber) === 'none') return { index: 0, hands: phase.play.hands.map((h) => [...h]) }
    return null
  },

  /** The deal that starts a game happens before anyone is listening. */
  opening: (game) => (game.roundNumber === 1 ? { type: 'dealt', roundNumber: 1, direction: passDirection(game.rules, 1) } : null),

  summary: (view) => (view.phase.kind === 'roundResult' || view.phase.kind === 'gameOver' ? view.phase.summary : null),

  coach: heartsCoach,
}
