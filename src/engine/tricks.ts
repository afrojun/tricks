/**
 * Thunee's rules of play, described once as excuses. A card's legality, the
 * hidden record of what a play broke, the verdict on an accusation and what an
 * observer can prove from the cards it has seen all come from `excusesFor`.
 */
import { type Excuse, type SeenPlay, brokenRules, legalCards } from '../kit/integrity'
import { followSuit, trickWinner as winnerOf } from '../kit/tricks'
import { type Card, type Suit, strength } from './cards'
import type { RuleSet } from './rules'
import type { Seat } from './seats'
import type { View } from './types'

/**
 * The excuses `card` needs when played onto `trick` (the cards already played,
 * in order): each rule it breaks if the hand it came from held a card matching
 * the excuse. Proof ids carry these names.
 * - `renege`: a card off the led suit, from a hand with none of it.
 * - `undercut`: under the undercut rule, a trump lower than one already in a
 *   trick led in another suit, from a hand of nothing but trumps.
 */
export function excusesFor(card: Card, trick: readonly Card[], trump: Suit | null, rules: Pick<RuleSet, 'undercutRestriction'>): Excuse<Card>[] {
  const led = trick.length > 0 ? trick[0].suit : null
  const out: Excuse<Card>[] = followSuit(card, led).map((e) => ({ ...e, rule: 'renege' }))
  if (rules.undercutRestriction && trump !== null && led !== null && led !== trump && card.suit === trump) {
    const highestTrump = Math.max(0, ...trick.filter((c) => c.suit === trump).map(strength))
    if (highestTrump > strength(card)) out.push({ rule: 'undercut', without: (c) => c.suit !== trump })
  }
  return out
}

/**
 * Whether `card` may legally be played from `hand` onto `trick`. Rule-breaking
 * plays are still accepted while cheating is allowed; this decides what a
 * challenge would find.
 */
export function isLegalPlay(card: Card, hand: readonly Card[], trick: readonly Card[], trump: Suit | null, rules: Pick<RuleSet, 'undercutRestriction'>): boolean {
  return brokenRules(hand, excusesFor(card, trick, trump, rules)).length === 0
}

export function legalPlays(hand: readonly Card[], trick: readonly Card[], trump: Suit | null, rules: Pick<RuleSet, 'undercutRestriction'>): Card[] {
  return legalCards(hand, (c) => excusesFor(c, trick, trump, rules))
}

/**
 * Every play the viewer can see this round, in order, with the excuses it
 * needed: what an observer proves a cheat from. Each half is dealt apart, so
 * the half is the deal. A `table` view sees only the last completed trick and
 * the current one; a `full` view sees every card played.
 */
export function seenPlays(view: View): SeenPlay<Card>[] {
  const phase = view.phase
  if (phase.kind !== 'playing' && phase.kind !== 'trickPause') return []
  const tricks = [...phase.tricks, { plays: phase.current, half: phase.half }]
  return tricks.flatMap(({ plays, half }, trick) =>
    plays.map((p, i) => ({
      seat: p.seat,
      card: p.card,
      trick,
      deal: half,
      excuses: excusesFor(p.card, plays.slice(0, i).map((q) => q.card), phase.trump, view.rules),
    })),
  )
}

/** The kit's rule in Thunee's rank order: the highest trump wins; with no trump played, the highest card of the led suit. */
export function trickWinner(plays: readonly { seat: Seat; card: Card }[], trump: Suit | null): Seat {
  return winnerOf(plays, { trump, strength })
}
