/** Helpers for tests and simulations. Not used by the app. */
import { type Suit, cardId, sameCard } from '../../../kit/cards'
import { copy } from '../../../kit/copy'
import { type Actor, type Ctx, type Seat, allSeats, nextSeat, settle } from '../../../kit/table'
import { deepFreeze, seededRng } from '../../../kit/testing'
import { apply, createGame } from './apply'
import { availableActions } from './available'
import { type Card, RANKS, type Rank, createDeck } from './cards'
import * as DEALS from './deals'
import { checkInvariants } from './invariants'
import { type RuleOverrides, blindNilOpen, handSize } from './rules'
import { firstLeader } from './round'
import type { Action, Game, GameEvent, RejectReason, RoundPlay } from './types'
import { viewFor } from './view'

const SUIT_LETTERS: Record<string, Suit> = { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' }

/** `card('Qs')`, `card('10h')`, `card('BJ')` and `card('LJ')` for the jokers. */
export function card(text: string): Card {
  if (text === 'BJ' || text === 'LJ') return { suit: 'spades', rank: text }
  const suit = SUIT_LETTERS[text.slice(-1)]
  const rank = text.slice(0, -1) as Rank
  if (!suit || !RANKS.includes(rank)) throw new Error(`bad card ${text}`)
  return { suit, rank }
}

export function cards(text: string): Card[] {
  return text.trim().split(/\s+/).filter(Boolean).map(card)
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

  /** Humans in every seat, the host at seat 0, with these rules. */
  constructor(playerCount: 2 | 3 | 4 = 4, overrides: RuleOverrides = {}, seed = 1) {
    this.rng = seededRng(seed)
    this.game = createGame()
    this.do(null, { type: 'sit', seat: 0, name: 'P0' })
    if (playerCount !== 4) this.do(0, { type: 'setPlayerCount', playerCount })
    for (const seat of allSeats(playerCount).slice(1)) this.do(null, { type: 'sit', seat, name: `P${seat}` })
    this.do(0, { type: 'setRules', overrides })
  }

  get ctx(): Ctx {
    return { now: this.now, rng: this.rng }
  }

  get count(): number {
    return this.game.playerCount
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

  /** Starts the game, or the next round, as dealt. */
  begin(): this {
    if (this.game.phase.kind === 'lobby') this.do(this.game.host, { type: 'start' })
    else if (this.game.phase.kind === 'roundResult') this.do(0, { type: 'nextRound' })
    return this
  }

  /**
   * Starts the game, or the next round, with these hands and this dealer, ready to call. With three, the card
   * left over is set aside; with two, the cards nobody holds are split between the discards.
   */
  deal(hands: string[], dealer: Seat = this.count - 1, scores?: number[]): this {
    this.begin()
    const dealt = hands.map(cards)
    const size = handSize(this.count)
    const deck = createDeck(this.game.rules.jokers)
    const ids = new Set(dealt.flat().map(cardId))
    if (dealt.length !== this.count || dealt.some((h) => h.length !== size) || ids.size !== size * this.count) throw new Error(`bad deal: ${dealt.map((h) => h.length)}`)
    const rest = deck.filter((c) => !ids.has(cardId(c)))
    if (rest.length + ids.size !== 52) throw new Error('a dealt card is not in the deck')
    const setAside = this.count === 3 ? rest[0] : null
    const discards = allSeats(this.count).map((s) => (this.count === 2 ? rest.slice(s * size, (s + 1) * size) : []))
    const game: Game = copy({ ...this.game, dealer, waiting: [] })
    if (scores !== undefined) game.scores = scores
    const looked = allSeats(this.count).map((s) => !blindNilOpen(game.rules, this.count, game.scores, s))
    game.phase = { kind: 'calling', hands: dealt, out: { setAside, discards }, calls: allSeats(this.count).map(() => null), looked, turn: nextSeat(dealer, this.count) }
    settle(game, this.ctx, [game.phase.turn], [game.phase.turn])
    this.game = game
    checkInvariants(this.game)
    return this
  }

  /** Each seat calls in turn: a number, `nil` or `blind`. Hands dealt face down are looked at first. */
  call(...calls: (number | 'nil' | 'blind')[]): this {
    for (const made of calls) {
      const phase = this.game.phase
      if (phase.kind !== 'calling') throw new Error(`expected calling, got ${phase.kind}`)
      const seat = phase.turn
      if (made === 'blind') this.do(seat, { type: 'callBlindNil' })
      else {
        if (!phase.looked[seat]) this.do(seat, { type: 'lookAtHand' })
        this.do(seat, { type: 'call', tricks: made === 'nil' ? 0 : made })
      }
    }
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

  /** Draws, calls 1, gives the first cards and plays the first legal card until the phase kind is one of `until`. */
  autoPlay(...until: Game['phase']['kind'][]): this {
    for (let guard = 0; guard < 2000; guard++) {
      const phase = this.game.phase
      if (until.includes(phase.kind)) return this
      if (phase.kind === 'trickPause') this.endPause()
      else if (phase.kind === 'drawing') this.do(phase.turn, { type: 'draw', keep: true })
      else if (phase.kind === 'calling') this.call(1)
      else if (phase.kind === 'exchanging') {
        const seat = phase.exchange.gave === null ? phase.exchange.blind : (phase.exchange.blind + 2) % 4
        this.do(seat, { type: 'giveCards', cards: phase.hands[seat].slice(0, 2) })
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
    const phase = this.game.phase
    if (phase.kind !== 'playing' && phase.kind !== 'calling' && phase.kind !== 'drawing') throw new Error(`no turn in ${phase.kind}`)
    return phase.turn
  }

  /** Who leads the first trick of the round about to be played. */
  get opener(): Seat {
    return firstLeader(this.game, playOf(this.game).hands)
  }
}

/** Whether `hand` holds `text`'s card. */
export const holds = (hand: readonly Card[], text: string) => hand.some((c) => sameCard(c, card(text)))

/**
 * A Blind nil exchange at four, which a new game never reaches (no side is 100 behind): before the Blind nil
 * player gives, and after, as the shared malformed-action check probes them.
 */
export function blindNilStates(): { label: string; game: Game }[] {
  const t = new Table(4, { blindNil: true }).deal(DEALS.FOUR, 3, [100, 250])
  t.do(0, { type: 'callBlindNil' }).call(4, 5, 4)
  const before = t.game
  t.do(0, { type: 'giveCards', cards: cards('As Ks') })
  return [
    { label: 'exchanging with 4', game: before },
    { label: 'exchanging, the gift given, with 4', game: t.game },
  ]
}
