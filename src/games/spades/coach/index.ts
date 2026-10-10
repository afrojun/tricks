/**
 * Spades' coach: the kit's tier 1, built from Spades' own computer player, with Spades' words for its reasons,
 * what the player is asked, and the rules a card can break; and, written by hand, its lessons and its narration.
 */
import { hasCard } from '../../../kit/cards'
import { type CoachBasis, type GameCoach, baselineCoach } from '../../../kit/coach'
import { brokenRules } from '../../../kit/integrity'
import { decide } from '../ai/choose'
import { order, winningPlay } from '../ai/read'
import type { Reason } from '../ai/reasons'
import { type Action, type Card, type GameEvent, type View, type ViewPlaying, availableActions, excusesFor, forcedCard, situation } from '../engine'
import { narrate } from './narrate'
import { PHRASES } from './phrases'
import { topicsFor } from './topics'
import { card, list, sentence, who } from './words'

/** Each rule a card can break, by the name Spades' excuses give it: said before the play and in the review. */
const RULES: Record<'followSuit' | 'spadesLead', (played: Card, view: View, phase: ViewPlaying) => string> = {
  followSuit: (played, view, phase) => {
    const of = order(view).suitOf
    const suit = of(phase.current[0].card)
    return `${card(played)} does not follow ${suit}, and you hold ${list(phase.hand.filter((c) => of(c) === suit))}: whoever can follow suit must.`
  },
  spadesLead: (played) => `Spades are not broken yet, so ${card(played)} may not be led while you hold another suit.`,
}

/** The player's turn in play, or null. */
function myTurn(view: View): ViewPlaying | null {
  return view.phase.kind === 'playing' && view.phase.turn === view.seat ? view.phase : null
}

export const spadesBasis: CoachBasis<View, Action, Reason> = {
  decide,
  phrases: PHRASES,

  asked(view) {
    const phase = view.phase
    if (phase.kind === 'drawing') return 'Keep the top card and discard the next, or discard it and take the next unseen.'
    if (phase.kind === 'calling') return view.seat !== null && !phase.looked[view.seat] ? 'Look at your cards, or call Blind nil without them.' : 'Call how many tricks you will take, or Nil.'
    if (phase.kind === 'exchanging') return 'Choose two cards to give.'
    const turn = myTurn(view)
    if (turn === null) return ''
    if (forcedCard(turn.hand, turn, view.rules, view.playerCount) !== null) return 'You hold the lowest club, so you lead it to the first trick.'
    const of = order(view).suitOf
    const suit = turn.current.length > 0 ? of(turn.current[0].card) : null
    if (suit === null) {
      const spades = turn.hand.filter((c) => of(c) === 'spades').length
      const blocked = !turn.spadesBroken && spades > 0 && spades < turn.hand.length
      return `You lead trick ${turn.tricks.length + 1}.${blocked ? ' Spades are not broken yet, so you may not lead one.' : ''}`
    }
    if (turn.hand.some((c) => of(c) === suit)) return `${sentence(suit)} were led and you have some, so you must follow suit.`
    return `You have no ${suit}, so you may play any card, a spade to trump included.`
  },

  line(view) {
    const turn = myTurn(view)
    if (turn === null || turn.current.length === 0) return null
    const winning = winningPlay(view, turn.current)
    return `${who(view, winning.seat)} ${winning.seat === view.seat ? 'are' : 'is'} winning with ${card(winning.card)}.`
  },

  name(action) {
    switch (action.type) {
      case 'draw':
        return action.keep ? 'Keep it' : 'Discard it'
      case 'lookAtHand':
        return 'See your cards'
      case 'call':
        return action.tricks === 0 ? 'Call Nil' : `Call ${action.tricks}`
      case 'callBlindNil':
        return 'Call Blind nil'
      case 'giveCards':
        return `Give ${list(action.cards)}`
      case 'playCard':
        return `Play ${card(action.card)}`
      default:
        return 'Hint'
    }
  },

  cards(action) {
    if (action.type === 'giveCards') return action.cards
    if (action.type === 'playCard') return [action.card]
    return []
  },

  breaks(view, action) {
    const turn = myTurn(view)
    if (action.type !== 'playCard' || turn === null) return null
    const can = availableActions(view)
    if (!hasCard(can.play, action.card) || hasCard(can.legal, action.card)) return null
    const [rule] = brokenRules(turn.hand, excusesFor(action.card, situation(turn, view.rules), view.rules))
    return RULES[rule as keyof typeof RULES](action.card, view, turn)
  },

  risk: 'If an opponent notices, they can challenge you, and your side is set.',
}

export const spadesCoach: GameCoach<View, Action, GameEvent> = { ...baselineCoach(spadesBasis), narrate, topicsFor }
