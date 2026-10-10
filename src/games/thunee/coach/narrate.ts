/** What each event means for the player, from what they could see. Never a computer's private reasons. */
import { type GameEvent, type Seat, type View, teamOf } from '../engine'
import { inPlay } from '../ai/suspicion'
import type { Note } from './note'
import { runningPoints } from './reads'
import { card, isPartner, otherSide, sentence, sideDoes, sideOf, suitOne, suitPlural, target, verb, who, whoIn, whose, yourSide } from './words'

/** Events that never need a line from the coach. A card played is narrated only when it shows something. */
export const SILENT: ReadonlySet<GameEvent['type']> = new Set(['seatChanged', 'passed'])

export function narrate(event: GameEvent, view: View): Note | null {
  const note = (title: string, body: string, extra: Partial<Note> = {}): Note => ({ tone: 'info', title, body, ...extra })
  const name = (seat: Seat) => who(view, seat)
  const side = (seat: Seat) => sideOf(view, teamOf(seat))

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
        ? `If ${sideDoes(view, teamOf(event.seat), 'keeps', 'keep')} the call, those ${event.amount} points count for ${otherSide(view)}.`
        : `If they keep the call, those ${event.amount} points count for ${yourSide(view)}.`
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
    case 'dealCancelled': {
      const caller = event.thuneeCaller
      if (caller === null || caller === undefined) {
        const counting = view.playerCount === 2 ? 'The counting player held no trump in either half' : 'The counting side held no trump'
        return note('Dealt again', `${counting}, so the round is dealt again.`)
      }
      const body =
        view.seat !== null && teamOf(caller) !== teamOf(view.seat)
          ? 'Your side held no trump, so nobody could stop the Thunee. The round is dealt again.'
          : `Neither opponent held trump, so nobody could stop ${whose(view, caller).replace(/^Your$/, 'your')} Thunee. The round is dealt again.`
      return note('Dealt again', body)
    }
    case 'thuneeCalled': {
      const caller = name(event.seat)
      const body =
        event.seat === view.seat
          ? `You must now win all six tricks yourself. Lose one and ${otherSide(view)} gets 4 balls.`
          : isPartner(view, event.seat)
            ? `${caller} must win all six tricks alone. Do not take a trick from them: if you win one, the other side gets ${view.rules.thuneePartnerCatchBalls} balls.`
            : `${caller} must win all six tricks alone. Take one trick to stop it, and ${sideDoes(view, teamOf(view.seat ?? 0), 'gets', 'get')} 4 balls.`
      return note(`${caller} ${verb(view, event.seat, 'call', 'calls')} Thunee`, body, { topic: 'thunee', seats: [event.seat] })
    }
    case 'trumpRevealed':
      return note(`Trump is ${suitPlural(event.suit)}`, `Any ${suitOne(event.suit)} beats every card of another suit.`, { topic: 'trump' })
    case 'cardPlayed':
      return cardPlayed(view, event.seat, event.card)
    case 'trickWon':
      return trickWon(view, event.seat, event.points)
    case 'jodhiClaimed':
      return note(
        `${name(event.seat)} ${verb(view, event.seat, 'call', 'calls')} Jodhi`,
        `The king and queen of ${event.points >= 40 ? 'trump' : 'a suit nobody is told'}${event.withJack ? ', with the jack' : ''}: ${event.points} points to ${side(event.seat)}. Nobody checks a Jodhi unless someone challenges it${event.points >= 40 ? '' : ', so watch the kings and queens played to work out whether it can be true'}.`,
        { topic: 'jodhi', seats: [event.seat] },
      )
    case 'doubleCalled':
      return note(`${name(event.seat)} ${verb(view, event.seat, 'call', 'calls')} Double`, `${sentence(side(event.seat))} won the first five tricks. If ${name(event.seat) === 'You' ? 'you win' : `${name(event.seat)} wins`} the last trick too, that is 2 balls; if not, 4 balls the other way.`, { topic: 'double' })
    case 'khanaakCalled': {
      const mine = view.seat !== null && teamOf(event.seat) === teamOf(view.seat)
      const [callers, others] = mine ? ['your side’s', 'the other side’s'] : ['their side’s', 'your side’s']
      const winner = event.seat === view.seat ? 'you win' : `${name(event.seat)} wins`
      return note(
        `${name(event.seat)} ${verb(view, event.seat, 'call', 'calls')} Khanaak`,
        `It comes off only if ${winner} the last trick and ${callers} Jodhi plus 10 is more than ${others} card points plus Jodhi. The amount called is left out.`,
        { topic: 'khanaak', seats: [event.seat] },
      )
    }
    case 'challengeResolved': {
      const accused = name(event.accused)
      const verdict = event.guilty
        ? `${accused} broke the rules, so ${sideDoes(view, teamOf(event.challenger), 'wins', 'win')} 4 balls.`
        : `${accused} played by the rules, so the challenge was wrong and ${sideDoes(view, teamOf(event.accused), 'wins', 'win')} 4 balls.`
      return note(`${name(event.challenger)} ${verb(view, event.challenger, 'challenge', 'challenges')} ${whoIn(view, event.accused)}`, `${verdict} The round ends here.`, { topic: 'challenge', tone: 'warn' })
    }
    case 'roundScored':
      return note('Round over', `${sentence(sideDoes(view, event.summary.winner, 'takes', 'take'))} ${event.summary.balls === 1 ? '1 ball' : `${event.summary.balls} balls`}. The coach’s review explains why.`, { topic: 'balls' })
    case 'gameOver':
      return note('Game over', `${sentence(sideDoes(view, event.winner, 'reaches', 'reach'))} the target and ${sideOf(view, event.winner) === 'you' ? 'win' : 'wins'} the game.`)
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
    body: `${who(view, seat)} played ${card(played as never)}${trumped ? ', a trump,' : ''} on a ${suitOne(led)} lead, so they hold no ${suitPlural(led)}. Remember it: they cannot follow ${suitPlural(led)} again this ${view.playerCount === 2 ? 'half' : 'round'}.`,
    seats: [seat],
  }
}

function trickWon(view: View, winner: Seat, pts: number): Note {
  const phase = inPlay(view)
  const trick = phase?.tricks.at(-1)
  const winning = trick?.plays.find((p) => p.seat === winner)?.card
  const led = trick?.plays[0]?.card.suit
  const to = `${pts} points to ${sideOf(view, teamOf(winner))}.`
  let taken = to
  if (winning && led) {
    const why = phase?.trump && winning.suit === phase.trump && led !== phase.trump ? 'a trump' : `the highest ${suitOne(led)}`
    taken = `${card(winning)}, ${why}, takes it: ${to}`
  }
  const totals = runningPoints(view)
  const thunee = phase?.thunee ?? null
  const counting = phase ? 1 - teamOf(phase.trumper) : null
  const mine = view.seat === null ? 0 : teamOf(view.seat)
  const standing =
    thunee !== null
      ? ` ${who(view, thunee.caller)} ${verb(view, thunee.caller, 'have', 'has')} won ${phase!.tricks.filter((t) => t.winner === thunee.caller).length} of 6 tricks.`
      : counting === null
      ? ''
      : ` In card points ${sideDoes(view, mine, 'has', 'have')} ${totals[mine]} and ${otherSide(view)} ${totals[1 - mine]}. ${sentence(sideDoes(view, counting, 'is', 'are'))} counting and ${sideOf(view, counting) === 'you' ? 'need' : 'needs'} ${target(view)}.`
  return {
    tone: 'info',
    title: `${who(view, winner)} ${verb(view, winner, 'win', 'wins')} the trick`,
    body: `${taken}${standing}`,
    seats: [winner],
    cards: winning ? [winning] : undefined,
    topic: 'counting',
  }
}
