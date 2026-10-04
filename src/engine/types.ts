import type { Card, Suit } from './cards'
import type { RuleOverrides, RuleSet } from './rules'
import type { Seat, Team } from './seats'

export const FORMAT_VERSION = 2

/** Who is acting: a seated player, an unseated connection, or the server. */
export type Actor = Seat | null | 'system'

export interface Ctx {
  now: number
  rng: () => number
}

export type TrumpChoice = Suit | 'lastCard'

// ── Seats ────────────────────────────────────────────────────────────────

/** How a computer player behaves about cheating and challenging. */
export const PERSONAS = ['straight', 'sharp', 'sly', 'wild'] as const
export type Persona = (typeof PERSONAS)[number]

export interface SeatInfo {
  name: string
  kind: 'empty' | 'human' | 'ai'
  connected: boolean
  /** A human seat temporarily played by the AI. */
  standIn: boolean
  /** Only matters for computer seats; human and empty seats carry 'straight'. */
  persona: Persona
  /** Chosen by "Surprise me": kept out of views until the game is over. */
  personaHidden: boolean
}

/** A seat as a view shows it: a hidden persona is null. */
export type ViewSeat = Omit<SeatInfo, 'persona'> & { persona: Persona | null }

// ── Game state ───────────────────────────────────────────────────────────

export interface Game {
  formatVersion: number
  rules: RuleSet
  playerCount: 2 | 4
  seats: SeatInfo[]
  host: Seat | null
  balls: [number, number]
  dealer: Seat
  khanaakCalled: boolean
  lastRoundWinner: Team | null
  roundNumber: number
  /** When the next AI-controlled seat should act, if any needs to. */
  aiActAt: number | null
  /** Hidden: seeds the computer players' chance rolls for this round. Never in a view. */
  aiSalt: number
  /** The single seat the game is waiting on, and since when. */
  acting: { seat: Seat; since: number } | null
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

export interface PlayRecord {
  seat: Seat
  card: Card
  /** Hidden: the hand the card was played from. */
  handBefore: Card[]
  /** Hidden: whether the play obeyed the rules. */
  legal: boolean
}

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
  }
}

// ── Actions ──────────────────────────────────────────────────────────────

export type Action =
  // lobby
  | { type: 'sit'; seat: Seat; name: string }
  | { type: 'leaveSeat' }
  | { type: 'rename'; name: string }
  | { type: 'addAi'; seat: Seat; persona?: Persona | 'surprise' }
  | { type: 'clearSeat'; seat: Seat }
  | { type: 'setRules'; overrides: RuleOverrides }
  | { type: 'setPlayerCount'; playerCount: 2 | 4 }
  | { type: 'start' }
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
  | { type: 'replaceWithAi'; seat: Seat }
  | { type: 'reclaimSeat' }
  // system
  | { type: 'tick' }
  | { type: 'setConnected'; seat: Seat; connected: boolean }

export type RejectReason =
  | 'notAllowed'
  | 'wrongPhase'
  | 'notYourTurn'
  | 'notHost'
  | 'seatTaken'
  | 'alreadySeated'
  | 'notSeated'
  | 'badName'
  | 'badSeat'
  | 'seatsNotFilled'
  | 'badAmount'
  | 'cardNotInHand'
  | 'badChoice'

// ── Events ───────────────────────────────────────────────────────────────

export type GameEvent =
  | { type: 'seatChanged' }
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

export interface View {
  /** The viewer's seat; null for a spectator. */
  seat: Seat | null
  seats: ViewSeat[]
  /** Who may use the host's powers now: the owner, or a stand-in while they are away. */
  host: Seat | null
  /** The seat the host role belongs to. */
  owner: Seat | null
  playerCount: 2 | 4
  rules: RuleSet
  balls: [number, number]
  ballsTarget: number
  dealer: Seat
  roundNumber: number
  acting: { seat: Seat; since: number } | null
  phase: ViewPhase
}
