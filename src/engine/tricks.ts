import { type Card, type Suit, rankStrength } from './cards'
import type { RuleSet } from './rules'
import type { Seat } from './seats'

/**
 * Whether `card` may legally be played from `hand` onto `trick` (the cards
 * already played, in order). Illegal plays are still accepted by the engine;
 * this only decides what a challenge would find.
 */
export function isLegalPlay(
  card: Card,
  hand: readonly Card[],
  trick: readonly Card[],
  trump: Suit | null,
  rules: Pick<RuleSet, 'undercutRestriction'>,
): boolean {
  if (trick.length === 0) return true
  const led = trick[0].suit
  if (hand.some((c) => c.suit === led)) return card.suit === led

  // Void in the led suit: anything goes, except a restricted undercut.
  if (rules.undercutRestriction && trump !== null && led !== trump && card.suit === trump) {
    const highestTrump = Math.max(0, ...trick.filter((c) => c.suit === trump).map((c) => rankStrength(c.rank)))
    const undercuts = highestTrump > rankStrength(card.rank)
    if (undercuts && hand.some((c) => c.suit !== trump)) return false
  }
  return true
}

export function legalPlays(
  hand: readonly Card[],
  trick: readonly Card[],
  trump: Suit | null,
  rules: Pick<RuleSet, 'undercutRestriction'>,
): Card[] {
  return hand.filter((c) => isLegalPlay(c, hand, trick, trump, rules))
}

/** The highest trump wins; with no trump played, the highest card of the led suit. */
export function trickWinner(plays: readonly { seat: Seat; card: Card }[], trump: Suit | null): Seat {
  const led = plays[0].card.suit
  let best = plays[0]
  for (const play of plays.slice(1)) {
    const bestIsTrump = best.card.suit === trump
    const isTrump = play.card.suit === trump
    if (isTrump && !bestIsTrump) best = play
    else if (isTrump === bestIsTrump && play.card.suit === best.card.suit) {
      if ((isTrump || play.card.suit === led) && rankStrength(play.card.rank) > rankStrength(best.card.rank)) best = play
    }
  }
  return best.seat
}
