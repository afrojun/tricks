/**
 * Hearts' coach: the kit's tier 1, built from Hearts' own computer player, with Hearts' words for
 * its reasons, what the player is asked, and the rules a card can break; and, written by hand, its
 * lessons and its narration.
 */
import { hasCard } from '../../../kit/cards'
import { type CoachBasis, type GameCoach, baselineCoach } from '../../../kit/coach'
import { brokenRules } from '../../../kit/integrity'
import { ledSuit, touching } from '../../../kit/tricks'
import { decide } from '../ai/choose'
import { inPlay, unseen, winningPlay, wouldWin } from '../ai/read'
import type { Reason } from '../ai/reasons'
import { type Action, type Card, type GameEvent, type View, type ViewPlaying, availableActions, excusesFor, isOpeningLead, isPointCard, situation, strength, trickPoints } from '../engine'
import { narrate } from './narrate'
import { PHRASES } from './phrases'
import { topicsFor } from './topics'
import { card, list, points, sentence, who } from './words'

const PASS_TO = { left: 'to the left', right: 'to the right', across: 'across' } as const
const PASSED_FROM = { left: 'from the right', right: 'from the left', across: 'from across the table' } as const

/** Each rule a card can break, by the name Hearts' excuses give it: said before the play and in the review. */
const RULES: Record<'followSuit' | 'firstTrickPoints' | 'heartsLead', (played: Card, phase: ViewPlaying) => string> = {
  followSuit: (played, phase) => {
    const suit = ledSuit(phase.current)!
    return `${card(played)} does not follow ${suit}, and you hold ${list(phase.hand.filter((c) => c.suit === suit))}: whoever can follow suit must.`
  },
  firstTrickPoints: (played) => `${card(played)} is a point card, and none may be played to the first trick while you hold anything else.`,
  heartsLead: (played) => `Hearts are not broken yet, so ${card(played)} may not be led while you hold another suit.`,
}

/** The player's turn in play, or null. */
function myTurn(view: View): ViewPlaying | null {
  return view.phase.kind === 'playing' && view.phase.turn === view.seat ? view.phase : null
}

export const heartsBasis: CoachBasis<View, Action, Reason> = {
  decide,
  phrases: PHRASES,

  asked(view) {
    const phase = view.phase
    if (phase.kind === 'passing') return view.direction === 'none' ? '' : `Choose three cards to pass ${PASS_TO[view.direction]}.`
    const turn = myTurn(view)
    if (turn === null) return ''
    if (isOpeningLead(turn)) return 'You hold the two of clubs, so you lead it to the first trick.'
    const suit = ledSuit(turn.current)
    if (suit === null) {
      const hearts = turn.hand.filter((c) => c.suit === 'hearts').length
      const blocked = !turn.heartsBroken && hearts > 0 && hearts < turn.hand.length
      return `You lead trick ${turn.tricks.length + 1}.${blocked ? ' Hearts are not broken yet, so you may not lead one.' : ''}`
    }
    if (turn.hand.some((c) => c.suit === suit)) return `${sentence(suit)} were led and you have some, so you must follow suit.`
    const firstTrick = turn.tricks.length === 0 && !view.rules.pointsOnFirstTrick && turn.hand.some((c) => !isPointCard(c))
    return `You have no ${suit}, so you may play any card${firstTrick ? ' except a heart or the queen of spades, which may not be played to the first trick' : ''}.`
  },

  line(view) {
    if (view.phase.kind === 'passing' && view.direction !== 'none') return `You will be passed three ${PASSED_FROM[view.direction]}.`
    const turn = myTurn(view)
    if (turn === null || turn.current.length === 0) return null
    const winning = winningPlay(turn.current)
    return `${who(view, winning.seat)} is winning with ${card(winning.card)}. This trick holds ${points(trickPoints(turn.current.map((p) => p.card), view.rules))} so far.`
  },

  name(action) {
    if (action.type === 'choosePass') return `Pass ${list(action.cards)}`
    if (action.type === 'playCard') return `Play ${card(action.card)}`
    return 'Hint'
  },

  cards(action) {
    if (action.type === 'choosePass') return action.cards
    if (action.type === 'playCard') return [action.card]
    return []
  },

  breaks(view, action) {
    const turn = myTurn(view)
    if (action.type !== 'playCard' || turn === null) return null
    const can = availableActions(view)
    if (!hasCard(can.play, action.card) || hasCard(can.legal, action.card)) return null
    const [rule] = brokenRules(turn.hand, excusesFor(action.card, situation(turn), view.rules))
    return RULES[rule as keyof typeof RULES](action.card, turn)
  },

  risk: 'If anyone notices, they can accuse you: the round ends at once, and you take 26 points.',

  when(view) {
    const play = inPlay(view)
    return view.phase.kind === 'passing' ? 'Passing' : play ? `Trick ${play.tricks.length + 1}` : 'This round'
  },

  hinted: (action) => action.type === 'choosePass' || action.type === 'playCard',

  // Touching cards worth the same points that win or lose this trick alike: a card already on it may lie between them.
  asGood(view, advised, taken) {
    const turn = myTurn(view)
    if (turn === null || advised.type !== 'playCard' || taken.type !== 'playCard') return false
    const worth = (c: Card) => trickPoints([c], view.rules)
    const wins = (c: Card) => turn.current.length === 0 || wouldWin(turn.current, view.seat!, c)
    return (
      worth(advised.card) === worth(taken.card) && wins(advised.card) === wins(taken.card) && touching(advised.card, taken.card, unseen(turn), { strength })
    )
  },

  // The points riding on the trick, the two cards' own included; the pass sets up the whole round.
  stake(view, advised, taken) {
    const turn = myTurn(view)
    if (turn === null || advised.type !== 'playCard' || taken.type !== 'playCard') return 10
    return 1 + Math.abs(trickPoints([...turn.current.map((p) => p.card), advised.card, taken.card], view.rules))
  },
}

export const heartsCoach: GameCoach<View, Action, GameEvent> = { ...baselineCoach(heartsBasis), narrate, topicsFor }
