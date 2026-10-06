/** Why a computer chose what it did, as data. The words live in the coach. */
import type { Action, Card, Suit } from '../games/thunee/engine'

export type Reason =
  | { code: 'callStrong'; jacks: number; backedJack: boolean; high: number; limit: number }
  | { code: 'passWeak'; jacks: number; backedJack: boolean; high: number; limit: number }
  | { code: 'strongestSuit'; suit: Suit; cards: Card[] }
  | { code: 'lastCard' }
  | { code: 'thuneeSure'; suit: Suit }
  | { code: 'thuneeUnsafe' }
  | { code: 'leadBoss'; card: Card }
  | { code: 'leadLow'; card: Card }
  | { code: 'leadTrump'; card: Card }
  | { code: 'thuneeLeadHigh'; card: Card }
  | { code: 'feedPartner'; card: Card }
  | { code: 'holdUnderPartner'; card: Card }
  | { code: 'cheapOvertake'; card: Card }
  | { code: 'cheapestWinner'; card: Card }
  | { code: 'cannotWin'; card: Card }
  | { code: 'sureDouble' }
  | { code: 'sureKhanaak' }
  | { code: 'fallback' }

export interface Decision {
  action: Action
  reason: Reason
}
