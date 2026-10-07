import { type GameEvent, type Seat, type View, teamOf } from '../engine'
import type { Presentation } from '../../../ui/contract'
import { type Sound, playSound } from '../../../ui/sound'
import { SUIT_NAME, seatName } from '../../../ui/text'

export const CHALLENGE_BEAT_MS = 1000
export const VERDICT_BEAT_MS = 1300

/** What a guilty play did, by the first rule it broke. */
const BROKE: Record<string, string> = { renege: 'did not follow suit', undercut: 'undercut a trump' }

/** Turns one game event into a sound and, where it helps, a toast or a moment in the middle of the table. */
export function present(event: GameEvent, view: View, seat: Seat | null): Presentation {
  const name = (s: Seat) => (s === seat ? 'You' : seatName(view, s))
  const verb = (s: Seat, you: string, they: string) => (s === seat ? you : they)
  const call = (sound: Sound, s: Seat, what: string, detail?: string, ms = 1500): Presentation => {
    playSound(sound)
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
      playSound(event.card.rank === 'J' ? 'slam' : 'card')
      return {}
    case 'trickWon':
      // A spectator has no side: every trick is someone else's.
      playSound(seat !== null && teamOf(event.seat) === teamOf(seat) ? 'sweep' : 'sweepTheirs')
      return {}
    case 'thuneeCalled':
      return call('big', event.seat, 'Thunee', undefined, 1700)
    case 'doubleCalled':
      return call('big', event.seat, 'Double')
    case 'khanaakCalled':
      return call('big', event.seat, 'Khanaak')
    case 'jodhiClaimed':
      return call(
        'jodhi',
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
      // The verdict comes in the same message as the challenge, and its moment shows after the challenge's.
      playSound(c.guilty ? 'caught' : 'fair', CHALLENGE_BEAT_MS)
      const accused = seatName(view, c.accused)
      const what = c.kind === 'play' ? 'followed suit' : `held the Jodhi in ${SUIT_NAME[c.suit!]}`
      return {
        moments: [
          c.guilty
            ? { title: 'Caught', detail: `${accused} ${c.kind === 'play' ? BROKE[c.rule ?? 'renege'] : 'called a false Jodhi'}`, tone: 'danger', ms: VERDICT_BEAT_MS, card: c.card }
            : { title: 'Fair play', detail: `${accused} ${what}`, tone: 'good', ms: VERDICT_BEAT_MS, card: c.card },
        ],
      }
    }
    case 'gameOver':
      playSound('gameWon')
      return { celebrate: event.winner === 0 ? 'var(--team0)' : 'var(--team1)' }
    default:
      return {}
  }
}
