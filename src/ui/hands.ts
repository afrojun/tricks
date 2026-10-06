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
