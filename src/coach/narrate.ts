/** What each event means for the player, from what they could see. Never a computer's private reasons. */
import { type GameEvent, type Seat, type View, FOUR_PLAYER_TARGET, SUIT_NAME, teamOf } from '../engine'
import { inPlay } from '../ai/suspicion'
import type { Note } from './note'
import { runningPoints } from './reads'
import { card, sentence, suitPlural, verb, who } from './words'

/** Events that never need a line from the coach. A card played is narrated only when it shows something. */
export const SILENT: ReadonlySet<GameEvent['type']> = new Set(['seatChanged', 'passed'])

export function narrate(event: GameEvent, view: View): Note | null {
  const note = (title: string, body: string, extra: Partial<Note> = {}): Note => ({ tone: 'info', title, body, ...extra })
  const name = (seat: Seat) => who(view, seat)
  const side = (seat: Seat) => (view.seat !== null && teamOf(seat) === teamOf(view.seat) ? 'your side' : 'the other side')

  switch (event.type) {
    case 'seatChanged':
    case 'passed':
      return null
    case 'dealt':
      if (event.half === 2) return note('Second half', 'Six new cards each from the rest of the deck. Play another six tricks.', { topic: 'twoPlayer' })
      return note(`Round ${event.roundNumber}`, `${name(event.dealer)} ${verb(view, event.dealer, 'deal', 'deals')}. Look at your first four cards: are they strong enough to call?`, { topic: 'calling' })
    case 'called': {
      const mine = view.seat !== null && teamOf(event.seat) === teamOf(view.seat)
      const effect = mine
        ? `If your side keeps the call, those ${event.amount} points count for the other side.`
        : `If they keep the call, those ${event.amount} points count for your side.`
      return note(`${name(event.seat)} ${verb(view, event.seat, 'call', 'calls')} ${event.amount}`, `${sentence(name(event.seat) === 'You' ? 'you want' : 'they want')} to choose trump. ${effect}`, { topic: 'calling', seats: [event.seat] })
    }
    case 'trumpChosen':
      return note(
        'Trump chosen',
        event.seat === view.seat
          ? `You have chosen trump${event.lastCard ? ' by last card' : ''}. Nobody else knows it until the first card is led.`
          : `${name(event.seat)} has chosen trump${event.lastCard ? ' by last card' : ''}. It stays hidden until the first card is led.`,
        { topic: 'trump', seats: [event.seat] },
      )
    case 'dealCancelled':
      return note('Dealt again', 'The counting side held no trump at all, so the round is dealt again.')
    case 'thuneeCalled':
      return note(
        `${name(event.seat)} ${verb(view, event.seat, 'call', 'calls')} Thunee`,
        `${event.seat === view.seat ? 'You' : 'They'} must now win all six tricks alone. Win one trick to stop it.`,
        { topic: 'thunee', seats: [event.seat] },
      )
    case 'trumpRevealed':
      return note(`Trump is ${SUIT_NAME[event.suit]}`, `Any ${suitPlural(event.suit).replace(/s$/, '')} beats every card of another suit.`, { topic: 'trump' })
    case 'cardPlayed':
      return cardPlayed(view, event.seat, event.card)
    case 'trickWon':
      return trickWon(view, event.seat, event.points)
    case 'jodhiClaimed':
      return note(
        `${name(event.seat)} ${verb(view, event.seat, 'call', 'calls')} Jodhi`,
        `The king and queen of ${suitPlural(event.suit)}${event.withJack ? ' with the jack' : ''}: ${event.points} points to ${side(event.seat)}. Nobody checks a Jodhi unless someone challenges it.`,
        { topic: 'jodhi', seats: [event.seat] },
      )
    case 'doubleCalled':
      return note(`${name(event.seat)} ${verb(view, event.seat, 'call', 'calls')} Double`, `${sentence(side(event.seat))} won the first five tricks. If ${name(event.seat) === 'You' ? 'you win' : `${name(event.seat)} wins`} the last trick too, that is 2 balls; if not, 4 balls the other way.`, { topic: 'double' })
    case 'khanaakCalled':
      return note(`${name(event.seat)} ${verb(view, event.seat, 'call', 'calls')} Khanaak`, `${sentence(side(event.seat))} is betting its Jodhi plus 10 beats everything the other side has, and that the last trick is theirs.`, { topic: 'khanaak' })
    case 'challengeResolved': {
      const accused = name(event.accused)
      const verdict = event.guilty
        ? `${accused} ${verb(view, event.accused, 'had', 'had')} broken the rules, so ${side(event.challenger)} wins 4 balls.`
        : `${accused} ${verb(view, event.accused, 'had', 'had')} played fairly, so the challenge was wrong and ${side(event.accused)} wins 4 balls.`
      return note(`${name(event.challenger)} ${verb(view, event.challenger, 'challenge', 'challenges')} ${event.accused === view.seat ? 'you' : accused}`, `${verdict} The round ends here.`, { topic: 'challenge', tone: 'warn' })
    }
    case 'roundScored':
      return note('Round over', `${sentence(view.seat !== null && event.summary.winner === teamOf(view.seat) ? 'your side' : 'the other side')} ${event.summary.balls === 1 ? 'takes 1 ball' : `takes ${event.summary.balls} balls`}. The review below explains why.`, { topic: 'balls' })
    case 'gameOver':
      return note('Game over', view.seat !== null && event.winner === teamOf(view.seat) ? 'Your side reached the target and wins the game.' : 'The other side reached the target and wins the game.')
  }
}

function cardPlayed(view: View, seat: Seat, played: { suit: string; rank: string }): Note | null {
  if (seat === view.seat) return null
  const phase = inPlay(view)
  if (phase === null) return null
  const trick = phase.current.length > 0 ? phase.current : (phase.tricks.at(-1)?.plays ?? [])
  const at = trick.findIndex((p) => p.seat === seat && p.card.suit === played.suit && p.card.rank === played.rank)
  if (at <= 0) return null
  const led = trick[0].card.suit
  if (played.suit === led) return null
  const trumped = phase.trump !== null && played.suit === phase.trump
  return {
    tone: 'info',
    title: `${who(view, seat)} has no ${suitPlural(led)}`,
    body: `${who(view, seat)} played ${card(played as never)} on a ${SUIT_NAME[led].toLowerCase().replace(/s$/, '')} lead${trumped ? ', a trump' : ''}, so has none left. Remember it: they cannot follow ${suitPlural(led)} again this half.`,
    seats: [seat],
  }
}

function trickWon(view: View, winner: Seat, pts: number): Note {
  const phase = inPlay(view)
  const trick = phase?.tricks.at(-1)
  const winning = trick?.plays.find((p) => p.seat === winner)?.card
  const led = trick?.plays[0]?.card.suit
  let why = ''
  if (winning && led) {
    why = phase?.trump && winning.suit === phase.trump && led !== phase.trump ? ' A trump beats every other suit.' : ` It was the highest ${SUIT_NAME[led].toLowerCase().replace(/s$/, '')}.`
  }
  const target = view.playerCount === 2 ? view.rules.twoPlayerTarget : FOUR_PLAYER_TARGET
  const totals = runningPoints(view)
  const counting = phase ? 1 - teamOf(phase.trumper) : null
  const mine = view.seat === null ? 0 : teamOf(view.seat)
  const standing =
    counting === null
      ? ''
      : ` In card points your side has ${totals[mine]} and the other side ${totals[1 - mine]}. ${counting === mine ? 'Your side is counting and needs' : 'The other side is counting and needs'} ${target}.`
  return {
    tone: 'info',
    title: `${who(view, winner)} ${verb(view, winner, 'win', 'wins')} the trick`,
    body: `${winning ? `${card(winning)} takes it.` : ''}${why} ${pts} points to ${view.seat !== null && teamOf(winner) === teamOf(view.seat) ? 'your side' : 'the other side'}.${standing}`.trim(),
    seats: [winner],
    cards: winning ? [winning] : undefined,
    topic: 'counting',
  }
}
