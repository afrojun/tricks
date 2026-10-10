/** Why a computer chose what it did, as data. The words live in the coach. */
import type { Seat } from '../../../kit/table'
import type { Card } from '../engine/cards'
import type { Action } from '../engine/types'

/** What a hand is worth in tricks, as the calling count reads it. */
export interface Count {
  /** Tricks from spades: high spades with enough beside them, and length past three. */
  spades: number
  /** Side aces and kings. */
  sides: number
  /** Voids and singletons in side suits, with spades to spare. */
  ruffs: number
  /** All of it, before rounding down. */
  total: number
}

export type Reason =
  /** Two players: the top card is worth keeping. */
  | { code: 'keep'; card: Card }
  /** Two players: the top card is not, so the next is taken blind. */
  | { code: 'pass'; card: Card }
  | { code: 'look' }
  /** A call of the tricks the hand counts, `trimmed` by one when the partnership would call too many. */
  | { code: 'call'; tricks: number; count: Count; trimmed: boolean }
  /** Nil: a hand of low cards, short in spades. */
  | { code: 'nil' }
  /** Blind nil: the side is far behind. */
  | { code: 'blindNil'; behind: number }
  /** The Blind nil player gives its two most dangerous cards. */
  | { code: 'giveHigh'; cards: Card[] }
  /** Its partner gives back two low cards. */
  | { code: 'giveLow'; cards: Card[] }
  /** A forced opening lead: the lowest club. */
  | { code: 'openingLead'; card: Card }
  | { code: 'onlyCard'; card: Card }
  /** A card no unseen card of its suit can beat. */
  | { code: 'leadBoss'; card: Card }
  /** Spades, to draw the others' trumps, holding at least as many as are still out. */
  | { code: 'drawTrumps'; card: Card }
  /** Low from the longest side suit. */
  | { code: 'leadLong'; card: Card }
  /** The contract is made: the card least likely to win, to keep bags off. */
  | { code: 'leadLow'; card: Card }
  /** The partner called Nil: a high card, so it can play under. */
  | { code: 'leadForNil'; card: Card }
  /** An opponent called Nil: low, so it may have to win. */
  | { code: 'leadAtNil'; card: Card; nil: Seat }
  /** The partner is winning the trick: low. */
  | { code: 'partnerWinning'; card: Card }
  /** The side needs tricks: the lowest card that wins. */
  | { code: 'winCheap'; card: Card }
  /** Void in the suit led: the lowest spade that wins. */
  | { code: 'trump'; card: Card }
  /** The partner called Nil and may take this trick: a card over it. */
  | { code: 'coverNil'; card: Card }
  /** An opponent who called Nil is winning: a card under it. */
  | { code: 'underNil'; card: Card; nil: Seat }
  /** The contract is made: the highest card that loses, to keep bags off. */
  | { code: 'duck'; card: Card }
  /** Nothing to win with, or nothing worth winning: the lowest. */
  | { code: 'playLow'; card: Card }
  /** Void, not trumping: the lowest card of the shortest side suit. */
  | { code: 'throwLow'; card: Card }
  /** Playing Nil: the highest card that still loses. */
  | { code: 'nilDuck'; card: Card }
  /** Playing Nil, void: the most dangerous card that cannot win. */
  | { code: 'nilDump'; card: Card }
  /** Playing Nil and leading: the lowest card. */
  | { code: 'nilLead'; card: Card }
  /** A cheat: off suit while holding the suit led, to save a Nil or win a trick the contract needs. */
  | { code: 'renege'; card: Card; honest: Card; saves: 'nil' | 'trick' }

export interface Decision {
  action: Action
  reason: Reason
}
