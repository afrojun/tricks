/** What happened at a Thunee table while a player was away, in a few lines: the calls, the challenges, each round's result and the game's. */
import type { GameEvent, View } from '../engine'
import type { Seat } from '../../../kit/table'
import { seatName } from '../../../ui/text'
import { headline } from './RoundResult'
import { teamName } from './text'

export function recap(events: readonly GameEvent[], view: View, seat: Seat | null): string[] {
  const who = (s: Seat) => (s === seat ? 'You' : seatName(view, s))
  const whom = (s: Seat) => (s === seat ? 'you' : seatName(view, s))
  return events.flatMap((event): string[] => {
    switch (event.type) {
      case 'called':
        return [`${who(event.seat)} called ${event.amount}`]
      case 'trumpChosen':
        return [`${who(event.seat)} chose trump${event.lastCard ? ' by last card' : ''}`]
      case 'dealCancelled':
        return ['The cards were dealt again']
      case 'thuneeCalled':
        return [`${who(event.seat)} called Thunee`]
      case 'doubleCalled':
        return [`${who(event.seat)} called Double`]
      case 'khanaakCalled':
        return [`${who(event.seat)} called Khanaak`]
      case 'jodhiClaimed':
        return [`${who(event.seat)} called Jodhi ${event.points}`]
      case 'challengeResolved':
        return [`${who(event.challenger)} challenged ${whom(event.accused)}`]
      case 'roundScored': {
        const s = event.summary
        return [`Round ${s.roundNumber} is over`, headline({ ...view, seat }, s), `${teamName(view, s.winner, seat, ' and ')} won ${s.balls} ${s.balls === 1 ? 'ball' : 'balls'}`]
      }
      case 'gameOver':
        return [`${teamName(view, event.winner, seat, ' and ')} won the game`]
      default:
        return []
    }
  })
}
