import { partnerOf } from '../../../kit/partners'
import { type Seat, allSeats } from '../../../kit/table'
import type { Card } from './cards'
import { forcedCard, legalPlays } from './excuses'
import { blindNilOpen, handSize } from './rules'
import type { View } from './types'

/** Everything the viewer may do right now. The engine validates round actions against this. */
export interface Available {
  /** May draw: the viewer's turn while drawing. */
  draw: boolean
  /** May turn up a hand dealt face down. */
  look: boolean
  /** The numbers of tricks the viewer may call now; 0 is Nil. */
  calls: number[]
  /** May call Blind nil now: its turn, its hand unseen, its side far enough behind, and its partner not blind. */
  blindNil: boolean
  /** The cards the viewer may give in a Blind nil exchange, while it is the one to give. */
  give: Card[]
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
  draw: false,
  look: false,
  calls: [],
  blindNil: false,
  give: [],
  play: [],
  legal: [],
  challengePlay: [],
  nextRound: false,
  again: false,
  rematch: false,
  reclaimSeat: false,
}

/** 1 up to the hand size, and 0 for Nil when the rules allow it. */
export function callRange(view: Pick<View, 'rules' | 'playerCount'>): number[] {
  const out: number[] = []
  for (let n = view.rules.nil ? 0 : 1; n <= handSize(view.playerCount); n++) out.push(n)
  return out
}

export function availableActions(view: View): Available {
  const me = view.seat
  if (me === null) return NOTHING
  const out: Available = { ...NOTHING, reclaimSeat: view.seats[me].standIn }
  const phase = view.phase

  switch (phase.kind) {
    case 'drawing':
      out.draw = phase.turn === me
      break
    case 'calling': {
      const looked = phase.looked[me]
      out.look = !looked
      if (phase.turn !== me) break
      if (looked) out.calls = callRange(view)
      else {
        const partner = partnerOf(me, view.playerCount)
        out.blindNil = blindNilOpen(view.rules, view.playerCount, view.scores, me) && (partner === null || !phase.calls[partner]?.blind)
      }
      break
    }
    case 'exchanging':
      if (phase.turn === me) out.give = phase.hand
      break
    case 'playing':
    case 'trickPause': {
      if (phase.kind === 'playing' && phase.turn === me) {
        out.legal = legalPlays(phase.hand, phase, view.rules, view.playerCount)
        // With cheating on any card is accepted, except a forced opening lead, which the table can see.
        const forced = forcedCard(phase.hand, phase, view.rules, view.playerCount) !== null
        out.play = view.rules.allowCheating && !forced ? phase.hand : out.legal
      }
      if (view.rules.allowCheating) {
        // Each seat plays once a trick: those with a card on the table have played one more.
        const played = (s: Seat) => phase.tricks.length + (phase.current.some((p) => p.seat === s) ? 1 : 0)
        out.challengePlay = allSeats(view.playerCount).filter((s) => s !== me && played(s) > phase.settled[s])
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
