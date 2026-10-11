/** What happened at a Spades table while a player was away, in a few lines: the calls, a Nil broken, a contract made, the challenges, each round's result and the game's. */
import type { GameEvent, View } from '../engine'
import type { Seat } from '../../../kit/table'
import { seatName } from '../../../ui/text'
import { callText, headline, sideName } from './text'

export function recap(events: readonly GameEvent[], view: View, seat: Seat | null): string[] {
  const seen = { ...view, seat }
  const who = (s: Seat) => (s === seat ? 'You' : seatName(view, s))
  const whom = (s: Seat) => (s === seat ? 'you' : seatName(view, s))
  const whose = (s: Seat) => (s === seat ? 'Your' : `${seatName(view, s)}’s`)
  return events.flatMap((event): string[] => {
    switch (event.type) {
      case 'called':
        return [`${who(event.seat)} called ${callText(event.call)}`]
      case 'nilBroken':
        return [`${whose(event.seat)} Nil was broken`]
      case 'contractMade':
        return [`${sideName(seen, event.side)} made the call`]
      case 'challengeResolved':
        return [`${who(event.challenger)} challenged ${whom(event.accused)}`]
      case 'roundScored':
        return [`Round ${event.summary.roundNumber} is over`, headline(seen, event.summary)]
      case 'gameOver':
        return [`${sideName(seen, event.winner)} won the game`]
      default:
        return []
    }
  })
}
