import { type GameEvent, type View, passTarget } from '../engine'
import type { Seat } from '../../../kit/table'
import { type Presentation, WIN_BEAT_MS } from '../../../ui/contract'
import { playSound } from '../../../ui/sound'
import { seatName } from '../../../ui/text'
import { BROKE, pointsWord } from './text'

/** How long each moment holds the middle of the table; `dwell` holds playback at least as long. */
export const CHALLENGE_BEAT_MS = 1800
export const VERDICT_BEAT_MS = 2600
export const HEARTS_BROKEN_MS = 1100

/** Who gave the viewer their three cards, by the round's direction: the rule is public, so this hides nothing. */
function giverTo(view: View, seat: Seat): Seat | null {
  const way = view.direction
  if (way === 'none') return null
  return view.seats.map((_, s) => s).find((s) => passTarget(s, way) === seat) ?? null
}

/** Turns one game event into a sound and, where it helps, a toast or a moment in the middle of the table. */
export function present(event: GameEvent, view: View, seat: Seat | null): Presentation {
  const name = (s: Seat) => (s === seat ? 'You' : seatName(view, s))
  /** The seat named mid-sentence. */
  const them = (s: Seat) => (s === seat ? 'you' : seatName(view, s))
  switch (event.type) {
    case 'dealt':
      playSound('deal')
      if (event.direction === 'none') return { toast: 'No passing this round.' }
      return { toast: `Pick three cards to pass ${event.direction}.` }
    case 'passChosen':
      playSound('card')
      return {}
    case 'passesExchanged': {
      playSound('deal')
      const giver = seat === null ? null : giverTo(view, seat)
      return { toast: giver === null ? 'The cards have changed hands.' : `${seatName(view, giver)} passed you three cards.` }
    }
    case 'cardPlayed':
      playSound(event.card.suit === 'spades' && event.card.rank === 'Q' ? 'slam' : 'card')
      return {}
    case 'heartsBroken':
      // Nobody calls it; the heart that broke them has already been heard.
      return { moments: [{ title: 'Hearts are broken', detail: 'Hearts may be led from now on.', tone: 'call', ms: HEARTS_BROKEN_MS }] }
    case 'trickWon':
      // A spectator wins no tricks: every one is someone else's.
      playSound(event.seat === seat ? 'sweep' : 'sweepTheirs')
      return {}
    case 'challengeResolved':
      playSound('challenge')
      return {
        moments: [{ title: 'Challenge', detail: `${name(event.challenger)} ${event.challenger === seat ? 'challenge' : 'challenges'} ${them(event.accused)}`, tone: 'danger', ms: CHALLENGE_BEAT_MS }],
      }
    case 'roundScored': {
      const { moon, challenge } = event.summary
      if (moon !== null) return { moments: [{ title: 'Shot the moon', detail: `${name(moon)} took every point`, tone: 'call', ms: VERDICT_BEAT_MS }] }
      if (!challenge) return {}
      // The verdict comes in the same message as the challenge, and its moment shows after the challenge's.
      playSound(challenge.guilty ? 'caught' : 'fair', CHALLENGE_BEAT_MS)
      const accused = name(challenge.accused)
      return {
        moments: [
          challenge.guilty
            ? { title: 'Caught', detail: `${accused} ${BROKE[challenge.rule ?? ''] ?? 'broke the rules'}`, tone: 'danger', ms: VERDICT_BEAT_MS, card: challenge.card }
            : { title: 'Fair play', detail: `${accused} played by the rules`, tone: 'good', ms: VERDICT_BEAT_MS, card: challenge.card },
        ],
      }
    }
    case 'gameOver': {
      const mine = event.winner === seat
      const colour = 'var(--accent)'
      playSound(mine ? 'gameWon' : 'gameLost')
      // The winner sees "You win" over a golden table under confetti; the others see who did, quietly; a spectator sees the gold without the confetti.
      return {
        moments: [{ title: mine ? 'You win' : `${seatName(view, event.winner)} wins`, detail: `With ${pointsWord(view.scores[event.winner])}`, tone: mine || seat === null ? 'win' : 'good', ms: WIN_BEAT_MS, colour }],
        celebrate: mine ? colour : undefined,
      }
    }
    default:
      return {}
  }
}
