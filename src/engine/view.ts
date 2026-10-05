import { tableView } from '../kit/table'
import { ballsTarget } from './predicates'
import type { Seat } from './seats'
import type { Game, Phase, RoundPlay, ViewPhase, ViewPlaying, View } from './types'

/**
 * How much of the round's play a view carries.
 * - `table`: what someone at the table can still see or picture: the current
 *   trick, the last completed one, and who won each earlier trick.
 * - `full`: every card played. Only for computer players, which run on the
 *   server and stand in for a player who remembers the whole round.
 */
export type Memory = 'table' | 'full'

/** What one seat (or a spectator, `null`) is allowed to know about the game. */
export function viewFor(game: Game, seat: Seat | null, memory: Memory = 'table'): View {
  return {
    ...tableView(game, seat),
    playerCount: game.playerCount,
    rules: game.rules,
    balls: game.balls,
    ballsTarget: ballsTarget(game.rules, game.khanaakCalled),
    dealer: game.dealer,
    roundNumber: game.roundNumber,
    phase: viewPhase(game.phase, seat, memory),
  }
}

function ownHand(hands: readonly (readonly unknown[])[], seat: Seat | null) {
  return {
    hand: seat === null ? [] : [...(hands[seat] as never[])],
    handCounts: hands.map((h) => h.length),
  }
}

function viewPhase(phase: Phase, seat: Seat | null, memory: Memory): ViewPhase {
  switch (phase.kind) {
    case 'lobby':
      return { kind: 'lobby' }
    case 'calling':
      return {
        kind: 'calling',
        ...ownHand(phase.hands, seat),
        defaultTrumper: phase.defaultTrumper,
        call: phase.call,
        passed: phase.passed,
        preselect: phase.preselect && phase.preselect.seat === seat ? phase.preselect.choice : null,
        deadline: phase.deadline,
      }
    case 'trumpSelection':
      return {
        kind: 'trumpSelection',
        ...ownHand(phase.hands, seat),
        trumper: phase.trumper,
        callAmount: phase.callAmount,
      }
    case 'thuneeWindow':
      return {
        kind: 'thuneeWindow',
        ...ownHand(phase.hands, seat),
        trumper: phase.trumper,
        trump: seat === phase.trumper ? phase.trump : null,
        callAmount: phase.callAmount,
        pending: phase.pending,
        passed: phase.passed,
        deadline: phase.deadline,
      }
    case 'playing':
      return viewPlay('playing', phase.play, seat, phase.turn, null, memory)
    case 'trickPause':
      return viewPlay('trickPause', phase.play, seat, null, phase.deadline, memory)
    case 'roundResult':
      return { kind: 'roundResult', summary: phase.summary }
    case 'gameOver':
      return { kind: 'gameOver', winner: phase.winner, summary: phase.summary }
  }
}

function viewPlay(
  kind: 'playing' | 'trickPause',
  play: RoundPlay,
  seat: Seat | null,
  turn: Seat | null,
  deadline: number | null,
  memory: Memory,
): ViewPlaying {
  const trumpVisible = play.trumpRevealed || (seat === play.trumper && play.thunee === null)
  return {
    kind,
    ...ownHand(play.hands, seat),
    trumper: play.trumper,
    callAmount: play.callAmount,
    trump: trumpVisible ? play.trump : null,
    trumpRevealed: play.trumpRevealed,
    thunee: play.thunee,
    half: play.half,
    tricks: play.tricks.map((t, i) => ({
      // Earlier tricks have been turned face down: only their winners remain known.
      plays: memory === 'full' || i === play.tricks.length - 1 ? t.plays.map((p) => ({ seat: p.seat, card: p.card })) : [],
      winner: t.winner,
      half: t.half,
    })),
    current: play.current.map((p) => ({ seat: p.seat, card: p.card })),
    turn,
    jodhiClaims: play.jodhiClaims.map((j) => ({ seat: j.seat, suit: j.suit, withJack: j.withJack, points: j.points, trick: j.trick })),
    jodhiOpenFor: play.jodhiOpenFor,
    double: play.double,
    khanaak: play.khanaak,
    deadline,
  }
}
