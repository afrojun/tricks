import type { Memory } from '../../../kit/module'
import { type Seat, allSeats, tableView } from '../../../kit/table'
import type { Card } from './cards'
import { type HeartsRules, PLAYERS, passDirection } from './rules'
import { takenBySeat } from './scoring'
import type { Game, RoundPlay, View, ViewPhase, ViewPlaying } from './types'

/** What one seat (or a spectator, `null`) is allowed to know about the game. */
export function viewFor(game: Game, seat: Seat | null, memory: Memory = 'table'): View {
  return {
    ...tableView(game, seat),
    rules: game.rules,
    scores: game.scores,
    roundNumber: game.roundNumber,
    direction: passDirection(game.rules, game.roundNumber),
    phase: viewPhase(game, seat, memory),
  }
}

function ownHand(hands: readonly Card[][], seat: Seat | null) {
  return { hand: seat === null ? [] : [...hands[seat]], handCounts: hands.map((h) => h.length) }
}

function viewPhase(game: Game, seat: Seat | null, memory: Memory): ViewPhase {
  const phase = game.phase
  switch (phase.kind) {
    case 'lobby':
      return { kind: 'lobby' }
    case 'passing': {
      const choice = seat === null ? null : phase.chosen[seat]
      return {
        kind: 'passing',
        ...ownHand(phase.hands, seat),
        chosen: allSeats(PLAYERS).filter((s) => phase.chosen[s] !== null),
        choice: choice === null ? null : [...choice],
      }
    }
    case 'playing':
      return viewPlay('playing', phase.play, game.rules, seat, phase.turn, null, memory)
    case 'trickPause':
      return viewPlay('trickPause', phase.play, game.rules, seat, null, phase.deadline, memory)
    case 'roundResult':
      return { kind: 'roundResult', summary: phase.summary }
    case 'gameOver':
      return { kind: 'gameOver', winner: phase.winner, summary: phase.summary }
  }
}

function viewPlay(
  kind: 'playing' | 'trickPause',
  play: RoundPlay,
  rules: HeartsRules,
  seat: Seat | null,
  turn: Seat | null,
  deadline: number | null,
  memory: Memory,
): ViewPlaying {
  return {
    kind,
    ...ownHand(play.hands, seat),
    tricks: play.tricks.map((t, i) => ({
      // Earlier tricks have been turned face down: only their winners remain known.
      plays: memory === 'full' || i === play.tricks.length - 1 ? t.plays.map((p) => ({ seat: p.seat, card: p.card })) : [],
      winner: t.winner,
    })),
    current: play.current.map((p) => ({ seat: p.seat, card: p.card })),
    turn,
    heartsBroken: play.heartsBroken,
    taken: takenBySeat(play.tricks, rules),
    received: seat === null ? [] : [...play.received[seat]],
    gave: seat === null ? [] : [...play.gave[seat]],
    deadline,
  }
}
