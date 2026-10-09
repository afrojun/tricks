/** What each event means for the player, from what they could see. Never a computer's private reasons. */
import type { Note } from '../../../kit/coach'
import type { Seat } from '../../../kit/table'
import { CHALLENGE_POINTS, type GameEvent, type View } from '../engine'
import type { TopicId } from './topics'
import { list, points, who } from './words'

const FROM = { left: 'from the right', right: 'from the left', across: 'from across the table' } as const

export function narrate(event: GameEvent, view: View): Note | null {
  const note = (title: string, body: string, topic: TopicId, seats: Seat[] = []): Note => ({ tone: 'info', title, body, topic, ...(seats.length > 0 ? { seats } : {}) })
  const verb = (seat: Seat, you: string, they: string) => (seat === view.seat ? you : they)
  /** The seat named mid-sentence. */
  const them = (seat: Seat) => (seat === view.seat ? 'you' : who(view, seat))

  switch (event.type) {
    case 'passesExchanged': {
      const phase = view.phase
      if ((phase.kind !== 'playing' && phase.kind !== 'trickPause') || view.direction === 'none' || phase.received.length === 0) return null
      return { ...note('Cards passed', `You were given ${list(phase.received)} ${FROM[view.direction]}.`, 'passing'), cards: phase.received }
    }
    case 'heartsBroken':
      return note('Hearts are broken', 'A heart has been played, so from now on anyone may lead hearts.', 'heartsBroken')
    case 'trickWon':
      return note(
        `${who(view, event.seat)} ${verb(event.seat, 'win', 'wins')} the trick`,
        event.points === 0 ? 'It held no points.' : `${who(view, event.seat)} ${verb(event.seat, 'take', 'takes')} ${points(event.points)}.`,
        'tricks',
        [event.seat],
      )
    case 'challengeResolved': {
      const penalised = event.guilty ? event.accused : event.challenger
      const verdict = event.guilty ? `${who(view, event.accused)} broke a rule` : `${who(view, event.accused)} played by the rules`
      return note(
        `${who(view, event.challenger)} ${verb(event.challenger, 'challenge', 'challenges')}`,
        `${verdict}, so ${them(penalised)} ${verb(penalised, 'take', 'takes')} ${CHALLENGE_POINTS}.`,
        'challenge',
        [event.challenger, event.accused],
      )
    }
    case 'roundScored': {
      const { moon } = event.summary
      if (moon === null) return null
      const others = view.rules.moon === 'othersAdd' ? 'everyone else takes 26' : `${them(moon)} ${verb(moon, 'take', 'takes')} off 26`
      return note(`${who(view, moon)} shot the moon`, `${who(view, moon)} took every point, so ${others}.`, 'moon', [moon])
    }
    default:
      return null
  }
}
