/**
 * Why the honest computer would make the hint's move, a phrase for each of its reason codes. The phrases read
 * only the reason and the player's own view, so they say nothing the player could not know.
 */
import type { Phrases } from '../../../kit/coach'
import { partnerOf } from '../../../kit/partners'
import type { Reason } from '../ai/reasons'
import type { View } from '../engine'
import { card, half, list, who } from './words'

const partnerName = (view: View) => {
  const partner = view.seat === null ? null : partnerOf(view.seat, view.playerCount)
  return partner === null ? 'your partner' : who(view, partner)
}

/** The words for every reason the Spades player gives. */
export const PHRASES: Phrases<View, Reason> = {
  keep: (r) => `${card(r.card)} is worth keeping: ${r.card.suit === 'spades' ? 'every spade is a trump' : r.card.rank === 'A' ? 'an ace usually wins a trick' : 'a king with another card of its suit often wins one'}.`,
  pass: (r) => `${card(r.card)} is unlikely to win a trick, so let it go and take the next card, whatever it is.`,
  look: () => 'Look at your cards before you call. Blind nil is a gamble for a side far behind.',
  call: (r, view) => {
    const parts = [`${half(r.count.spades)} from spades`, `${half(r.count.sides)} from side aces and kings`, `${half(r.count.ruffs)} from short suits you can trump`]
    const trim = r.trimmed ? ` With ${partnerName(view)}'s call that is a lot for one side, so call one fewer.` : ''
    return `Count your tricks: ${parts.join(', ')}. That makes about ${half(r.count.total)}, so call ${r.tricks}.${trim}`
  },
  nil: () => 'No high spades, few spades at all, and a low card in every suit: you can probably play under every trick. Call Nil for 100.',
  blindNil: (r) => `Your side is ${r.behind} behind. Blind nil, called before you look, is worth 200 if you take no tricks, and costs 200 if you take any.`,
  giveHigh: (r) => `Give ${list(r.cards)}, your most dangerous cards: anything high could win a trick and break your Blind nil.`,
  giveLow: (r) => `Give back ${list(r.cards)}: low cards help your partner duck under every trick.`,
  openingLead: (r) => `Whoever holds the lowest club leads it, so ${card(r.card)} starts the round.`,
  onlyCard: (r) => `${card(r.card)} is the only card the rules let you play.`,
  leadBoss: (r) => `Nothing still out of ${r.card.suit} beats ${card(r.card)}, so it should win this trick, unless someone trumps it.`,
  drawTrumps: (r) => `You hold at least as many spades as are still out. Leading ${card(r.card)} draws them, so your other cards can win later.`,
  leadLong: (r) => `Lead low from your longest suit: ${card(r.card)}. Your higher cards there win more once others run out.`,
  leadLow: (r) => `Your side has made its call. ${card(r.card)} is the lead least likely to win, and every extra trick is a bag.`,
  leadForNil: (r, view) => `${partnerName(view)} called Nil. Lead high, ${card(r.card)}, so ${partnerName(view)} can play under it.`,
  leadAtNil: (r, view) => `${who(view, r.nil)} called Nil. Lead low, ${card(r.card)}, so a high card of theirs may have to win.`,
  partnerWinning: (r, view) => `${partnerName(view)} is winning this trick, so save your strength: ${card(r.card)}.`,
  winCheap: (r) => `Your side still needs tricks. ${card(r.card)} is the lowest card that wins this one.`,
  trump: (r) => `You have none of the suit led, and your side needs tricks: trump with ${card(r.card)}, the lowest spade that wins.`,
  coverNil: (r, view) => `${partnerName(view)} called Nil. Take this trick with ${card(r.card)} so they don't have to.`,
  underNil: (r, view) => `${who(view, r.nil)} called Nil and is winning this trick. Play under it, ${card(r.card)}, and their Nil breaks.`,
  duck: (r) => `Your side has made its call, and extra tricks are bags. ${card(r.card)} is your highest card that loses this trick.`,
  playLow: (r) => `Nothing you hold is worth winning this trick with, so play your lowest, ${card(r.card)}.`,
  throwLow: (r) => `You cannot follow suit, and need not trump. Throw ${card(r.card)}, from your shortest suit, to empty it.`,
  nilDuck: (r) => `You called Nil. ${card(r.card)} is your highest card that still loses this trick: get rid of high cards while you can.`,
  nilDump: (r) => `You called Nil and cannot follow suit. Throw ${card(r.card)}, a card that could win a trick later.`,
  nilLead: (r) => `You called Nil and must lead. Lead your lowest, ${card(r.card)}, so someone else wins.`,
  renege: (r) => `${card(r.card)} breaks the rules, to ${r.saves === 'nil' ? 'save your Nil' : 'win a trick your side needs'} instead of playing ${card(r.honest)}.`,
}
