import { type Seat, type ViewSeat, actingHost, allSeats } from '../../../kit/table'
import type { Card } from './cards'
import { isOpeningLead, legalPlays } from './excuses'
import type { Game, View } from './types'

/** Everything the viewer may do right now. The engine validates round actions against this. */
export interface Available {
  /** The cards that may be chosen to pass, while the viewer has not chosen. */
  pass: Card[]
  /** Cards the engine will accept, including rule-breaking ones when cheating is allowed. */
  play: Card[]
  /** The subset of `play` that obeys the rules. */
  legal: Card[]
  challengePlay: Seat[]
  nextRound: boolean
  /** May say Again: a person at the table who has not yet. */
  again: boolean
  /** May start the next game now: the host. */
  rematch: boolean
  reclaimSeat: boolean
}

const NOTHING: Available = {
  pass: [],
  play: [],
  legal: [],
  challengePlay: [],
  nextRound: false,
  again: false,
  rematch: false,
  reclaimSeat: false,
}

/** What `availableActions` reads of a view. A `View` is one; the engine builds one from the game with `seenBy`. */
export interface Seen extends Pick<View, 'seat' | 'host' | 'playerCount' | 'rules'> {
  seats: readonly Pick<ViewSeat, 'kind' | 'standIn'>[]
  phase:
    | { kind: 'lobby' | 'roundResult' }
    | { kind: 'passing'; hand: Card[]; choice: readonly Card[] | null }
    | {
        kind: 'playing' | 'trickPause'
        hand: Card[]
        turn: Seat | null
        tricks: readonly unknown[]
        current: readonly { seat: Seat; card: Card }[]
        heartsBroken: boolean
      }
    | { kind: 'gameOver'; again: readonly Seat[] }
}

/**
 * What `viewFor(game, seat)` shows that `availableActions` reads, sharing the game's arrays rather than
 * copying them: the engine checks every round action against it, and a whole view costs more than the step.
 */
export function seenBy(game: Game, seat: Seat): Seen {
  const table = { seat, seats: game.seats, host: actingHost(game), playerCount: game.playerCount, rules: game.rules }
  const phase = game.phase
  switch (phase.kind) {
    case 'passing':
      return { ...table, phase: { kind: 'passing', hand: phase.hands[seat], choice: phase.chosen[seat] } }
    case 'playing':
    case 'trickPause': {
      const { hands, tricks, current, heartsBroken } = phase.play
      const turn = phase.kind === 'playing' ? phase.turn : null
      return { ...table, phase: { kind: phase.kind, hand: hands[seat], turn, tricks, current, heartsBroken } }
    }
    default:
      return { ...table, phase }
  }
}

export function availableActions(view: Seen): Available {
  const me = view.seat
  if (me === null) return NOTHING
  const out: Available = { ...NOTHING, reclaimSeat: view.seats[me].standIn }
  const phase = view.phase

  switch (phase.kind) {
    case 'passing':
      if (phase.choice === null) out.pass = phase.hand
      break
    case 'playing':
    case 'trickPause': {
      if (phase.kind === 'playing' && phase.turn === me) {
        out.legal = legalPlays(phase.hand, phase, view.rules)
        // With cheating on any card is accepted, except at the opening lead, which the table can see.
        out.play = view.rules.allowCheating && !isOpeningLead(phase) ? phase.hand : out.legal
      }
      if (view.rules.allowCheating) {
        // Once a trick has been completed, every seat has played a card this round.
        const played = phase.tricks.length > 0 ? allSeats(view.playerCount) : phase.current.map((p) => p.seat)
        out.challengePlay = played.filter((s) => s !== me).sort((a, b) => a - b)
      }
      break
    }
    case 'roundResult':
      out.nextRound = view.seats[me].kind === 'human'
      break
    case 'gameOver':
      out.again = view.seats[me].kind === 'human' && !phase.again.includes(me)
      out.rematch = view.host === me
      break
    case 'lobby':
      break
  }
  return out
}
