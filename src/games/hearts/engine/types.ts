import type { PlayRecord as KitPlayRecord } from '../../../kit/integrity'
import type { Seat, TableAction, TableEvent, TableReject, TableState, TableView } from '../../../kit/table'
import type { Card } from './cards'
import type { HeartsRules, PassDirection, RuleOverrides } from './rules'

export const FORMAT_VERSION = 3

// ── Game state ───────────────────────────────────────────────────────────

export interface Game extends TableState {
  rules: HeartsRules
  /** Each seat's total. Points are bad. */
  scores: number[]
  roundNumber: number
  phase: Phase
}

export type Phase = Lobby | Passing | Playing | TrickPause | RoundResult | GameOver

export interface Lobby {
  kind: 'lobby'
}

export interface Passing {
  kind: 'passing'
  hands: Card[][]
  direction: Exclude<PassDirection, 'none'>
  /** Hidden: the three cards each seat will give away, or null. They stay in the hand until the exchange. */
  chosen: (Card[] | null)[]
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
  /** Who has said Again; the next game starts when everyone at the table has. */
  again: Seat[]
  winner: Seat
  summary: RoundSummary
}

/** A card played, with the hidden hand it came from and the rules it broke. */
export type PlayRecord = KitPlayRecord<Card>

export interface CompletedTrick {
  plays: PlayRecord[]
  winner: Seat
}

export interface RoundPlay {
  hands: Card[][]
  tricks: CompletedTrick[]
  current: PlayRecord[]
  /** A heart has been played (or the queen of spades, under `queenBreaksHearts`). */
  heartsBroken: boolean
  /** The three cards each seat was given; empty in a round without passing. */
  received: Card[][]
  /** The three cards each seat gave away; empty in a round without passing. */
  gave: Card[][]
}

// ── Scoring ──────────────────────────────────────────────────────────────

export interface RoundSummary {
  roundNumber: number
  reason: 'normal' | 'moon' | 'challenge'
  /** This round, by seat. */
  points: number[]
  scoresAfter: number[]
  moon: Seat | null
  challenge?: { challenger: Seat; accused: Seat; guilty: boolean; rule: string | null; card: Card }
}

// ── Actions ──────────────────────────────────────────────────────────────

export type Action =
  | TableAction
  | { type: 'setRules'; overrides: RuleOverrides }
  | { type: 'choosePass'; cards: Card[] }
  | { type: 'playCard'; card: Card }
  | { type: 'challengePlay'; seat: Seat }
  | { type: 'nextRound' }
  /** Again: a vote, or with `now` the host starting the next game at once. */
  | { type: 'rematch'; now?: true }

export type RejectReason = TableReject | 'notYourTurn' | 'cardNotInHand' | 'illegalCard'

// ── Events ───────────────────────────────────────────────────────────────

export type GameEvent =
  | TableEvent
  | { type: 'dealt'; roundNumber: number; direction: PassDirection }
  | { type: 'passChosen'; seat: Seat }
  | { type: 'passesExchanged' }
  | { type: 'cardPlayed'; seat: Seat; card: Card }
  | { type: 'heartsBroken' }
  | { type: 'trickWon'; seat: Seat; points: number }
  | { type: 'challengeResolved'; challenger: Seat; accused: Seat; guilty: boolean }
  | { type: 'roundScored'; summary: RoundSummary }
  | { type: 'gameOver'; winner: Seat }

export type ApplyResult = { game: Game; events: GameEvent[] } | { rejected: RejectReason }

// ── Views ────────────────────────────────────────────────────────────────

export interface ViewPlay {
  seat: Seat
  card: Card
}

export interface ViewTrick {
  /** Empty for all but the most recent trick in a player's view; see `Memory`. */
  plays: ViewPlay[]
  winner: Seat
}

export interface ViewPassing {
  kind: 'passing'
  hand: Card[]
  handCounts: number[]
  /** Seats that have chosen their cards. */
  chosen: Seat[]
  /** The viewer's own chosen cards, if any. */
  choice: Card[] | null
}

export interface ViewPlaying {
  kind: 'playing' | 'trickPause'
  hand: Card[]
  handCounts: number[]
  tricks: ViewTrick[]
  current: ViewPlay[]
  /** Whose turn it is; null during the trick pause. */
  turn: Seat | null
  heartsBroken: boolean
  /** Points each seat has taken this round. */
  taken: number[]
  /** The cards the viewer was given and gave away; empty without passing or for a spectator. */
  received: Card[]
  gave: Card[]
  deadline: number | null
}

export type ViewPhase =
  | { kind: 'lobby' }
  | ViewPassing
  | ViewPlaying
  | { kind: 'roundResult'; summary: RoundSummary }
  | { kind: 'gameOver'; winner: Seat; summary: RoundSummary; again: Seat[] }

export interface View extends TableView {
  rules: HeartsRules
  scores: number[]
  roundNumber: number
  /** This round's pass direction; 'none' in a round without passing. */
  direction: PassDirection
  phase: ViewPhase
}
