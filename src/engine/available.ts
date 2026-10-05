import { type Card, type Suit, SUITS } from './cards'
import { callAmounts, mayCall, prospectiveTrumper, thuneeEligible, trumpChoices } from './predicates'
import { type Seat, teamOf } from './seats'
import { legalPlays } from './tricks'
import type { TrumpChoice, View } from './types'

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
  nextRound: boolean
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
  nextRound: false,
  rematch: false,
  reclaimSeat: false,
}

export function availableActions(view: View): Available {
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
      const tricksThisHalf = phase.tricks.filter((t) => t.half === phase.half)
      const special = phase.thunee !== null || phase.double !== null || phase.khanaak !== null

      if (phase.kind === 'playing' && phase.turn === me) {
        out.legal = legalPlays(
          phase.hand,
          phase.current.map((p) => p.card),
          phase.trump,
          view.rules,
        )
        out.play = view.rules.allowCheating ? phase.hand : out.legal
        const lastTrick = view.playerCount === 4 && tricksThisHalf.length === 5 && !special
        if (lastTrick) {
          const wonAllFive = tricksThisHalf.every((t) => teamOf(t.winner) === myTeam)
          const cornerHouse = view.balls[myTeam] === view.ballsTarget - 1
          out.callDouble = view.rules.double && wonAllFive && !cornerHouse
          out.callKhanaak = phase.jodhiClaims.some((j) => teamOf(j.seat) === myTeam)
        }
      }

      if (phase.jodhiOpenFor === myTeam && phase.thunee === null) {
        const mine = phase.jodhiClaims.filter((j) => j.seat === me).map((j) => j.suit)
        out.claimJodhi = SUITS.filter((s) => !mine.includes(s))
      }

      if (view.rules.allowCheating) {
        // Once a trick has been completed, every seat has played a card this round.
        const played = phase.tricks.length > 0 ? view.seats.map((_, seat) => seat) : phase.current.map((p) => p.seat)
        out.challengePlay = played.filter((s) => teamOf(s) !== myTeam).sort()
        out.challengeJodhi = phase.jodhiClaims.flatMap((j, i) => (teamOf(j.seat) !== myTeam ? [i] : []))
      }
      break
    }
    case 'roundResult':
      out.nextRound = view.seats[me].kind === 'human'
      break
    case 'gameOver':
      out.rematch = view.host === me
      break
    case 'lobby':
      break
  }
  return out
}
