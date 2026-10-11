import type { PlayRecord as KitPlayRecord } from '../../../kit/integrity'
import type { Seat, TableAction, TableEvent, TableReject, TableState, TableView } from '../../../kit/table'
import type { Card } from './cards'
import type { RuleOverrides, SpadesRules } from './rules'

export const FORMAT_VERSION = 2

// ── Game state ───────────────────────────────────────────────────────────

export interface Game extends TableState {
  rules: SpadesRules
  /** Who dealt this round; the player on their left calls and, by default, leads first. */
  dealer: Seat
  /** By side: two partnerships with four players, otherwise each player. */
  scores: number[]
  /** Bags counted across the game, by side. */
  bags: number[]
  roundNumber: number
  phase: Phase
}

export type Phase = Lobby | Drawing | Calling | Exchanging | Playing | TrickPause | RoundResult | GameOver

export interface Lobby {
  kind: 'lobby'
}

/** A call: a number of tricks, or Nil (0), which may be blind. */
export interface Call {
  tricks: number
  /** Blind nil: called before looking at the hand. Only with `tricks` 0. */
  blind: boolean
}

/** The cards out of play for the whole round, so every card is accounted for in every phase. */
export interface Out {
  /** The card left over when three are dealt seventeen each; null otherwise. Nobody sees it. */
  setAside: Card | null
  /** By seat, the cards each player discarded while drawing with two; empty otherwise. Each saw its own. */
  discards: Card[][]
}

/** Two players draw from the stock in turn: each sees the top card, and keeps it or the next. */
export interface Drawing {
  kind: 'drawing'
  stock: Card[]
  hands: Card[][]
  out: Out
  turn: Seat
}

export interface Calling {
  kind: 'calling'
  hands: Card[][]
  out: Out
  calls: (Call | null)[]
  /** By seat, whether the player has seen the hand. False only for a seat that may call Blind nil. */
  looked: boolean[]
  turn: Seat
}

/** After a Blind nil with four: its player gives two cards to the partner, who sees them and gives two back. */
export interface Exchanging {
  kind: 'exchanging'
  hands: Card[][]
  out: Out
  calls: Call[]
  exchange: Exchange
}

export interface Exchange {
  /** The Blind nil player. */
  blind: Seat
  /** The two cards it gave, once given. */
  gave: Card[] | null
  /** The two its partner gave back, once given. */
  returned: Card[] | null
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
  /** The winning side. */
  winner: number
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
  out: Out
  calls: Call[]
  tricks: CompletedTrick[]
  current: PlayRecord[]
  /** A spade has been played: any card played as a spade, legal or not. */
  spadesBroken: boolean
  /** By side, how many "Bid plus three" penalties have raised its contract. */
  raised: number[]
  /** By seat, how many of its plays an accusation has already judged under "Bid plus three". */
  settled: number[]
  /** By seat, a Nil lost to a "Bid plus three" penalty, whatever it takes from then on. */
  nilFailed: boolean[]
  /** The Blind nil exchange this round, if there was one. */
  exchange: Exchange | null
}

// ── Scoring ──────────────────────────────────────────────────────────────

export interface NilResult {
  seat: Seat
  blind: boolean
  tricks: number
  /** Lost to a "Bid plus three" penalty rather than to a trick. */
  failed: boolean
  points: number
}

export interface SideResult {
  /** Its non-Nil players' calls added up, with any "Bid plus three" penalties. 0 for a side whose players all called Nil. */
  contract: number
  /** Tricks added to the contract by penalties. */
  raised: number
  /** Its non-Nil players' tricks. */
  tricks: number
  made: boolean
  /** Set by an accusation that ended the round. */
  set: boolean
  nils: NilResult[]
  /** Gained this round, each scoring 1. */
  bags: number
  /** 0, or minus 100 for each multiple of ten the count reached this round. */
  bagPenalty: number
  /** This round, all of it. */
  points: number
}

export interface RoundSummary {
  roundNumber: number
  reason: 'normal' | 'challenge'
  sides: SideResult[]
  scoresAfter: number[]
  bagsAfter: number[]
  challenge?: { challenger: Seat; accused: Seat; guilty: boolean; rule: string | null; card: Card }
}

// ── Actions ──────────────────────────────────────────────────────────────

export type Action =
  | TableAction
  | { type: 'setRules'; overrides: RuleOverrides }
  | { type: 'draw'; keep: boolean }
  | { type: 'lookAtHand' }
  /** A number of tricks, or 0 for Nil. */
  | { type: 'call'; tricks: number }
  | { type: 'callBlindNil' }
  | { type: 'giveCards'; cards: Card[] }
  | { type: 'playCard'; card: Card }
  | { type: 'challengePlay'; seat: Seat }
  | { type: 'nextRound' }
  /** Again: a vote, or with `now` the host starting the next game at once. */
  | { type: 'rematch'; now?: true }

export type RejectReason = TableReject | 'notYourTurn' | 'cardNotInHand' | 'illegalCard' | 'badCall'

// ── Events ───────────────────────────────────────────────────────────────

export type GameEvent =
  | TableEvent
  | { type: 'dealt'; roundNumber: number; dealer: Seat }
  | { type: 'drew'; seat: Seat }
  | { type: 'called'; seat: Seat; call: Call }
  | { type: 'cardsGiven'; seat: Seat }
  | { type: 'cardsExchanged' }
  | { type: 'cardPlayed'; seat: Seat; card: Card }
  | { type: 'spadesBroken' }
  | { type: 'trickWon'; seat: Seat }
  /** A Nil's first trick. */
  | { type: 'nilBroken'; seat: Seat }
  /** The trick that brings a side's tricks up to its contract. */
  | { type: 'contractMade'; side: number }
  /** The verdict, with the rule broken (null when not guilty) and the card that broke it, or the accused's last card. */
  | {
      type: 'challengeResolved'
      challenger: Seat
      accused: Seat
      guilty: boolean
      penalty: SpadesRules['renege']
      /** What befell the side at fault: set, its contract raised by three, or the Nil of the seat at fault lost. */
      effect: 'set' | 'raised' | 'nilFailed'
      rule: string | null
      card: Card
    }
  | { type: 'roundScored'; summary: RoundSummary }
  | { type: 'gameOver'; winner: number }

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

/** The cards of a Blind nil exchange, to its two players. */
export interface ViewExchange {
  blind: Seat
  /** To the Blind nil player and its partner only; null to anyone else, or before it is given. */
  gave: Card[] | null
  returned: Card[] | null
}

export interface ViewDrawing {
  kind: 'drawing'
  hand: Card[]
  handCounts: number[]
  stockCount: number
  /** The stock's top card, to the drawer on its turn; null to anyone else. */
  top: Card | null
  /** The viewer's own discards. */
  discards: Card[]
  turn: Seat
}

export interface ViewCalling {
  kind: 'calling'
  /** Empty until the viewer has looked. */
  hand: Card[]
  handCounts: number[]
  discards: Card[]
  calls: (Call | null)[]
  looked: boolean[]
  turn: Seat
}

export interface ViewExchanging {
  kind: 'exchanging'
  hand: Card[]
  handCounts: number[]
  discards: Card[]
  calls: Call[]
  exchange: ViewExchange
  /** Who gives next. */
  turn: Seat
}

export interface ViewPlaying {
  kind: 'playing' | 'trickPause'
  hand: Card[]
  handCounts: number[]
  discards: Card[]
  calls: Call[]
  /** By side, as the round stands: calls and any penalties. */
  contracts: number[]
  /** Tricks each seat has taken this round. */
  taken: number[]
  tricks: ViewTrick[]
  current: ViewPlay[]
  /** Whose turn it is; null during the trick pause. */
  turn: Seat | null
  spadesBroken: boolean
  settled: number[]
  nilFailed: boolean[]
  /** The Blind nil exchange, its cards shown only to its two players. */
  exchange: ViewExchange | null
  deadline: number | null
}

export type ViewPhase =
  | { kind: 'lobby' }
  | ViewDrawing
  | ViewCalling
  | ViewExchanging
  | ViewPlaying
  | { kind: 'roundResult'; summary: RoundSummary }
  | { kind: 'gameOver'; winner: number; summary: RoundSummary; again: Seat[] }

export interface View extends TableView {
  rules: SpadesRules
  dealer: Seat
  scores: number[]
  bags: number[]
  roundNumber: number
  phase: ViewPhase
}
