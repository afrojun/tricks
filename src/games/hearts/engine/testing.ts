/** Helpers for tests and simulations. Not used by the app. */
import { type Suit, cardId, hasCard } from '../../../kit/cards'
import { type Actor, type Ctx, type Seat, allSeats } from '../../../kit/table'
import { deepFreeze, seededRng } from '../../../kit/testing'
import { apply, createGame } from './apply'
import { availableActions } from './available'
import { type Card, RANKS, type Rank, TWO_OF_CLUBS } from './cards'
import { checkInvariants } from './invariants'
import { PLAYERS, type RuleOverrides } from './rules'
import type { Action, Game, GameEvent, RejectReason, RoundPlay } from './types'
import { viewFor } from './view'

const SUIT_LETTERS: Record<string, Suit> = { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' }

/** `card('Qs')`, `card('10h')`, `card('2c')`. */
export function card(text: string): Card {
  const suit = SUIT_LETTERS[text.slice(-1)]
  const rank = text.slice(0, -1) as Rank
  if (!suit || !RANKS.includes(rank)) throw new Error(`bad card ${text}`)
  return { suit, rank }
}

export function cards(text: string): Card[] {
  return text.trim().split(/\s+/).map(card)
}

/** The round in play, or an error. */
export function playOf(game: Game): RoundPlay {
  if (game.phase.kind !== 'playing' && game.phase.kind !== 'trickPause') throw new Error(`expected play, got ${game.phase.kind}`)
  return game.phase.play
}

/** A test harness holding the current game and a clock. Every applied action is checked against the invariants. */
export class Table {
  game: Game
  now = 1_000_000
  rng: () => number
  events: GameEvent[] = []

  /** Four humans seated, the host at seat 0, with these rules. */
  constructor(overrides: RuleOverrides = {}, seed = 1) {
    this.rng = seededRng(seed)
    this.game = createGame()
    for (const seat of allSeats(PLAYERS)) this.do(null, { type: 'sit', seat, name: `P${seat}` })
    this.do(0, { type: 'setRules', overrides })
  }

  get ctx(): Ctx {
    return { now: this.now, rng: this.rng }
  }

  /** Applies an action and returns the rejection reason, or null on success. */
  try(actor: Actor, action: Action): RejectReason | null {
    deepFreeze(this.game)
    const result = apply(this.game, actor, action, this.ctx)
    if ('rejected' in result) return result.rejected
    this.game = result.game
    this.events.push(...result.events)
    checkInvariants(this.game)
    return null
  }

  /** Applies an action that is expected to succeed. */
  do(actor: Actor, action: Action): this {
    const rejected = this.try(actor, action)
    if (rejected !== null) throw new Error(`${JSON.stringify(action)} by ${actor} rejected: ${rejected}`)
    return this
  }

  advance(ms: number): this {
    this.now += ms
    return this.do('system', { type: 'tick' })
  }

  /**
   * Starts the game, or the next round, with these thirteen cards in each
   * hand. In a round with passing they are the hands before the pass.
   */
  deal(hands: string[]): this {
    if (this.game.phase.kind === 'lobby') this.do(this.game.host, { type: 'start' })
    else if (this.game.phase.kind === 'roundResult') this.do(0, { type: 'nextRound' })
    const dealt = hands.map(cards)
    const ids = new Set(dealt.flat().map(cardId))
    if (dealt.some((h) => h.length !== 13) || ids.size !== 52) throw new Error(`bad deal: ${dealt.map((h) => h.length)} cards, ${ids.size} unique`)
    const phase = this.game.phase
    if (phase.kind === 'passing') {
      this.game = { ...this.game, phase: { ...phase, hands: dealt } }
    } else if (phase.kind === 'playing') {
      const turn = dealt.findIndex((h) => hasCard(h, TWO_OF_CLUBS))
      this.game = {
        ...this.game,
        waiting: [{ seat: turn, since: this.now }],
        phase: { ...phase, play: { ...phase.play, hands: dealt }, turn },
      }
    } else throw new Error(`cannot deal in ${phase.kind}`)
    checkInvariants(this.game)
    return this
  }

  /** Each seat in order chooses its three cards. */
  pass(choices: string[]): this {
    choices.forEach((text, seat) => this.do(seat, { type: 'choosePass', cards: cards(text) }))
    return this
  }

  /** Plays cards in turn order; each entry is a card played by whoever's turn it is. Trick pauses are ended as needed. */
  play(text: string): this {
    for (const c of cards(text)) {
      this.endPause()
      const phase = this.game.phase
      if (phase.kind !== 'playing') throw new Error(`expected playing, got ${phase.kind}`)
      this.do(phase.turn, { type: 'playCard', card: c })
    }
    return this
  }

  /** Plays the first legal card (and passes the first three cards) until the phase kind is one of `until`. */
  autoPlay(...until: Game['phase']['kind'][]): this {
    for (let guard = 0; guard < 500; guard++) {
      const phase = this.game.phase
      if (until.includes(phase.kind)) return this
      if (phase.kind === 'trickPause') this.endPause()
      else if (phase.kind === 'passing') {
        const seat = phase.chosen.findIndex((c) => c === null)
        this.do(seat, { type: 'choosePass', cards: phase.hands[seat].slice(0, 3) })
      } else if (phase.kind === 'playing') {
        const legal = availableActions(viewFor(this.game, phase.turn)).legal
        this.do(phase.turn, { type: 'playCard', card: legal[0] })
      } else throw new Error(`autoPlay stuck in ${phase.kind}`)
    }
    throw new Error('autoPlay did not finish')
  }

  endPause(): this {
    if (this.game.phase.kind === 'trickPause') this.advance(2000)
    return this
  }

  /** The seat whose turn it is. */
  get turn(): Seat {
    if (this.game.phase.kind !== 'playing') throw new Error(`expected playing, got ${this.game.phase.kind}`)
    return this.game.phase.turn
  }
}
