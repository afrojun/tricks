/** After a round: the score in words, the moments that went against the advice, and rules broken but not caught. */
import { type Action, type Card, type RoundSummary, type ScoreLine, type Seat, type View, CARD_POINTS, availableActions, hasCard, pointsOf, sameCard, teamOf } from '../engine'
import { inPlay } from '../ai/suspicion'
import { advise } from './advise'
import type { DecisionRecord, Note } from './note'
import { card, suitPlural, who } from './words'

export interface ReviewInput {
  decisions: readonly DecisionRecord[]
  summary: RoundSummary
  /** Every seat's dealt cards per half; shown by the screen, not needed for the words. */
  dealt: Card[][][]
  you: Seat
  /** The player's view at the end of the round, for names. */
  view: View
}

const MAX_MOMENTS = 3

export function review(input: ReviewInput): Note[] {
  return [score(input), ...moments(input), ...uncaught(input)]
}

function lineText(line: ScoreLine): string {
  const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`)
  switch (line.label) {
    case 'cards':
      return `${line.value} from cards`
    case 'lastTrick':
      return `${signed(line.value)} for the last trick`
    case 'call':
      return `${signed(line.value)} from the call`
    case 'jodhi':
      return `${signed(line.value)} Jodhi`
    case 'opponentJodhi':
      return `${signed(-line.value)} for the other side's Jodhi`
  }
}

function score({ summary: s, view, you }: ReviewInput): Note {
  const ours = (team: number) => team === teamOf(you)
  const sideName = (team: number) => (ours(team) ? 'Your side' : 'The other side')
  const balls = `${s.balls} ball${s.balls === 1 ? '' : 's'}`
  let body: string
  if (s.challenge) {
    const c = s.challenge
    const what = c.kind === 'play' ? 'not following suit' : 'a false Jodhi'
    body = c.guilty
      ? `The round ended with a challenge: ${who(view, c.challenger)} caught ${c.accused === you ? 'you' : who(view, c.accused)} ${what}. That is 4 balls to ${sideName(s.winner).toLowerCase()}.`
      : `The round ended with a challenge that was wrong: ${who(view, c.accused)} had played fairly, so 4 balls go to ${sideName(s.winner).toLowerCase()}.`
  } else if (s.thunee) {
    body = s.thunee.success ? `${who(view, s.thunee.caller)} won all six tricks: the Thunee is worth ${balls}.` : `The Thunee was stopped: ${balls} to ${sideName(s.winner).toLowerCase()}.`
  } else if (s.double) {
    body = s.double.success ? `The Double came off: ${balls}.` : `The Double failed: ${balls} to ${sideName(s.winner).toLowerCase()}.`
  } else if (s.khanaak) {
    body = s.khanaak.success ? `The Khanaak came off: ${balls}.` : `The Khanaak failed: ${balls} to ${sideName(s.winner).toLowerCase()}.`
  } else {
    const n = s.normal!
    const lines = n.lines.filter((l) => l.value !== 0 || l.label === 'cards').map(lineText).join(', ')
    const reached = n.total >= n.target
    body = `${sideName(n.countingTeam)} counted: ${lines}, making ${n.total} against the ${n.target} needed. ${reached ? 'That is enough' : 'That is short'}, so ${sideName(s.winner).toLowerCase()} takes ${balls}.`
  }
  return { tone: 'info', title: `Round ${s.roundNumber}`, body, topic: s.challenge ? 'challenge' : 'counting' }
}

function same(a: Action, b: Action): boolean {
  if (a.type === 'playCard' && b.type === 'playCard') return sameCard(a.card, b.card)
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Points riding on a decision: the trick so far plus the card, or the call. */
function stake(d: DecisionRecord): number {
  const phase = inPlay(d.view)
  if (d.taken.type === 'playCard' && phase) return pointsOf(phase.current.map((p) => p.card)) + CARD_POINTS[d.taken.card.rank]
  if (d.taken.type === 'call') return d.taken.amount
  return 0
}

function trickNumber(view: View): number {
  const phase = inPlay(view)
  return phase ? phase.tricks.filter((t) => t.half === phase.half).length + 1 : 0
}

function describe(action: Action): string {
  switch (action.type) {
    case 'playCard':
      return card(action.card)
    case 'call':
      return `calling ${action.amount}`
    case 'pass':
      return 'passing'
    case 'chooseTrump':
      return action.choice === 'lastCard' ? 'last card' : `${suitPlural(action.choice)} as trump`
    default:
      return action.type.replace(/([A-Z])/g, ' $1').toLowerCase()
  }
}

function moments({ decisions }: ReviewInput): Note[] {
  const differ = decisions.filter((d) => d.advised !== null && !same(d.advised, d.taken))
  return [...differ]
    .sort((a, b) => stake(b) - stake(a))
    .slice(0, MAX_MOMENTS)
    .map((d) => {
      const why = advise(d.view)
      const reason = why && same(why.action, d.advised!) ? ` ${why.note.body}` : ''
      const where = d.taken.type === 'playCard' ? `Trick ${trickNumber(d.view)}` : 'Calling'
      return {
        tone: 'suggest' as const,
        title: `${where}: you chose ${describe(d.taken)}`,
        body: `The hint was ${describe(d.advised!)}.${reason}`,
        cards: d.advised!.type === 'playCard' ? [d.advised!.card] : undefined,
      }
    })
}

function uncaught({ decisions, summary, you }: ReviewInput): Note[] {
  if (summary.challenge && summary.challenge.accused === you && summary.challenge.guilty) return []
  return decisions
    .filter((d) => d.taken.type === 'playCard' && !hasCard(availableActions(d.view).legal, d.taken.card))
    .map((d) => {
      const led = inPlay(d.view)?.current[0]?.card.suit
      return {
        tone: 'warn' as const,
        title: `Trick ${trickNumber(d.view)}: a rule broken`,
        body: `${led ? `You did not follow ${suitPlural(led)} when you could have.` : 'That card broke the rules.'} Nobody challenged this time, but a challenge would have cost your side 4 balls.`,
        topic: 'challenge' as const,
      }
    })
}
