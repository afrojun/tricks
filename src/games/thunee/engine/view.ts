import type { Memory } from '../../../kit/module'
import { tableView } from '../../../kit/table'
import { ballsTarget } from './predicates'
import type { Card } from './cards'
import type { Seat } from './seats'
import type { Game, Phase, RoundPlay, ViewPhase, ViewPlaying, View } from './types'

/** What one seat (or a spectator, `null`) is allowed to know about the game, remembering as much as `memory` says. */
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

/** The viewer's own hand; a spectator holds none. */
function ownHand(hands: readonly (readonly Card[])[], seat: Seat | null): Card[] {
  return seat === null ? [] : [...hands[seat]]
}

function viewPhase(phase: Phase, seat: Seat | null, memory: Memory): ViewPhase {
  switch (phase.kind) {
    case 'lobby':
      return { kind: 'lobby' }
    case 'calling':
      return {
        kind: 'calling',
        hand: ownHand(phase.hands, seat),
        handCounts: phase.hands.map((h) => h.length),
        defaultTrumper: phase.defaultTrumper,
        call: phase.call,
        passed: phase.passed,
        preselect: phase.preselect && phase.preselect.seat === seat ? phase.preselect.choice : null,
        deadline: phase.deadline,
      }
    case 'trumpSelection':
      return {
        kind: 'trumpSelection',
        hand: ownHand(phase.hands, seat),
        handCounts: phase.hands.map((h) => h.length),
        trumper: phase.trumper,
        callAmount: phase.callAmount,
      }
    case 'thuneeWindow':
      return {
        kind: 'thuneeWindow',
        hand: ownHand(phase.hands, seat),
        handCounts: phase.hands.map((h) => h.length),
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
      return viewPlay('trickPause', phase.play, seat, null, phase.deadline, memory, phase.redeal)
    case 'roundResult':
      return { kind: 'roundResult', summary: phase.summary }
    case 'gameOver':
      return { kind: 'gameOver', winner: phase.winner, summary: phase.summary, again: phase.again }
  }
}

function viewPlay(
  kind: 'playing' | 'trickPause',
  play: RoundPlay,
  seat: Seat | null,
  turn: Seat | null,
  deadline: number | null,
  memory: Memory,
  redeal = false,
): ViewPlaying {
  const trumpVisible = play.trumpRevealed || (seat === play.trumper && play.thunee === null)
  return {
    kind,
    hand: ownHand(play.hands, seat),
    handCounts: play.hands.map((h) => h.length),
    trumper: play.trumper,
    callAmount: play.callAmount,
    trump: trumpVisible ? play.trump : null,
    trumpRevealed: play.trumpRevealed,
    thunee: play.thunee && { caller: play.thunee.caller },
    half: play.half,
    tricks: play.tricks.map((t, i) => ({
      // Earlier tricks have been turned face down: only their winners remain known.
      plays: memory === 'full' || i === play.tricks.length - 1 ? t.plays.map((p) => ({ seat: p.seat, card: p.card })) : [],
      winner: t.winner,
      half: t.half,
    })),
    current: play.current.map((p) => ({ seat: p.seat, card: p.card })),
    turn,
    jodhiClaims: play.jodhiClaims.map((j) => ({
      seat: j.seat,
      suit: j.seat === seat || (trumpVisible && j.suit === play.trump) ? j.suit : null,
      withJack: j.withJack,
      points: j.points,
      trick: j.trick,
    })),
    jodhiOpenFor: play.jodhiOpenFor,
    double: play.double,
    khanaak: play.khanaak,
    deadline,
    redeal,
  }
}
