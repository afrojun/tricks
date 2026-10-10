/** What each event means for the player, from what they could see. Never a computer's private reasons. */
import type { Note } from '../../../kit/coach'
import type { Seat } from '../../../kit/table'
import { type GameEvent, type View, seatsOf, sideOf } from '../engine'
import type { TopicId } from './topics'
import { sideWho, whom, who } from './words'

export function narrate(event: GameEvent, view: View): Note | null {
  const note = (title: string, body: string, topic: TopicId, seats: Seat[] = []): Note => ({ tone: 'info', title, body, topic, ...(seats.length > 0 ? { seats } : {}) })
  const verb = (seat: Seat, you: string, they: string) => (seat === view.seat ? you : they)
  switch (event.type) {
    case 'called':
      if (event.call.tricks > 0) return null
      return note(`${who(view, event.seat)} ${verb(event.seat, 'call', 'calls')} ${event.call.blind ? 'Blind nil' : 'Nil'}`, `${who(view, event.seat)} will try to take no tricks at all.`, 'nil', [event.seat])
    case 'spadesBroken':
      return note('Spades are broken', 'A spade has been played, so from now on anyone may lead spades.', 'tricks')
    case 'nilBroken':
      const blind = 'calls' in view.phase && view.phase.calls[event.seat]?.blind
      return note('Nil broken', `${who(view, event.seat)} took a trick, so the ${blind ? 'Blind nil costs 200' : 'Nil costs 100'}.`, 'nil', [event.seat])
    case 'contractMade': {
      const seats = seatsOf(event.side, view.playerCount)
      const mine = view.seat !== null && seats.includes(view.seat)
      const made = seats.length > 1 ? `${sideWho(view, seats).name} have made their call.` : `${who(view, seats[0])} has made the call.`
      return note(mine ? 'Your call is made' : 'A call is made', mine ? 'Every trick from here is a bag: try to lose them.' : made, 'bags', seats)
    }
    case 'challengeResolved': {
      const atFault = event.guilty ? event.accused : event.challenger
      const side = sideWho(view, seatsOf(sideOf(atFault, view.playerCount), view.playerCount))
      const sideName = side.name === 'You' || side.name === 'Your side' ? side.name.toLowerCase() : side.name
      const cost =
        event.effect === 'set'
          ? `${sideName} ${side.many ? 'are' : 'is'} set`
          : event.effect === 'nilFailed'
            ? `${whom(view, atFault)} ${verb(atFault, 'lose', 'loses')} the Nil`
            : `${sideName} must take three more tricks`
      return note(
        `${who(view, event.challenger)} ${verb(event.challenger, 'challenge', 'challenges')} ${whom(view, event.accused)}`,
        `${who(view, event.accused)} ${event.guilty ? 'broke a rule' : 'played by the rules'}, so ${cost}.`,
        'challenge',
        [event.challenger, event.accused],
      )
    }
    default:
      return null
  }
}
