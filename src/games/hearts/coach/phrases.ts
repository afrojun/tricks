/**
 * Why the honest computer would make the hint's move, a phrase for each of its reason codes. The
 * phrases read only the reason and the player's own view, so they say nothing the player could not know.
 */
import { hasCard, sameCard } from '../../../kit/cards'
import type { Phrases } from '../../../kit/coach'
import { ledSuit } from '../../../kit/tricks'
import type { PassWhy, Reason } from '../ai/reasons'
import { type Card, JACK_OF_DIAMONDS, QUEEN_OF_SPADES, type View, strength } from '../engine'
import { card, count, list, who } from './words'

type Pick = { card: Card; why: PassWhy }

const isQueen = (c: Card) => sameCard(c, QUEEN_OF_SPADES)
const isLowSpade = (c: Card) => c.suit === 'spades' && strength(c) < strength(QUEEN_OF_SPADES)

/** "You have no clubs": a card is thrown away when the player cannot follow the suit led. */
function noneOfLed(view: View): string {
  const suit = view.phase.kind === 'playing' ? ledSuit(view.phase.current) : null
  return suit === null ? 'You cannot follow suit' : `You have no ${suit}`
}

/** Each card passed for what it is, in a sentence. */
const PASSED: Record<'queenOfSpades' | 'highSpade' | 'highHeart', (cards: Card[]) => string> = {
  queenOfSpades: () => 'With fewer than five spades the queen of spades is hard to hide, and she is 13 points.',
  highSpade: (cards) => `${list(cards)} could win a trick with the queen of spades in it.`,
  highHeart: (cards) => `${list(cards)} could win tricks full of hearts.`,
}

/**
 * The cards passed as the highest left. The player keeps some back first: spades below the queen,
 * the queen among five or more spades, and the jack of diamonds when it counts. Whichever of those
 * outrank a card passed is said, so "the highest" is true of what is left.
 */
function highest(cards: Card[], picks: readonly Pick[], view: View): string[] {
  const hand = view.phase.kind === 'passing' ? view.phase.hand : []
  const passed = picks.map((p) => p.card)
  const plain = cards.filter((c) => !isLowSpade(c))
  const low = cards.filter(isLowSpade)
  const floor = Math.min(...plain.map(strength))
  const above = hand.filter((c) => !hasCard(passed, c) && strength(c) > floor)
  const out: string[] = []
  if (low.length > 0 || above.some(isLowSpade)) {
    const hides = hand.some(isQueen) && !passed.some(isQueen)
    out.push(`Spades below the queen are passed last: ${hides ? 'they hide her' : 'they let you play under her when spades are led'}.`)
  }
  if (above.some(isQueen)) out.push('With five or more spades the queen of spades stays, hidden among them.')
  if (view.rules.jackOfDiamonds && above.some((c) => sameCard(c, JACK_OF_DIAMONDS))) out.push('The jack of diamonds stays: it is worth −10 to whoever takes it.')
  if (plain.length > 0) {
    const one = plain.length === 1
    out.push(
      above.length > 0
        ? `Of the rest, ${list(plain)} ${one ? 'is' : 'are'} the highest, the likeliest to win tricks you do not want.`
        : `${list(plain)} ${one ? 'is the highest card' : 'are the highest cards'} you have left, the likeliest to win tricks you do not want.`,
    )
  }
  if (low.length > 0) out.push(`With nothing else to spare, ${list(low)} ${low.length === 1 ? 'goes' : 'go'} too.`)
  return out
}

function passing(picks: readonly Pick[], view: View): string {
  const sentences: string[] = []
  const said = new Set<string>()
  for (const { card: first, why } of picks) {
    // Cards that empty a suit are told by their suit; the rest by why they go.
    const key = why === 'shortSuit' ? `${why}:${first.suit}` : why
    if (said.has(key)) continue
    said.add(key)
    const cards = picks.filter((p) => p.why === why && (why !== 'shortSuit' || p.card.suit === first.suit)).map((p) => p.card)
    if (why === 'highCard') sentences.push(...highest(cards, picks, view))
    else if (why === 'shortSuit') sentences.push(`Passing ${list(cards)} empties your ${first.suit}: unless you are passed some, you can throw away a bad card whenever ${first.suit} are led.`)
    else sentences.push(PASSED[why](cards))
  }
  return sentences.join(' ')
}

/** The words for every reason the Hearts player gives. */
export const PHRASES: Phrases<View, Reason> = {
  pass: (r, view) => passing(r.picks, view),
  openingLead: () => 'Whoever holds the two of clubs must lead it to the first trick.',
  onlyCard: (r) => `${card(r.card)} is the only card the rules let you play.`,
  firstTrickHigh: (r) =>
    `No heart and no queen of spades has been played to this trick so far, and on the first trick they may be played only by someone who holds nothing else. That makes it a good time to get rid of your highest club, ${card(r.card)}, though it could still take one of them.`,
  fishForQueen: (r) =>
    `Someone else still holds the queen of spades. Leading ${card(r.card)}, a spade below her, makes anyone with spades follow suit, and if she comes out, ${card(r.card)} is not the card that takes her.`,
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
    `${who(view, r.shooter)} has taken every point so far and could shoot the moon. ${card(r.card)} beats the cards played so far: if it holds, you take this trick's points yourself, and they can no longer take all 26.`,
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
