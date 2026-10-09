/** Short explanations of each part of Standard Hearts, and when each first matters. */
import { hasCard } from '../../../kit/cards'
import { moonThreat } from '../ai/read'
import { type Card, type GameEvent, QUEEN_OF_SPADES, TWO_OF_CLUBS, type View } from '../engine'

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
      'Hearts is for four players, each playing alone. Everyone gets 13 cards from a full deck, and aces are high. A round is 13 tricks.',
      'Points are bad. Every heart you take is 1 point, and the queen of spades is 13. When a round ends with anyone on 100 or more, the game is over and the lowest score wins; if two players share the lowest, play goes on.',
    ],
    example: [QUEEN_OF_SPADES, ...c('hearts', 'A', '2')],
  },
  passing: {
    title: 'Passing',
    paragraphs: [
      'Before play, everyone gives three cards away: to the left in the first round, to the right in the second, across the table in the third, and none in the fourth. Then it starts again.',
      'Pass the cards you least want: the queen of spades, unless you have plenty of spades to hide her among; the ace and king of spades, which could win the trick she falls on; and high hearts. Passing the last cards of a suit helps too: when that suit is led, you can throw away any card you like.',
      'You choose before you see the three you are given.',
    ],
  },
  tricks: {
    title: 'Tricks and following suit',
    paragraphs: [
      'Whoever holds the two of clubs leads it to the first trick. Play goes clockwise, to the left.',
      'Everyone must follow the suit led if they can. With none of it you may play any card, and that is your chance to get rid of a dangerous one.',
      'There is no trump. The highest card of the suit led wins the trick and every point in it, and the winner leads the next trick.',
    ],
    example: [TWO_OF_CLUBS],
  },
  firstTrick: {
    title: 'The first trick',
    paragraphs: [
      'Nobody may play a heart or the queen of spades to the first trick, unless they hold nothing else. So the first trick almost never holds points.',
      'That makes it a safe trick to win. When you follow the two of clubs, play your highest club, or, with no clubs, a high card you want rid of.',
    ],
  },
  heartsBroken: {
    title: 'Breaking hearts',
    paragraphs: [
      'You may not lead a heart until hearts are broken: until a heart has been played to a trick, usually by someone with none of the suit led. If you hold nothing but hearts, you may lead one anyway.',
      'Once hearts are broken, anyone may lead them. Leading a low heart is a way to make someone else take it.',
    ],
  },
  queen: {
    title: 'The queen of spades',
    paragraphs: [
      'The queen of spades is 13 points, half of all the points in a round. Whoever wins the trick she is played to takes her.',
      'While she is still out, the ace and king of spades are dangerous: she may fall on the trick one of them wins. Spades below her are safe, and leading them can force her out of the hand that holds her.',
      'If you hold her, keep spades below her to hide her among, and give her away the first time you cannot follow suit.',
    ],
    example: c('spades', 'A', 'K', 'Q'),
  },
  moon: {
    title: 'Shooting the moon',
    paragraphs: [
      'Take every heart and the queen of spades in one round, all 26 points, and you shoot the moon: you take nothing, and everyone else takes 26.',
      'When one player has taken every point so far, they may be trying it. Winning a single heart yourself stops them.',
    ],
  },
  challenge: {
    title: 'Challenges',
    paragraphs: [
      'The app lets anyone break a rule, and keeps a record. If you think someone has, for instance by not following suit when they could, press Challenge and choose them.',
      'The round ends at once. If they broke a rule, they take 26 points; if they did not, you do. Nobody else scores that round, so only challenge when you are sure.',
    ],
  },
} satisfies Record<string, Topic>

export type TopicId = keyof typeof TOPICS

/**
 * The topics worth introducing at this moment, most useful first. The caller shows the first the
 * player has not seen yet.
 */
export function topicsFor(view: View, event: GameEvent | null): TopicId[] {
  const out: TopicId[] = []
  const phase = view.phase
  if (event?.type === 'dealt') {
    if (event.roundNumber === 1) out.push('aim')
    if (event.direction !== 'none') out.push('passing')
  }
  if (phase.kind === 'passing' && phase.choice === null && view.direction !== 'none') out.push('passing')
  // In play, each lesson is read from the table as it stands, not from the event that brought it,
  // so one held back behind another is still due when that one is read.
  if (phase.kind === 'playing' || phase.kind === 'trickPause') {
    const mine = phase.kind === 'playing' && phase.turn === view.seat
    out.push('tricks')
    if (mine && phase.tricks.length === 0 && phase.current.length > 0 && !view.rules.pointsOnFirstTrick) out.push('firstTrick')
    const leadingHearts = mine && phase.tricks.length > 0 && phase.current.length === 0 && phase.hand.some((h) => h.suit === 'hearts')
    if (phase.heartsBroken || leadingHearts) out.push('heartsBroken')
    const played = [...phase.tricks.flatMap((t) => t.plays), ...phase.current].map((p) => p.card)
    if (hasCard(played, QUEEN_OF_SPADES) || (phase.tricks.length > 0 && hasCard(phase.hand, QUEEN_OF_SPADES))) out.push('queen')
    if (moonThreat(view, phase) !== null) out.push('moon')
    if (mine && phase.tricks.length > 0 && view.rules.allowCheating) out.push('challenge')
  }
  if (event?.type === 'roundScored' && event.summary.moon !== null) out.push('moon')
  if (event?.type === 'challengeResolved') out.push('challenge')
  return [...new Set(out)]
}
