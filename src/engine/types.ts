import type { PlayRecord as KitPlayRecord } from '../kit/integrity'
import type { TableAction, TableEvent, TableReject, TableState, TableView } from '../kit/table'
import type { Card, Suit } from './cards'
import type { RuleOverrides, RuleSet } from './rules'
import type { Seat, Team } from './seats'

export { type Persona, PERSONAS } from '../kit/mind'
export type { Actor, Ctx, SeatInfo, ViewSeat, Waiting } from '../kit/table'

export const FORMAT_VERSION = 3

export type TrumpChoice = Suit | 'lastCard'

// ── Game state ───────────────────────────────────────────────────────────

/** The table's fields (seats, host, `waiting`, `aiActAt`, `aiSalt`) come from the kit. */
export interface Game extends TableState {
  rules: RuleSet
  playerCount: 2 | 4
  balls: [number, number]
  dealer: Seat
  khanaakCalled: boolean
  lastRoundWinner: Team | null
  roundNumber: number
  phase: Phase
}

export type Phase = Lobby | Calling | TrumpSelection | ThuneeWindow | Playing | TrickPause | RoundResult | GameOver

export interface Lobby {
  kind: 'lobby'
}

export interface Calling {
  kind: 'calling'
  hands: Card[][]
  stock: Card[]
  defaultTrumper: Seat
  call: { seat: Seat; amount: number } | null
  passed: Seat[]
  preselect: { seat: Seat; choice: TrumpChoice } | null
  deadline: number
}

export interface TrumpSelection {
  kind: 'trumpSelection'
  hands: Card[][]
  stock: Card[]
  trumper: Seat
  callAmount: number
}

export interface ThuneeWindow {
  kind: 'thuneeWindow'
  hands: Card[][]
  stock: Card[]
  trumper: Seat
  trump: Suit
  callAmount: number
  /** A Thunee call from the counting team, held until the window closes. */
  pending: Seat | null
  passed: Seat[]
  deadline: number
}

export interface Playing {
  kind: 'playing'
  play: RoundPlay
  turn: Seat
}

export interface TrickPause {
  kind: 'trickPause'
  play: RoundPlay
  deadline: number
}

export interface RoundResult {
  kind: 'roundResult'
  summary: RoundSummary
}

export interface GameOver {
  kind: 'gameOver'
  winner: Team
  summary: RoundSummary
}

/** A card played, with the hidden hand it came from and the rules it broke (`renege`, `undercut`). */
export type PlayRecord = KitPlayRecord<Card>

export interface CompletedTrick {
  plays: PlayRecord[]
  winner: Seat
  half: 1 | 2
}

export interface JodhiClaim {
  seat: Seat
  suit: Suit
  withJack: boolean
  points: number
  /** Tricks completed when the claim was made. */
  trick: number
  /** Hidden: whether the claimant really held the cards. */
  valid: boolean
}

export interface RoundPlay {
  hands: Card[][]
  /** The six cards each seat was dealt for the current half. */
  dealt: Card[][]
  trumper: Seat
  callAmount: number
  trump: Suit | null
  trumpRevealed: boolean
  thunee: { caller: Seat } | null
  half: 1 | 2
  /** Undealt cards; only non-empty during the first half of a two-player round. */
  stock: Card[]
  tricks: CompletedTrick[]
  current: PlayRecord[]
  jodhiClaims: JodhiClaim[]
  jodhiOpenFor: Team | null
  double: { caller: Seat } | null
  khanaak: { caller: Seat } | null
}

// ── Scoring ──────────────────────────────────────────────────────────────

export interface ScoreLine {
  label: 'cards' | 'lastTrick' | 'call' | 'jodhi' | 'opponentJodhi'
  value: number
}

export interface RoundSummary {
  roundNumber: number
  reason: 'normal' | 'thunee' | 'double' | 'khanaak' | 'challenge'
  winner: Team
  balls: number
  ballsAfter: [number, number]
  trumper: Seat
  trump: Suit | null
  callAmount: number
  cardPoints: [number, number]
  tricksWon: [number, number]
  normal?: { countingTeam: Team; lines: ScoreLine[]; total: number; target: number }
  thunee?: { caller: Seat; success: boolean; partnerCatch: boolean }
  double?: { caller: Seat; success: boolean }
  khanaak?: { caller: Seat; success: boolean; backward: boolean; jodhi: number; opponentPoints: number }
  challenge?: {
    challenger: Seat
    accused: Seat
    kind: 'play' | 'jodhi'
    guilty: boolean
    card?: Card
    suit?: Suit
    /** For a guilty play: the first rule it broke. */
    rule?: string
  }
}

// ── Actions ──────────────────────────────────────────────────────────────

/** The table's actions (seats, the lobby, stand-ins, `tick`, `setConnected`) come from the kit. */
export type Action =
  | TableAction
  | { type: 'setRules'; overrides: RuleOverrides }
  // round
  | { type: 'call'; amount: number }
  | { type: 'pass' }
  | { type: 'preselectTrump'; choice: TrumpChoice }
  | { type: 'chooseTrump'; choice: TrumpChoice }
  | { type: 'callThunee' }
  | { type: 'playCard'; card: Card }
  | { type: 'claimJodhi'; suit: Suit; withJack: boolean }
  | { type: 'callDouble' }
  | { type: 'callKhanaak' }
  | { type: 'challengePlay'; seat: Seat }
  | { type: 'challengeJodhi'; claim: number }
  | { type: 'nextRound' }
  | { type: 'rematch' }

export type RejectReason = TableReject | 'notYourTurn' | 'badAmount' | 'cardNotInHand'

// ── Events ───────────────────────────────────────────────────────────────

export type GameEvent =
  | TableEvent
  | { type: 'dealt'; roundNumber: number; dealer: Seat; half: 1 | 2 }
  | { type: 'called'; seat: Seat; amount: number }
  | { type: 'passed'; seat: Seat }
  | { type: 'trumpChosen'; seat: Seat; lastCard: boolean }
  | { type: 'dealCancelled' }
  | { type: 'thuneeCalled'; seat: Seat }
  | { type: 'trumpRevealed'; suit: Suit }
  | { type: 'cardPlayed'; seat: Seat; card: Card }
  | { type: 'trickWon'; seat: Seat; points: number }
  | { type: 'jodhiClaimed'; seat: Seat; suit: Suit; withJack: boolean; points: number }
  | { type: 'doubleCalled'; seat: Seat }
  | { type: 'khanaakCalled'; seat: Seat }
  | { type: 'challengeResolved'; challenger: Seat; accused: Seat; guilty: boolean }
  | { type: 'roundScored'; summary: RoundSummary }
  | { type: 'gameOver'; winner: Team }

export type ApplyResult = { game: Game; events: GameEvent[] } | { rejected: RejectReason }

// ── Views ────────────────────────────────────────────────────────────────

export interface ViewPlay {
  seat: Seat
  card: Card
}

export interface ViewTrick {
  /** Empty for all but the most recent trick in a player's view; see `Memory` in view.ts. */
  plays: ViewPlay[]
  winner: Seat
  half: 1 | 2
}

export interface ViewJodhi {
  seat: Seat
  suit: Suit
  withJack: boolean
  points: number
  /** Tricks completed when the claim was made. */
  trick: number
}

export type ViewPhase =
  | { kind: 'lobby' }
  | {
      kind: 'calling'
      hand: Card[]
      handCounts: number[]
      defaultTrumper: Seat
      call: { seat: Seat; amount: number } | null
      passed: Seat[]
      /** The viewer's own preselected trump, if any. */
      preselect: TrumpChoice | null
      deadline: number
    }
  | { kind: 'trumpSelection'; hand: Card[]; handCounts: number[]; trumper: Seat; callAmount: number }
  | {
      kind: 'thuneeWindow'
      hand: Card[]
      handCounts: number[]
      trumper: Seat
      /** Only the trumper sees trump before it is revealed. */
      trump: Suit | null
      callAmount: number
      pending: Seat | null
      passed: Seat[]
      deadline: number
    }
  | ViewPlaying
  | { kind: 'roundResult'; summary: RoundSummary }
  | { kind: 'gameOver'; winner: Team; summary: RoundSummary }

export interface ViewPlaying {
  kind: 'playing' | 'trickPause'
  hand: Card[]
  handCounts: number[]
  trumper: Seat
  callAmount: number
  trump: Suit | null
  trumpRevealed: boolean
  thunee: { caller: Seat } | null
  half: 1 | 2
  tricks: ViewTrick[]
  current: ViewPlay[]
  /** Whose turn it is; null during the trick pause. */
  turn: Seat | null
  jodhiClaims: ViewJodhi[]
  jodhiOpenFor: Team | null
  double: { caller: Seat } | null
  khanaak: { caller: Seat } | null
  deadline: number | null
}

/** The table's part (seats, host, owner, `waiting`) comes from the kit. */
export interface View extends TableView {
  playerCount: 2 | 4
  rules: RuleSet
  balls: [number, number]
  ballsTarget: number
  dealer: Seat
  roundNumber: number
  phase: ViewPhase
}
