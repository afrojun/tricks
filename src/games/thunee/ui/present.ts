import type { GameEvent, Seat, View } from '../engine'
import type { NumberedEvent } from '../../../protocol'
import type { Moment } from '../../../ui/Moments'
import { playSound } from '../../../ui/sound'
import { SUIT_NAME, seatName } from '../../../ui/text'

export const CHALLENGE_BEAT_MS = 1000
export const VERDICT_BEAT_MS = 1300

export interface Presentation {
  toast?: string
  moments?: Moment[]
}

/** Turns one game event into a sound and, where it helps, a toast or a moment in the middle of the table. */
export function present(event: NumberedEvent<GameEvent>, view: View, seat: Seat | null): Presentation {
  const name = (s: Seat) => (s === seat ? 'You' : seatName(view, s))
  const verb = (s: Seat, you: string, they: string) => (s === seat ? you : they)
  const call = (s: Seat, what: string, detail?: string, ms = 1500): Presentation => {
    playSound('call')
    return { moments: [{ title: what, detail: detail ?? `${name(s)} ${verb(s, 'call', 'calls')} it`, tone: 'call', ms }] }
  }
  switch (event.type) {
    case 'dealt':
      playSound('deal')
      return event.half === 2 ? { toast: 'Second half: six new cards each.' } : {}
    case 'called':
      playSound('call')
      return {} // shown at the caller's seat
    case 'trumpChosen':
      return { toast: `${name(event.seat)} ${verb(event.seat, 'have', 'has')} chosen trump${event.lastCard ? ' by last card' : ''}.` }
    case 'dealCancelled':
      return { toast: 'The counting side holds no trump. Dealing again.' }
    case 'trumpRevealed':
      return { toast: `Trump is ${SUIT_NAME[event.suit]}.` }
    case 'cardPlayed':
      playSound('cardPlay')
      return {}
    case 'trickWon':
      if (seat !== null && event.seat % 2 === seat % 2) playSound('trickWin')
      return {}
    case 'thuneeCalled':
      return call(event.seat, 'Thunee', undefined, 1700)
    case 'doubleCalled':
      return call(event.seat, 'Double')
    case 'khanaakCalled':
      return call(event.seat, 'Khanaak')
    case 'jodhiClaimed':
      return call(
        event.seat,
        `Jodhi ${event.points}`,
        `${name(event.seat)} ${verb(event.seat, 'hold', 'holds')} King and Queen${event.withJack ? ' with the Jack' : ''} of ${SUIT_NAME[event.suit]}`,
        2600,
      )
    case 'challengeResolved':
      playSound('challenge')
      return {
        moments: [{ title: 'Challenge', detail: `${name(event.challenger)} ${verb(event.challenger, 'challenge', 'challenges')} ${seatName(view, event.accused)}`, tone: 'danger', ms: CHALLENGE_BEAT_MS }],
      }
    case 'roundScored': {
      const c = event.summary.challenge
      if (!c) return {}
      const accused = seatName(view, c.accused)
      const what = c.kind === 'play' ? 'followed suit' : `held the Jodhi in ${SUIT_NAME[c.suit!]}`
      return {
        moments: [
          c.guilty
            ? { title: 'Caught', detail: `${accused} ${c.kind === 'play' ? 'did not follow suit' : 'called a false Jodhi'}`, tone: 'danger', ms: VERDICT_BEAT_MS, card: c.card }
            : { title: 'Fair play', detail: `${accused} ${what}`, tone: 'good', ms: VERDICT_BEAT_MS, card: c.card },
        ],
      }
    }
    case 'gameOver':
      playSound('gameOver')
      return {}
    default:
      return {}
  }
}
