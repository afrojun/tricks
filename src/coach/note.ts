import type { Action, Card, View } from '../games/thunee/engine'

/** One decision the player made, with what the coach advised at that moment. */
export interface DecisionRecord {
  /** The player's full view just before deciding. */
  view: View
  advised: Action | null
  taken: Action
}

/** What a practice round keeps for the review. */
export interface RoundLog {
  /** Every seat's six cards for each half dealt so far: `dealt[half - 1][seat]`. */
  dealt: Card[][][]
  decisions: DecisionRecord[]
}

export type TopicId =
  | 'cards'
  | 'calling'
  | 'trump'
  | 'following'
  | 'counting'
  | 'lastTrick'
  | 'balls'
  | 'jodhi'
  | 'thunee'
  | 'double'
  | 'khanaak'
  | 'challenge'
  | 'twoPlayer'

/** The mistakes `check` warns about. */
export type WarningRule = 'illegal' | 'overtakePartner' | 'givePoints' | 'overcall' | 'thunee' | 'jodhiUnclaimed' | 'challenge'

/** Everything the coach says. */
export interface Note {
  tone: 'info' | 'suggest' | 'warn'
  title: string
  body: string
  /** Cards to highlight in the hand or on the table. */
  cards?: Card[]
  seats?: number[]
  topic?: TopicId
  rule?: WarningRule
}
