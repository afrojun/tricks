import { type GameEvent, type RoundSummary, type Seat, type View, teamOf } from '../engine'
import { type Presentation, WIN_BEAT_MS } from '../../../ui/contract'
import { type Sound, playSound } from '../../../ui/sound'
import { SUIT_NAME, seatName } from '../../../ui/text'
import { teamName } from './text'

export const CHALLENGE_BEAT_MS = 1000
export const VERDICT_BEAT_MS = 1300
/** The balls a round won fill one at a time on the score track, this far apart. */
export const BALL_STAGGER_MS = 280
/** A breath between the last ball landing and the win. */
const WIN_PAUSE_MS = 350

/** How long after the round's score the game's win shows: after the verdict, if there was a challenge, and after every ball has filled. */
export function winWait(summary: RoundSummary): number {
  const verdict = summary.challenge ? CHALLENGE_BEAT_MS + VERDICT_BEAT_MS / 2 : 0
  return verdict + summary.balls * BALL_STAGGER_MS + WIN_PAUSE_MS
}
/** The longest `winWait`: a challenge wins 4 balls, and a partner-caught Thunee up to 8 without one. */
export const MAX_WIN_WAIT_MS = Math.max(CHALLENGE_BEAT_MS + VERDICT_BEAT_MS / 2 + 4 * BALL_STAGGER_MS, 8 * BALL_STAGGER_MS) + WIN_PAUSE_MS

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
    case 'gameOver': {
      // Arrives with the round's score, while its balls are still filling: the win waits for the last of them.
      const after = view.phase.kind === 'gameOver' ? winWait(view.phase.summary) : 0
      const balls = view.phase.kind === 'gameOver' ? view.phase.summary.ballsAfter : view.balls
      const mine = seat !== null && teamOf(seat) === event.winner
      const colour = `var(--team${event.winner})`
      const cancel = playSound(mine ? 'gameWon' : 'gameLost', after)
      // The winners see "You win" and their colour floods the table under confetti; the losers see who did, quietly; a spectator sees the colour without the confetti.
      const title = mine ? 'You win' : `${teamName(view, event.winner)} ${view.playerCount === 2 ? 'wins' : 'win'}`
      return {
        after,
        cancel,
        moments: [{ title, detail: `${balls[event.winner]} balls to ${balls[1 - event.winner]}`, tone: mine || seat === null ? 'win' : 'good', ms: WIN_BEAT_MS, colour }],
        celebrate: mine ? colour : undefined,
      }
    }
    default:
      return {}
  }
}
