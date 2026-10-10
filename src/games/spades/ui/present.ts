
import type { Seat } from '../../../kit/table'
import { type Presentation, WIN_BEAT_MS } from '../../../ui/contract'
import type { Moment } from '../../../ui/Moments'
import { playSound } from '../../../ui/sound'
import { seatName } from '../../../ui/text'
import { type GameEvent, type RoundSummary, type View, isJoker, sideOf } from '../engine'
import { BROKE, callText, midSentence, pointsWord, sideName, sideSubject, sidesSubject } from './text'

/** How long each moment holds the middle of the table; `dwell` holds playback at least as long. */
export const CHALLENGE_BEAT_MS = 1800
export const VERDICT_BEAT_MS = 2600
export const SPADES_BROKEN_MS = 1100
export const NIL_CALL_MS = 1300
export const NIL_BROKEN_MS = 1400
export const SET_MS = 1600
export const BAGS_MS = 1600

/** A side's colour: the team colours with four, and a third for three players. */
export function sideColour(side: number): string {
  return `var(--team${side})`
}

/** The moments a round's score shows: every side set, in one, then every side that paid for bags. */
export function roundMoments(view: View, summary: RoundSummary): Moment[] {
  if (summary.challenge) return []
  const set = summary.sides.flatMap((s, side) => (s.contract > 0 && !s.made ? [side] : []))
  const out: Moment[] = []
  if (set.length > 0) out.push({ title: 'Set', detail: `${sidesSubject(view, set).name} missed ${set.length > 1 ? 'their calls' : 'the call'}`, tone: 'danger', ms: SET_MS })
  // One moment for each amount paid: a round that crosses ten bags twice costs 200.
  const paid = [...new Set(summary.sides.map((s) => s.bagPenalty).filter((p) => p < 0))].sort((a, b) => b - a)
  for (const penalty of paid) {
    const who = sidesSubject(view, summary.sides.flatMap((s, side) => (s.bagPenalty === penalty ? [side] : [])))
    out.push({ title: penalty === -100 ? 'Ten bags' : penalty === -200 ? 'Ten bags twice' : `Ten bags ${-penalty / 100} times`, detail: `${who.name} ${who.many ? 'lose' : 'loses'} ${-penalty}`, tone: 'danger', ms: BAGS_MS })
  }
  return out
}

/** Turns one game event into a sound and, where it helps, a toast or a moment in the middle of the table. */
export function present(event: GameEvent, view: View, seat: Seat | null): Presentation {
  const name = (s: Seat) => (s === seat ? 'You' : seatName(view, s))
  switch (event.type) {
    case 'dealt':
      playSound('deal')
      return view.playerCount === 2 ? { toast: 'Draw your 13 cards.' } : {}
    case 'drew':
    case 'cardsGiven':
      playSound('card')
      return {}
    case 'called': {
      if (event.call.tricks > 0) {
        playSound('call')
        return {}
      }
      playSound(event.call.blind ? 'slam' : 'call')
      const detail = `${name(event.seat)} will take no tricks${event.call.blind ? ', without looking' : ''}`
      return { moments: [{ title: callText(event.call), detail, tone: 'call', ms: NIL_CALL_MS }] }
    }
    case 'cardsExchanged':
      playSound('deal')
      return { toast: 'Two cards each way have changed hands.' }
    case 'cardPlayed':
      playSound(isJoker(event.card) || (event.card.suit === 'spades' && event.card.rank === 'A') ? 'slam' : 'card')
      return {}
    case 'spadesBroken':
      return { moments: [{ title: 'Spades are broken', detail: 'Spades may be led from now on.', tone: 'call', ms: SPADES_BROKEN_MS }] }
    case 'trickWon':
      playSound(event.seat === seat ? 'sweep' : 'sweepTheirs')
      return {}
    case 'nilBroken':
      playSound('caught')
      return { moments: [{ title: 'Nil broken', detail: `${name(event.seat)} took a trick`, tone: 'danger', ms: NIL_BROKEN_MS }] }
    case 'contractMade': {
      playSound('chip')
      const contract = 'contracts' in view.phase ? view.phase.contracts[event.side] : 0
      const who = sideSubject(view, event.side)
      return { toast: `${who.name} ${who.many ? 'have' : 'has'} made ${contract}.` }
    }
    case 'challengeResolved': {
      playSound('challenge')
      // The verdict follows the challenge in the same message.
      playSound(event.guilty ? 'caught' : 'fair', CHALLENGE_BEAT_MS)
      const accused = name(event.accused)
      const atFault = event.guilty ? event.accused : event.challenger
      const side = sideSubject(view, sideOf(atFault, view.playerCount))
      const cost =
        event.effect === 'set'
          ? `${midSentence(side.name)} ${side.many ? 'are' : 'is'} set`
          : event.effect === 'nilFailed'
            ? `${midSentence(name(atFault))} ${atFault === seat ? 'lose' : 'loses'} the Nil`
            : `three more tricks for ${midSentence(side.name)}`
      return {
        moments: [
          { title: 'Challenge', detail: `${name(event.challenger)} ${event.challenger === seat ? 'challenge' : 'challenges'} ${midSentence(accused)}`, tone: 'danger', ms: CHALLENGE_BEAT_MS },
          event.guilty
            ? { title: 'Caught', detail: `${accused} ${BROKE[event.rule ?? ''] ?? 'broke a rule'}: ${cost}`, tone: 'danger', ms: VERDICT_BEAT_MS, card: event.card }
            : { title: 'Fair play', detail: `${accused} played by the rules: ${cost}`, tone: 'good', ms: VERDICT_BEAT_MS, card: event.card },
        ],
      }
    }
    case 'roundScored': {
      const moments = roundMoments(view, event.summary)
      if (event.summary.sides.some((s) => s.bagPenalty < 0)) playSound('bags', moments[0].title === 'Set' ? SET_MS : 0)
      if (moments[0]?.title === 'Set') playSound('caught')
      return moments.length > 0 ? { moments } : {}
    }
    case 'gameOver': {
      const mine = seat !== null && sideOf(seat, view.playerCount) === event.winner
      const colour = view.playerCount === 4 ? sideColour(event.winner) : 'var(--accent)'
      playSound(mine ? 'gameWon' : 'gameLost')
      const title = mine ? 'You win' : `${sideName(view, event.winner)} ${view.playerCount === 4 ? 'win' : 'wins'}`
      return {
        moments: [{ title, detail: `With ${pointsWord(view.scores[event.winner])}`, tone: mine || seat === null ? 'win' : 'good', ms: WIN_BEAT_MS, colour }],
        celebrate: mine ? colour : undefined,
      }
    }
    default:
      return {}
  }
}

