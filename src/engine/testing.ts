/** Helpers for tests and simulations. Not used by the app. */
import { deepFreeze, seededRng } from '../kit/testing'
import { apply, createGame } from './apply'
import { type Card, type Rank, type Suit, createDeck, sameCard } from './cards'
import { type RuleOverrides, resolveRules } from './rules'
import { type Seat, allSeats, next, seatsFrom } from './seats'
import type { Action, Actor, Ctx, Game, GameEvent } from './types'
import { availableActions } from './available'
import { viewFor } from './view'

export { collectCards, deepFreeze, seededRng } from '../kit/testing'

const SUIT_LETTERS: Record<string, Suit> = { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' }

/** `card('Jh')`, `card('10s')`. */
export function card(text: string): Card {
  const suit = SUIT_LETTERS[text.slice(-1)]
  const rank = text.slice(0, -1) as Rank
  if (!suit || !['J', '9', 'A', '10', 'K', 'Q'].includes(rank)) throw new Error(`bad card ${text}`)
  return { suit, rank }
}

export function cards(text: string): Card[] {
  return text.trim().split(/\s+/).map(card)
}

/** A test harness holding the current game and a clock. */
export class Table {
  game: Game
  now = 1_000_000
  rng: () => number
  events: GameEvent[] = []

  constructor(playerCount: 2 | 4 = 4, overrides: RuleOverrides = {}, seed = 1) {
    this.rng = seededRng(seed)
    this.game = createGame()
    this.do(null, { type: 'sit', seat: 0, name: 'P0' })
    if (playerCount === 2) this.do(0, { type: 'setPlayerCount', playerCount: 2 })
    for (const seat of allSeats(playerCount).slice(1)) this.do(null, { type: 'sit', seat, name: `P${seat}` })
    this.game = { ...this.game, rules: resolveRules(overrides) }
  }

  get ctx(): Ctx {
    return { now: this.now, rng: this.rng }
  }

  /** Applies an action and returns the rejection reason, or null on success. */
  try(actor: Actor, action: Action) {
    deepFreeze(this.game)
    const result = apply(this.game, actor, action, this.ctx)
    if ('rejected' in result) return result.rejected
    this.game = result.game
    this.events.push(...result.events)
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
   * Starts a round in which each seat will end up with the given six cards
   * (first four dealt now, last two after trump). Leftover cards go to the
   * bottom of the stock.
   */
  deal(hands: string[], dealer: Seat = 0): this {
    if (this.game.phase.kind === 'lobby') this.do(this.game.host, { type: 'start' })
    else if (this.game.phase.kind === 'roundResult') this.do(0, { type: 'nextRound' })
    const n = this.game.playerCount
    const six = hands.map(cards)
    const order = seatsFrom(next(dealer, n), n)
    const used = six.flat()
    const rest = createDeck().filter((c) => !used.some((u) => sameCard(u, c)))
    const phase = this.game.phase
    if (phase.kind !== 'calling') throw new Error('expected calling')
    this.game = {
      ...this.game,
      dealer,
      phase: {
        ...phase,
        hands: six.map((h) => h.slice(0, 4)),
        stock: [...order.flatMap((s) => six[s].slice(4)), ...rest],
        defaultTrumper: next(dealer, n),
      },
    }
    return this
  }

  /** Closes calling with no call, then has the default trumper choose `trump`. */
  toPlay(trump: Suit | 'lastCard'): this {
    this.advance(this.game.rules.callTimerSeconds * 1000)
    const phase = this.game.phase
    if (phase.kind !== 'trumpSelection') throw new Error(`expected trumpSelection, got ${phase.kind}`)
    this.do(phase.trumper, { type: 'chooseTrump', choice: trump })
    if (this.game.phase.kind === 'thuneeWindow') this.advance(this.game.rules.thuneeWindowSeconds * 1000)
    return this
  }

  /** Plays cards in turn order; each entry is a card played by whoever's turn it is. */
  play(text: string): this {
    for (const c of cards(text)) {
      if (this.game.phase.kind === 'trickPause') this.advance(2000)
      const phase = this.game.phase
      if (phase.kind !== 'playing') throw new Error(`expected playing, got ${phase.kind}`)
      this.do(phase.turn, { type: 'playCard', card: c })
    }
    return this
  }

  /** Plays the first legal card for whoever's turn it is until the phase kind is one of `until`. */
  autoPlay(...until: Game['phase']['kind'][]): this {
    for (let guard = 0; guard < 200; guard++) {
      const phase = this.game.phase
      if (until.includes(phase.kind)) return this
      if (phase.kind === 'trickPause') this.advance(2000)
      else if (phase.kind === 'playing') {
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
}
