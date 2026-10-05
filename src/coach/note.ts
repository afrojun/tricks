import type { Action, Card, View } from '../engine'

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
