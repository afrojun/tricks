import { actingHost } from '../../../kit/table'
import { type Card, type Suit, SUITS } from './cards'
import { type CallState, ballsTarget, callAmounts, mayCall, pauseWaitingOn, prospectiveTrumper, thuneeEligible, trumpChoices } from './predicates'
import { type Seat, type Team, teamOf } from './seats'
import { legalPlays } from './tricks'
import type { Game, TrumpChoice, View, ViewSeat } from './types'

/** Everything the viewer may do right now. The engine validates round actions against this. */
export interface Available {
  calls: number[]
  pass: boolean
  preselect: TrumpChoice[]
  chooseTrump: TrumpChoice[]
  callThunee: boolean
  /** Cards the engine will accept, including rule-breaking ones when cheating is allowed. */
  play: Card[]
  /** The subset of `play` that obeys the rules. */
  legal: Card[]
  claimJodhi: Suit[]
  callDouble: boolean
  callKhanaak: boolean
  challengePlay: Seat[]
  challengeJodhi: number[]
  /** That the Thunee caller held six cards of one suit. */
  challengeThunee: boolean
  nextRound: boolean
  /** May say Again: a person at the table who has not yet. */
  again: boolean
  /** May start the next game now: the host. */
  rematch: boolean
  reclaimSeat: boolean
}

const NOTHING: Available = {
  calls: [],
  pass: false,
  preselect: [],
  chooseTrump: [],
  callThunee: false,
  play: [],
  legal: [],
  claimJodhi: [],
  callDouble: false,
  callKhanaak: false,
  challengePlay: [],
  challengeJodhi: [],
  challengeThunee: false,
  nextRound: false,
  again: false,
  rematch: false,
  reclaimSeat: false,
}

/** What `availableActions` reads of a view. A `View` is one; the engine builds one from the game with `seenBy`. */
export interface Seen extends Pick<View, 'seat' | 'host' | 'playerCount' | 'rules' | 'balls' | 'ballsTarget'> {
  seats: readonly Pick<ViewSeat, 'kind' | 'standIn'>[]
  phase:
    | { kind: 'lobby' | 'roundResult' }
    | ({ kind: 'calling'; hand: readonly Card[] } & CallState)
    | { kind: 'trumpSelection'; hand: readonly Card[]; trumper: Seat }
    | { kind: 'thuneeWindow'; hand: readonly Card[]; trumper: Seat; pending: Seat | null; passed: readonly Seat[] }
    | {
        kind: 'playing' | 'trickPause'
        hand: Card[]
        trump: Suit | null
        thunee: { caller: Seat } | null
        half: 1 | 2
        tricks: readonly { winner: Seat; half: 1 | 2 }[]
        current: readonly { seat: Seat; card: Card }[]
        turn: Seat | null
        jodhiClaims: readonly { seat: Seat; suit: Suit | null }[]
        jodhiOpenFor: Team | null
        double: { caller: Seat } | null
        khanaak: { caller: Seat } | null
        deadline: number | null
        redeal: boolean
      }
    | { kind: 'gameOver'; again: readonly Seat[] }
}

/**
 * What `viewFor(game, seat)` shows that `availableActions` reads, sharing the game's arrays rather than
 * copying them: the engine checks every round action against it, and a whole view costs more than the step.
 * Its tricks and claims are the game's own, with the cards and suits a view hides, none of which
 * `availableActions` reads: it reads the suits of the viewer's own claims alone.
 */
export function seenBy(game: Game, seat: Seat): Seen {
  const table = {
    seat,
    seats: game.seats,
    host: actingHost(game),
    playerCount: game.playerCount,
    rules: game.rules,
    balls: game.balls,
    ballsTarget: ballsTarget(game.rules, game.khanaakCalled),
  }
  const phase = game.phase
  switch (phase.kind) {
    case 'calling': {
      const { defaultTrumper, call, passed } = phase
      return { ...table, phase: { kind: 'calling', hand: phase.hands[seat], defaultTrumper, call, passed } }
    }
    case 'trumpSelection':
      return { ...table, phase: { kind: 'trumpSelection', hand: phase.hands[seat], trumper: phase.trumper } }
    case 'thuneeWindow': {
      const { trumper, pending, passed } = phase
      return { ...table, phase: { kind: 'thuneeWindow', hand: phase.hands[seat], trumper, pending, passed } }
    }
    case 'playing':
    case 'trickPause': {
      const { hands, trumper, trump, trumpRevealed, thunee, half, tricks, current, jodhiClaims, jodhiOpenFor, double, khanaak } = phase.play
      const trumpVisible = trumpRevealed || (seat === trumper && thunee === null)
      return {
        ...table,
        phase: {
          kind: phase.kind,
          hand: hands[seat],
          trump: trumpVisible ? trump : null,
          thunee,
          half,
          tricks,
          current,
          turn: phase.kind === 'playing' ? phase.turn : null,
          jodhiClaims,
          jodhiOpenFor,
          double,
          khanaak,
          deadline: phase.kind === 'trickPause' ? phase.deadline : null,
          redeal: phase.kind === 'trickPause' && phase.redeal,
        },
      }
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
  const myTeam = teamOf(me)

  switch (phase.kind) {
    case 'calling': {
      if (mayCall(me, phase)) {
        out.calls = callAmounts(phase)
        out.pass = true
      }
      if (prospectiveTrumper(phase) === me) out.preselect = trumpChoices(phase.hand)
      break
    }
    case 'trumpSelection': {
      if (phase.trumper === me) out.chooseTrump = trumpChoices(phase.hand)
      break
    }
    case 'thuneeWindow': {
      const eligible = thuneeEligible(me, phase.hand, phase.trumper, view.rules)
      const undecided = eligible && !phase.passed.includes(me) && phase.pending !== me
      if (undecided) {
        out.pass = true
        // A held call can only be overridden by the trumper's team.
        out.callThunee = phase.pending === null || myTeam === teamOf(phase.trumper)
      }
      break
    }
    case 'playing':
    case 'trickPause': {
      if (phase.kind === 'playing' && phase.turn === me) {
        out.legal = legalPlays(
          phase.hand,
          phase.current.map((p) => p.card),
          phase.trump,
          view.rules,
        )
        out.play = view.rules.allowCheating ? phase.hand : out.legal
        const tricksThisHalf = phase.tricks.filter((t) => t.half === phase.half)
        const special = phase.thunee !== null || phase.double !== null || phase.khanaak !== null
        const lastTrick = view.playerCount === 4 && tricksThisHalf.length === 5 && !special
        if (lastTrick) {
          const wonAllFive = tricksThisHalf.every((t) => teamOf(t.winner) === myTeam)
          const cornerHouse = view.balls[myTeam] === view.ballsTarget - 1
          out.callDouble = view.rules.double && wonAllFive && !cornerHouse
          out.callKhanaak = phase.jodhiClaims.some((j) => teamOf(j.seat) === myTeam)
        }
      }

      if (phase.jodhiOpenFor === myTeam && phase.thunee === null) {
        const mine = phase.jodhiClaims.flatMap((j) => (j.seat === me && j.suit !== null ? [j.suit] : []))
        out.claimJodhi = SUITS.filter((s) => !mine.includes(s))
      }
      // A pause waiting on this seat ends when they answer: "No Jodhi", or deal again.
      if (phase.kind === 'trickPause' && pauseWaitingOn(phase, view.playerCount).includes(me)) out.pass = true

      if (view.rules.allowCheating) {
        // Once a trick has been completed, every seat has played a card this round.
        const played = phase.tricks.length > 0 ? view.seats.map((_, seat) => seat) : phase.current.map((p) => p.seat)
        out.challengePlay = played.filter((s) => teamOf(s) !== myTeam).sort((a, b) => a - b)
        out.challengeJodhi = phase.jodhiClaims.flatMap((j, i) => (teamOf(j.seat) !== myTeam ? [i] : []))
        out.challengeThunee = phase.thunee !== null && teamOf(phase.thunee.caller) !== myTeam
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
