/** Short explanations of each part of Standard Spades, and when each first matters. */
import { type Card, type GameEvent, type View, sideOf } from '../engine'

export interface Topic {
  title: string
  paragraphs: string[]
  example?: Card[]
}

const c = (suit: Card['suit'], ...ranks: Card['rank'][]): Card[] => ranks.map((rank) => ({ suit, rank }))

export const TOPICS = {
  aim: {
    title: 'The aim',
    paragraphs: [
      'Spades is for two, three or four. With four, partners sit opposite and score together as a side; with two or three, everyone plays alone. Aces are high, and spades are always trump.',
      'Before each round everyone calls how many tricks they will take. Make your call and you score 10 a trick; miss it and you lose as much. When a round ends with anyone at 500 or more, the highest score wins.',
    ],
    example: c('spades', 'A', 'K', 'Q'),
  },
  calling: {
    title: 'Calling',
    paragraphs: [
      'Starting left of the dealer, everyone calls once: a number of tricks, or Nil. With four, partners add their calls together: that is the side’s contract.',
      'Count what your hand will win. In spades: the ace, a king with another spade beside it, a queen with two, and every spade past your third. In the other suits: each ace, half for a king with a card beside it, and a trick for each short suit you can trump with a spare spade.',
      'Calling too few is safer than too many, but every trick over your call is a bag.',
    ],
  },
  tricks: {
    title: 'Tricks and trump',
    paragraphs: [
      'Everyone must follow the suit led if they can. With none of it you may play any card, a spade included: a spade wins over every other suit. Otherwise the highest card of the suit led wins, and its winner leads next.',
      'Spades may not be led until one has been played to a trick, unless you hold nothing else.',
    ],
  },
  bags: {
    title: 'Bags',
    paragraphs: [
      'Every trick a side takes beyond its call is a bag. Each bag scores 1, but bags add up over the game, and every 10 cost the side 100.',
      'Once your side has made its call, try to lose tricks rather than win them.',
    ],
  },
  nil: {
    title: 'Nil',
    paragraphs: [
      'Nil is a call to take no tricks at all, for 100. Take even one and it costs 100. A Nil player’s tricks never count towards their partner’s call, and each is a bag.',
      'Playing Nil, throw your high cards when you cannot follow suit, and play the highest card that still loses. When your partner calls Nil, win the tricks they might take. Against a Nil, lead low, so they may have to win.',
    ],
  },
  partnership: {
    title: 'Playing with a partner',
    paragraphs: [
      'With four, your partner sits opposite. When your partner is winning a trick, play low and save your strength. When your side has made its call, stop winning tricks.',
    ],
  },
  challenge: {
    title: 'Challenges',
    paragraphs: [
      'The app lets anyone break a rule, and keeps a record. If you think an opponent has, for instance by not following suit when they could, press Challenge and choose them.',
      'If they broke a rule, their side is set: it loses its call, and yours scores what it called. If they did not, your side is set instead, so only challenge when you are sure.',
    ],
  },
} satisfies Record<string, Topic>

export type TopicId = keyof typeof TOPICS

/** The topics worth introducing at this moment, most useful first. The caller shows the first the player has not seen yet. */
export function topicsFor(view: View, event: GameEvent | null): TopicId[] {
  const out: TopicId[] = []
  const phase = view.phase
  if (event?.type === 'dealt' && event.roundNumber === 1) out.push('aim')
  if (phase.kind === 'calling') {
    out.push('calling')
    if (phase.calls.some((c) => c?.tricks === 0)) out.push('nil')
  }
  if (phase.kind === 'playing' || phase.kind === 'trickPause') {
    out.push('tricks')
    if (phase.calls.some((c) => c.tricks === 0)) out.push('nil')
    if (view.playerCount === 4 && phase.tricks.length > 0) out.push('partnership')
    const me = view.seat
    if (me !== null) {
      const side = sideOf(me, view.playerCount)
      const tricks = view.seats.map((_, s) => s).filter((s) => sideOf(s, view.playerCount) === side && phase.calls[s].tricks > 0).reduce((n, s) => n + phase.taken[s], 0)
      if (phase.contracts[side] > 0 && tricks >= phase.contracts[side]) out.push('bags')
    }
    if (phase.kind === 'playing' && phase.turn === me && phase.tricks.length > 0 && view.rules.allowCheating) out.push('challenge')
  }
  if (event?.type === 'challengeResolved') out.push('challenge')
  return [...new Set(out)]
}
