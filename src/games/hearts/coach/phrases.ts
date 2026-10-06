/**
 * Why the honest computer would make the hint's move, a phrase for each of its reason codes. The
 * phrases read only the reason and the player's own view, so they say nothing the player could not know.
 */
import { sameCard } from '../../../kit/cards'
import type { Phrases } from '../../../kit/coach'
import { ledSuit } from '../../../kit/tricks'
import type { PassWhy, Reason } from '../ai/reasons'
import { type Card, JACK_OF_DIAMONDS, type View } from '../engine'
import { card, count, list, who } from './words'

/** "You have no clubs": a card is thrown away when the player cannot follow the suit led. */
function noneOfLed(view: View): string {
  const suit = view.phase.kind === 'playing' ? ledSuit(view.phase.current) : null
  return suit === null ? 'You cannot follow suit' : `You have no ${suit}`
}

/** Each kind of card passed, in a sentence. */
const PASSED: Record<Exclude<PassWhy, 'shortSuit'>, (cards: Card[]) => string> = {
  queenOfSpades: () => 'With fewer than five spades you cannot hide the queen of spades, and she is 13 points.',
  highSpade: (cards) => `${list(cards)} could win a trick with the queen of spades in it.`,
  highHeart: (cards) => `${list(cards)} could win tricks full of hearts.`,
  highCard: (cards) => `${list(cards)} ${cards.length === 1 ? 'is the highest card' : 'are the highest cards'} you have left, the likeliest to win tricks you do not want.`,
}

function passing(picks: readonly { card: Card; why: PassWhy }[]): string {
  const sentences: string[] = []
  const said = new Set<string>()
  for (const { card: first, why } of picks) {
    // Cards that empty a suit are told by their suit; the rest by why they go.
    const key = why === 'shortSuit' ? `${why}:${first.suit}` : why
    if (said.has(key)) continue
    said.add(key)
    const cards = picks.filter((p) => p.why === why && (why !== 'shortSuit' || p.card.suit === first.suit)).map((p) => p.card)
    sentences.push(
      why === 'shortSuit'
        ? `Passing ${list(cards)} empties your ${first.suit}: unless you are passed some, you can throw away a bad card whenever ${first.suit} are led.`
        : PASSED[why](cards),
    )
  }
  return sentences.join(' ')
}

/** The words for every reason the Hearts player gives. */
export const PHRASES: Phrases<View, Reason> = {
  pass: (r) => passing(r.picks),
  openingLead: () => 'Whoever holds the two of clubs must lead it to the first trick.',
  onlyCard: (r) => `${card(r.card)} is the only card the rules let you play.`,
  firstTrickHigh: (r) => `The first trick holds no points and none may be played to it, so it is a safe time to get rid of your highest club, ${card(r.card)}.`,
  fishForQueen: (r) =>
    `Someone else still holds the queen of spades. Leading ${card(r.card)}, a spade below her, makes the others play spades, and if she comes out, ${card(r.card)} is not the card that takes her.`,
  leadLow: (r) =>
    r.higher === 0
      ? `Nothing still out can beat any card you may safely lead, so lead the lowest, ${card(r.card)}.`
      : `${card(r.card)} is your lead least likely to win this trick: ${count(r.higher, `higher ${r.card.suit.slice(0, -1)}`)} ${r.higher === 1 ? 'is' : 'are'} still out.`,
  leadLeastBad: (r) =>
    r.card.suit === 'hearts'
      ? `Every card you could lead is risky. ${card(r.card)} will win the trick, but a trick of hearts usually costs less than one with the queen of spades in it.`
      : `Every card you could lead is risky, and ${card(r.card)} is the least risky of them.`,
  duck: (r) => `${card(r.card)} stays under ${card(r.under)}, so you will not take this trick, and it is the highest card you have that does: a high card is safer gone.`,
  winClean: (r) => `You play last and this trick holds no points, so take it with ${card(r.card)} while that is safe: a high card is better gone now than later.`,
  playLow: (r) => `Every card you can follow with would win this trick as it stands, so play ${card(r.card)}, the lowest you can spare.`,
  stopMoon: (r, view) =>
    `${who(view, r.shooter)} has taken every point so far and could shoot the moon. ${card(r.card)} can take this trick: it costs you a few points, but stops them taking all 26.`,
  takeJack: (r) =>
    sameCard(r.card, JACK_OF_DIAMONDS)
      ? `The jack of diamonds is worth −10 to whoever takes it, and your ${card(r.card)} can win this trick.`
      : `The jack of diamonds is in this trick, worth −10 to whoever takes it. ${card(r.card)} is your best chance of winning it.`,
  dumpQueen: (_r, view) => `${noneOfLed(view)}, so give away the queen of spades: her 13 points go to whoever takes this trick.`,
  dumpHighSpade: (r, view) => `${noneOfLed(view)}. Get rid of ${card(r.card)} while the queen of spades is still out: kept, it could win the trick she falls on.`,
  dumpHeart: (r, view) => `${noneOfLed(view)}, so give your highest heart, ${card(r.card)}, to whoever takes this trick.`,
  dumpHigh: (r, view) => `${noneOfLed(view)}, so get rid of a high card, ${card(r.card)}, before it wins a trick you do not want.`,
  renege: (r) => `${card(r.card)} breaks the rules, so as not to take ${r.dodges} points with ${card(r.honest)}.`,
}
