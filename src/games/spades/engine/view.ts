import type { Memory } from '../../../kit/module'
import { partnerOf } from '../../../kit/partners'
import { type Seat, tableView } from '../../../kit/table'
import type { Card } from './cards'
import { exchangeGiver } from './round'
import { contracts, takenBySeat } from './scoring'
import type { Exchange, Game, Out, RoundPlay, View, ViewExchange, ViewPhase, ViewPlaying } from './types'

/** What one seat (or a spectator, `null`) is allowed to know about the game. */
export function viewFor(game: Game, seat: Seat | null, memory: Memory = 'table'): View {
  return {
    ...tableView(game, seat),
    rules: game.rules,
    dealer: game.dealer,
    scores: game.scores,
    bags: game.bags,
    roundNumber: game.roundNumber,
    phase: viewPhase(game, seat, memory),
  }
}

/** The viewer's own hand, unless it has not looked at it, and everyone's hand size. */
function ownHand(hands: readonly Card[][], seat: Seat | null, looked = true) {
  return { hand: seat === null || !looked ? [] : [...hands[seat]], handCounts: hands.map((h) => h.length) }
}

const ownDiscards = (out: Out, seat: Seat | null): Card[] => (seat === null ? [] : [...out.discards[seat]])

/** The exchange, with its cards only for its two players. */
function viewExchange(exchange: Exchange, seat: Seat | null, playerCount: number): ViewExchange {
  const party = seat !== null && (seat === exchange.blind || seat === partnerOf(exchange.blind, playerCount))
  return {
    blind: exchange.blind,
    gave: party && exchange.gave !== null ? [...exchange.gave] : null,
    returned: party && exchange.returned !== null ? [...exchange.returned] : null,
  }
}

function viewPhase(game: Game, seat: Seat | null, memory: Memory): ViewPhase {
  const phase = game.phase
  switch (phase.kind) {
    case 'lobby':
      return { kind: 'lobby' }
    case 'drawing':
      return {
        kind: 'drawing',
        ...ownHand(phase.hands, seat),
        stockCount: phase.stock.length,
        top: seat !== null && seat === phase.turn ? { ...phase.stock[0] } : null,
        discards: ownDiscards(phase.out, seat),
        turn: phase.turn,
      }
    case 'calling':
      return {
        kind: 'calling',
        ...ownHand(phase.hands, seat, seat === null || phase.looked[seat]),
        discards: ownDiscards(phase.out, seat),
        calls: phase.calls.map((c) => c && { ...c }),
        looked: [...phase.looked],
        turn: phase.turn,
      }
    case 'exchanging':
      return {
        kind: 'exchanging',
        ...ownHand(phase.hands, seat),
        discards: ownDiscards(phase.out, seat),
        calls: phase.calls.map((c) => ({ ...c })),
        exchange: viewExchange(phase.exchange, seat, game.playerCount),
        turn: exchangeGiver(phase, game.playerCount),
      }
    case 'playing':
      return viewPlay('playing', phase.play, game, seat, phase.turn, null, memory)
    case 'trickPause':
      return viewPlay('trickPause', phase.play, game, seat, null, phase.deadline, memory)
    case 'roundResult':
      return { kind: 'roundResult', summary: phase.summary }
    case 'gameOver':
      return { kind: 'gameOver', winner: phase.winner, summary: phase.summary, again: phase.again }
  }
}

function viewPlay(
  kind: 'playing' | 'trickPause',
  play: RoundPlay,
  game: Game,
  seat: Seat | null,
  turn: Seat | null,
  deadline: number | null,
  memory: Memory,
): ViewPlaying {
  return {
    kind,
    ...ownHand(play.hands, seat),
    discards: ownDiscards(play.out, seat),
    calls: play.calls.map((c) => ({ ...c })),
    contracts: contracts(play.calls, play.raised, game.playerCount),
    taken: takenBySeat(play.tricks, game.playerCount),
    tricks: play.tricks.map((t, i) => ({
      // Earlier tricks have been turned face down: only their winners remain known.
      plays: memory === 'full' || i === play.tricks.length - 1 ? t.plays.map((p) => ({ seat: p.seat, card: p.card })) : [],
      winner: t.winner,
    })),
    current: play.current.map((p) => ({ seat: p.seat, card: p.card })),
    turn,
    spadesBroken: play.spadesBroken,
    settled: [...play.settled],
    nilFailed: [...play.nilFailed],
    exchange: play.exchange === null ? null : viewExchange(play.exchange, seat, game.playerCount),
    deadline,
  }
}
