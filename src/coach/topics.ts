/** Short explanations of each part of Traditional Thunee, and when each first matters. */
import { type Card, type GameEvent, type View, availableActions } from '../engine'
import type { TopicId } from './note'

export interface Topic {
  title: string
  paragraphs: string[]
  example?: Card[]
}

const c = (suit: Card['suit'], ...ranks: Card['rank'][]): Card[] => ranks.map((rank) => ({ suit, rank }))

export const TOPICS: Record<TopicId, Topic> = {
  cards: {
    title: 'The cards',
    paragraphs: [
      'Thunee uses 24 cards: the J, 9, A, 10, K and Q of each suit. In every suit the jack is highest, then the 9, the ace, the 10, the king and the queen.',
      'Cards are worth points: jack 30, 9 20, ace 11, 10 10, king 3, queen 2. Winning a trick wins the points of every card in it.',
    ],
    example: c('hearts', 'J', '9', 'A', '10', 'K', 'Q'),
  },
  calling: {
    title: 'Calling',
    paragraphs: [
      'After four cards each, players may call for the right to choose trump: 10, 20, 30 and so on. Each call must be higher than the last. If nobody calls, the player to the right of the dealer chooses.',
      'The side that chooses trump defends. The other side, the counting side, tries to reach 105 points, and the amount called is added to their total. So a call makes the other side’s job easier: only call with a strong hand, like two jacks or a jack with another high card of its suit.',
    ],
  },
  trump: {
    title: 'Trump',
    paragraphs: [
      'Trump is the strongest suit for the round. Any trump beats any card of another suit.',
      'The trumper picks a suit they hold, or "last card": the suit of the last card they will be dealt. Nobody else learns trump until the first card of play is led.',
    ],
  },
  following: {
    title: 'Following suit',
    paragraphs: [
      'Whoever leads a trick may play any card. Everyone else must play the same suit if they have it. With none of that suit, you may play anything, including a trump.',
      'The highest trump wins the trick; with no trump in it, the highest card of the suit led wins. The winner leads the next trick.',
      'The app lets you break this rule, but an opponent who spots it can challenge and win 4 balls.',
    ],
  },
  counting: {
    title: 'The counting side and 105',
    paragraphs: [
      'The side that did not choose trump is the counting side. They need 105 points from the cards in the tricks they win, plus the call, plus or minus Jodhi and the last trick.',
      'If they reach it they win the round; if not, the trumping side does. All the cards together are worth 304.',
    ],
  },
  lastTrick: {
    title: 'The last trick',
    paragraphs: ['The sixth trick is worth 10 extra points to the counting side: they gain 10 if they win it and lose 10 if they do not.'],
  },
  balls: {
    title: 'Balls',
    paragraphs: [
      'Each round is worth balls, the game score. A normal round is 1 ball, or 2 if the counting side wins after a call. Special calls and challenges are worth more.',
      'The first side to 12 balls wins the game.',
    ],
  },
  jodhi: {
    title: 'Jodhi',
    paragraphs: [
      'A Jodhi is the king and queen of one suit in your hand. Right after your side wins its first or third trick, you may call it.',
      'It adds 20 points to your side, 40 if the suit is trump, and 10 more if you also hold the jack. Only call one you really hold: a false Jodhi can be challenged.',
    ],
    example: c('spades', 'K', 'Q'),
  },
  thunee: {
    title: 'Thunee',
    paragraphs: [
      'Once trump is chosen and everyone has six cards, anyone may call Thunee: a promise to win all six tricks alone. The caller leads, and the first card led becomes trump.',
      'Winning every trick is worth 4 balls. Losing one gives the other side 4 balls, or 8 if it was the caller’s own partner who won it.',
    ],
  },
  double: {
    title: 'Double',
    paragraphs: [
      'If your side has won the first five tricks, you may call Double on your turn in the last trick, before playing. Winning that trick yourself is worth 2 balls; losing it gives the other side 4.',
    ],
  },
  khanaak: {
    title: 'Khanaak',
    paragraphs: [
      'If your side has called a Jodhi, you may call Khanaak on your turn in the last trick, before playing. You must win that trick, your side must have lost at least one trick, and your Jodhi plus 10 must beat everything the other side has.',
      'It is worth 3 balls, or 6 from the counting side. If it fails, the other side gets 4.',
    ],
  },
  challenge: {
    title: 'Challenges',
    paragraphs: [
      'If you see an opponent break the rules, such as not following suit when they had the suit, or calling a Jodhi they did not hold, you may challenge. The round ends at once.',
      'A correct challenge wins your side 4 balls. A wrong one gives 4 balls to them, so only challenge when you are sure.',
    ],
  },
  twoPlayer: {
    title: 'The two-player game',
    paragraphs: [
      'With two players the round is played in two halves. Each half you get six cards and play six tricks; the second half is dealt from the rest of the deck.',
      'There are no partners. The counting player needs 125 points.',
    ],
  },
}

/**
 * The topics worth introducing at this moment, most useful first. The caller shows the first the
 * player has not seen yet.
 */
export function topicsFor(view: View, event: GameEvent | null): TopicId[] {
  const out: TopicId[] = []
  const phase = view.phase
  const can = availableActions(view)
  if (event?.type === 'dealt') {
    if (event.half === 1) out.push('cards', 'calling')
    if (event.half === 2 || view.playerCount === 2) out.push('twoPlayer')
  }
  if (phase.kind === 'trumpSelection' && phase.trumper === view.seat) out.push('trump')
  if (event?.type === 'trumpRevealed') out.push('trump')
  if (phase.kind === 'thuneeWindow' && can.callThunee) out.push('thunee')
  if (event?.type === 'thuneeCalled') out.push('thunee')
  if (phase.kind === 'playing' && phase.turn === view.seat && phase.current.length > 0) out.push('following')
  if (event?.type === 'trickWon') out.push('counting')
  if ((phase.kind === 'playing' || phase.kind === 'trickPause') && phase.tricks.length === 5 && phase.turn === view.seat) out.push('lastTrick')
  if (can.claimJodhi.length > 0 || event?.type === 'jodhiClaimed') out.push('jodhi')
  if (can.callDouble || event?.type === 'doubleCalled') out.push('double')
  if (can.callKhanaak || event?.type === 'khanaakCalled') out.push('khanaak')
  if (event?.type === 'challengeResolved') out.push('challenge')
  if (event?.type === 'roundScored') out.push('balls')
  return [...new Set(out)]
}
