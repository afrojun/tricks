import { type GameEvent, type View, passTarget } from '../engine'
import type { Seat } from '../../../kit/table'
import type { Presentation } from '../../../ui/contract'
import { playSound } from '../../../ui/sound'
import { seatName } from '../../../ui/text'
import { BROKE } from './text'

/** How long each moment holds the middle of the table; `dwell` holds playback at least as long. */
export const CHALLENGE_BEAT_MS = 1000
export const VERDICT_BEAT_MS = 1300
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
  switch (event.type) {
    case 'dealt':
      playSound('deal')
      if (event.direction === 'none') return { toast: 'No passing this round.' }
      return { toast: `Pass three cards ${event.direction === 'across' ? 'across' : `to the ${event.direction}`}.` }
    case 'passesExchanged': {
      playSound('deal')
      const giver = seat === null ? null : giverTo(view, seat)
      return { toast: giver === null ? 'The cards have changed hands.' : `${seatName(view, giver)} passed you three cards.` }
    }
    case 'cardPlayed':
      playSound('cardPlay')
      return {}
    case 'heartsBroken':
      playSound('call')
      return { moments: [{ title: 'Hearts are broken', detail: 'Hearts may be led from now on.', tone: 'call', ms: HEARTS_BROKEN_MS }] }
    case 'trickWon':
      if (event.seat === seat) playSound('trickWin')
      return {}
    case 'challengeResolved':
      playSound('challenge')
      return {
        moments: [{ title: 'Challenge', detail: `${name(event.challenger)} ${event.challenger === seat ? 'challenge' : 'challenges'} ${seatName(view, event.accused)}`, tone: 'danger', ms: CHALLENGE_BEAT_MS }],
      }
    case 'roundScored': {
      const { moon, challenge } = event.summary
      if (moon !== null) return { moments: [{ title: 'Shot the moon', detail: `${name(moon)} took every point`, tone: 'call', ms: VERDICT_BEAT_MS }] }
      if (!challenge) return {}
      const accused = seatName(view, challenge.accused)
      return {
        moments: [
          challenge.guilty
            ? { title: 'Caught', detail: `${accused} ${BROKE[challenge.rule ?? ''] ?? 'broke the rules'}`, tone: 'danger', ms: VERDICT_BEAT_MS, card: challenge.card }
            : { title: 'Fair play', detail: `${accused} played by the rules`, tone: 'good', ms: VERDICT_BEAT_MS, card: challenge.card },
        ],
      }
    }
    case 'gameOver':
      playSound('gameOver')
      return { celebrate: 'var(--accent)' }
    default:
      return {}
  }
}
