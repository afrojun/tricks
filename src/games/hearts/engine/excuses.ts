/**
 * Hearts' rules of play, described once as excuses. A card's legality, the
 * hidden record of what a play broke, and what an observer can prove from the
 * cards it has seen all come from `excusesFor`.
 */
import { type Suit, sameCard } from '../../../kit/cards'
import { type Excuse, type SeenPlay, legalCards } from '../../../kit/integrity'
import { followSuit, ledSuit } from '../../../kit/tricks'
import { type Card, QUEEN_OF_SPADES, TWO_OF_CLUBS, isPointCard } from './cards'
import type { HeartsRules } from './rules'
import type { View } from './types'

/** The public state of the trick a card is played into. */
export interface Situation {
  /** The suit led, or null when the card leads. */
  led: Suit | null
  firstTrick: boolean
  heartsBroken: boolean
}

/** What a situation is read from: a round in play, or a view of one. */
interface RoundSoFar {
  current: readonly { card: Card }[]
  tricks: readonly unknown[]
  heartsBroken: boolean
}

/** The situation the next card is played into. */
export function situation(round: RoundSoFar): Situation {
  return { led: ledSuit(round.current), firstTrick: round.tricks.length === 0, heartsBroken: round.heartsBroken }
}

/**
 * The excuses `card` needs: each rule it would break if the hand it came from
 * held a card matching the excuse.
 * - `followSuit`: a card off the led suit, from a hand with none of it.
 * - `firstTrickPoints`: a heart or the queen of spades on the first trick, from a hand of nothing else.
 * - `heartsLead`: a heart led before hearts are broken, from a hand of nothing but hearts.
 */
export function excusesFor(card: Card, at: Situation, rules: HeartsRules): Excuse<Card>[] {
  const out = followSuit(card, at.led)
  if (at.firstTrick && !rules.pointsOnFirstTrick && isPointCard(card)) {
    out.push({ rule: 'firstTrickPoints', without: (c) => !isPointCard(c) })
  }
  if (at.led === null && card.suit === 'hearts' && !at.heartsBroken) {
    out.push({ rule: 'heartsLead', without: (c) => c.suit !== 'hearts' })
  }
  return out
}

/**
 * The opening lead: the round's first card, which must be the two of clubs.
 * The table knows who holds it, so there is nothing to hide and no cheat is offered.
 */
export function isOpeningLead(round: RoundSoFar): boolean {
  return round.tricks.length === 0 && round.current.length === 0
}

/** The cards of `hand` that obey the rules as the next card of `round`. */
export function legalPlays(hand: readonly Card[], round: RoundSoFar, rules: HeartsRules): Card[] {
  if (isOpeningLead(round)) return hand.filter((c) => sameCard(c, TWO_OF_CLUBS))
  const at = situation(round)
  return legalCards(hand, (c) => excusesFor(c, at, rules))
}

/** Whether a card breaks hearts when played: any heart, legal or not, and the queen of spades under its rule. */
export function breaksHearts(card: Card, rules: HeartsRules): boolean {
  return card.suit === 'hearts' || (rules.queenBreaksHearts && sameCard(card, QUEEN_OF_SPADES))
}

/**
 * Every play the viewer can see, in order, with the excuses it needed. Every
 * hand in a round of Hearts is one deal: the cards passed arrive before the
 * first card is played.
 *
 * A `full` view sees every play. A `table` view sees only the last completed
 * trick and the current one; when an earlier trick is out of sight and hearts
 * are broken now, it cannot tell whether they were broken before a lead it
 * sees, so it never assumes they were not.
 */
export function seenPlays(view: View): SeenPlay<Card>[] {
  const phase = view.phase
  if (phase.kind !== 'playing' && phase.kind !== 'trickPause') return []
  const tricks = [...phase.tricks.map((t) => t.plays), phase.current]
  const out: SeenPlay<Card>[] = []
  let broken = false
  let seenAll = true
  tricks.forEach((plays, trick) => {
    if (plays.length === 0 && trick < phase.tricks.length) {
      seenAll = false
      return
    }
    plays.forEach((p, i) => {
      const heartsBroken = phase.heartsBroken && (broken || !seenAll)
      const at: Situation = { led: i === 0 ? null : plays[0].card.suit, firstTrick: trick === 0, heartsBroken }
      out.push({ seat: p.seat, card: p.card, trick, deal: 0, excuses: excusesFor(p.card, at, view.rules) })
      if (breaksHearts(p.card, view.rules)) broken = true
    })
  })
  return out
}
