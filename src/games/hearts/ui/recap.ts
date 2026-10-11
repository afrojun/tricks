/** What happened at a Hearts table while a player was away, in a few lines: who took the queen of spades, the challenges, each round's result and the game's. */
import type { GameEvent, View } from '../engine'
import type { Seat } from '../../../kit/table'
import { seatName } from '../../../ui/text'
import { headline } from './text'

export function recap(events: readonly GameEvent[], view: View, seat: Seat | null): string[] {
  const who = (s: Seat) => (s === seat ? 'You' : seatName(view, s))
  const whom = (s: Seat) => (s === seat ? 'you' : seatName(view, s))
  return events.flatMap((event): string[] => {
    switch (event.type) {
      case 'trickWon':
        return event.queen ? [`${who(event.seat)} took the queen of spades`] : []
      case 'heartsBroken':
        return ['Hearts were broken']
      case 'challengeResolved':
        return [`${who(event.challenger)} challenged ${whom(event.accused)}`]
      case 'roundScored':
        return [`Round ${event.summary.roundNumber} is over`, headline({ ...view, seat }, event.summary)]
      case 'gameOver':
        return [`${who(event.winner)} won the game`]
      default:
        return []
    }
  })
}
