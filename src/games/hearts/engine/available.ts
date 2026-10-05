import { type Seat, allSeats } from '../../../kit/table'
import type { Card } from './cards'
import { isOpeningLead, legalPlays } from './excuses'
import type { View } from './types'

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
  rematch: boolean
  reclaimSeat: boolean
}

const NOTHING: Available = {
  pass: [],
  play: [],
  legal: [],
  challengePlay: [],
  nextRound: false,
  rematch: false,
  reclaimSeat: false,
}

export function availableActions(view: View): Available {
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
      out.rematch = view.host === me
      break
    case 'lobby':
      break
  }
  return out
}
