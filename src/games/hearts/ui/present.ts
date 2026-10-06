import type { GameEvent, View } from '../engine'
import type { Seat } from '../../../kit/table'
import type { Presentation } from '../../../ui/contract'
import { playSound } from '../../../ui/sound'
import { seatName } from '../../../ui/text'

const CHALLENGE_BEAT_MS = 1000
const VERDICT_BEAT_MS = 1300

/** What a guilty verdict says was done, by the rule broken. */
const BROKE: Record<string, string> = {
  followSuit: 'did not follow suit',
  heartsLead: 'led a heart before hearts were broken',
  firstTrickPoints: 'played points on the first trick',
}

/** Turns one game event into a sound and, where it helps, a toast or a moment in the middle of the table. */
export function present(event: GameEvent, view: View, seat: Seat | null): Presentation {
  const name = (s: Seat) => (s === seat ? 'You' : seatName(view, s))
  switch (event.type) {
    case 'dealt':
      playSound('deal')
      if (event.direction === 'none') return { toast: 'No passing this round.' }
      return { toast: `Pass three cards ${event.direction === 'across' ? 'across' : `to the ${event.direction}`}.` }
    case 'passesExchanged':
      playSound('deal')
      return {}
    case 'cardPlayed':
      playSound('cardPlay')
      return {}
    case 'heartsBroken':
      return { toast: 'Hearts are broken.' }
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
