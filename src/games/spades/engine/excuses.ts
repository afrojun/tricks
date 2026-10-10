/**
 * Spades' rules of play, described once as excuses. A card's legality, the hidden record of what a play
 * broke, and what an observer can prove from the cards it has seen all come from `excusesFor`.
 */
import type { Suit } from '../../../kit/cards'
import { type Excuse, type SeenPlay, legalCards } from '../../../kit/integrity'
import { followSuit, ledSuit, unbrokenLead } from '../../../kit/tricks'
import { type Card, TRUMP, strength, suitOf } from './cards'
import type { SpadesRules } from './rules'
import type { View } from './types'

/** The public state of the trick a card is played into. */
export interface Situation {
  /** The suit led, as it is played, or null when the card leads. */
  led: Suit | null
  spadesBroken: boolean
}

/** What a situation is read from: a round in play, or a view of one. */
interface RoundSoFar {
  current: readonly { card: Card }[]
  tricks: readonly unknown[]
  spadesBroken: boolean
}

/** The situation the next card is played into. */
export function situation(round: RoundSoFar, rules: Pick<SpadesRules, 'jokers'>): Situation {
  return { led: ledSuit(round.current, suitOf(rules.jokers)), spadesBroken: round.spadesBroken }
}

/**
 * The excuses `card` needs: each rule it would break if the hand it came from held a card matching the excuse.
 * - `followSuit`: a card off the suit led, from a hand with none of it.
 * - `spadesLead`: a spade led before spades are broken, from a hand of nothing but spades.
 */
export function excusesFor(card: Card, at: Situation, rules: Pick<SpadesRules, 'jokers'>): Excuse<Card>[] {
  const of = suitOf(rules.jokers)
  return [...followSuit(card, at.led, of), ...unbrokenLead(card, at.led, TRUMP, at.spadesBroken, 'spadesLead', of)]
}

/** Whether the first lead of a round is forced: always with three, and with four under `firstLead: 'lowestClub'`. */
export function forcedOpening(rules: Pick<SpadesRules, 'firstLead'>, playerCount: number): boolean {
  return playerCount === 3 || (playerCount === 4 && rules.firstLead === 'lowestClub')
}

/** The lowest club in `hand`, as clubs are played; null if it holds none. */
export function lowestClub(hand: readonly Card[], rules: Pick<SpadesRules, 'jokers'>): Card | null {
  const of = suitOf(rules.jokers)
  const order = strength(rules.jokers)
  let low: Card | null = null
  for (const c of hand) if (of(c) === 'clubs' && (low === null || order(c) < order(low))) low = c
  return low
}

/**
 * The card a forced opening lead must be, when `round` is at the opening lead and it is forced: the leader is
 * whoever holds the lowest club in play, so it is the lowest club in the leader's hand. The table knows who
 * holds it, so there is nothing to hide and no cheat is offered.
 */
export function forcedCard(hand: readonly Card[], round: RoundSoFar, rules: Pick<SpadesRules, 'firstLead' | 'jokers'>, playerCount: number): Card | null {
  if (round.tricks.length > 0 || round.current.length > 0 || !forcedOpening(rules, playerCount)) return null
  return lowestClub(hand, rules)
}

/** The cards of `hand` that obey the rules as the next card of `round`. */
export function legalPlays(hand: readonly Card[], round: RoundSoFar, rules: Pick<SpadesRules, 'firstLead' | 'jokers'>, playerCount: number): Card[] {
  const forced = forcedCard(hand, round, rules, playerCount)
  if (forced !== null) return [forced]
  const at = situation(round, rules)
  return legalCards(hand, (c) => excusesFor(c, at, rules))
}

/** Whether a card breaks spades when played: any card played as a spade, legal or not. */
export function breaksSpades(card: Card, rules: Pick<SpadesRules, 'jokers'>): boolean {
  return suitOf(rules.jokers)(card) === TRUMP
}

/**
 * Every play the viewer can see, in order, with the excuses it needed and whether an accusation has already
 * judged it. Every hand in a round is one deal: a Blind nil exchange ends before the first card.
 *
 * A `full` view sees every play. A `table` view sees only the last completed trick and the current one; when an
 * earlier trick is out of sight and spades are broken now, it cannot tell whether they were broken before a lead
 * it sees, so it never assumes they were not.
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
    const led = plays.length > 0 ? suitOf(view.rules.jokers)(plays[0].card) : null
    plays.forEach((p, i) => {
      const spadesBroken = phase.spadesBroken && (broken || !seenAll)
      const at: Situation = { led: i === 0 ? null : led, spadesBroken }
      // Each seat plays once a trick, so its play in trick t is settled when it has had more than t judged.
      const settled = trick < phase.settled[p.seat]
      out.push({ seat: p.seat, card: p.card, trick, deal: 0, excuses: excusesFor(p.card, at, view.rules), ...(settled ? { settled } : {}) })
      if (breaksSpades(p.card, view.rules)) broken = true
    })
  })
  return out
}
