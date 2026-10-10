/** How a hand of cards is laid out and chosen from, for any game. Pure. */
import { type Card, hasCard, sameCard } from '../kit/cards'

/** How far the outermost cards may lean, in degrees: six cards four degrees apart. */
const FAN_DEG = 10

/** How far a card leans, in degrees, so the hand fans out: four degrees from the next, closer when more than six would lean too far. */
export function fanTilt(index: number, count: number): number {
  const apart = Math.min(4, (2 * FAN_DEG) / Math.max(1, count - 1))
  return (index - (count - 1) / 2) * apart
}

/** Picks a card, or puts it back if it was picked. A card past the limit is not picked. */
export function togglePick<C extends Card>(picked: readonly C[], card: C, limit: number): C[] {
  if (hasCard(picked, card)) return picked.filter((c) => !sameCard(c, card))
  return picked.length < limit ? [...picked, card] : [...picked]
}

/** Cards picked from a hand, kept with the hand they were picked from. */
export interface Picks<C extends Card> {
  from: readonly C[]
  cards: C[]
}

export const NO_PICKS: Picks<never> = { from: [], cards: [] }

const sameHand = (a: readonly Card[], b: readonly Card[]) => a.length === b.length && a.every((c) => hasCard(b, c))

/** The cards still picked from `hand`: a pick belongs to its hand, so a new deal or a new game holds none. */
export function pickedFrom<C extends Card>(picks: Picks<C>, hand: readonly C[]): C[] {
  return sameHand(picks.from, hand) ? picks.cards : []
}

/** Picks a card from `hand`, or puts it back; see `togglePick`. */
export function pickFrom<C extends Card>(picks: Picks<C>, hand: readonly C[], card: C, limit: number): Picks<C> {
  return { from: [...hand], cards: togglePick(pickedFrom(picks, hand), card, limit) }
}

/** A hand of more than this many cards is shown in two tiers, so every index stays wide enough to read and tap. */
export const TIER_AT = 13

/**
 * A sorted hand split for two tiers: the back tier first, then the front, the back the smaller by one at most.
 * The split falls between two suits when a suit ends within two cards of the middle, nearest it first; otherwise
 * in the middle, inside a suit, so a hand of fifteen spades still splits evenly.
 */
export function splitTiers<C extends Card>(cards: readonly C[]): [C[], C[]] {
  const middle = Math.floor(cards.length / 2)
  const boundaries = cards.map((_, i) => i).filter((i) => i > 0 && cards[i].suit !== cards[i - 1].suit)
  const near = boundaries.filter((i) => Math.abs(i - middle) <= 2).sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle) || a - b)
  const at = near[0] ?? middle
  return [cards.slice(0, at), cards.slice(at)]
}

