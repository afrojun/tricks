import { removeCard, shuffle } from '../../../kit/cards'
import { firstCheat, recordPlay } from '../../../kit/integrity'
import { partnerOf } from '../../../kit/partners'
import { TRICK_PAUSE_MS } from '../../../kit/rules'
import { type Ctx, type Seat, allSeats, nextSeat } from '../../../kit/table'
import { trickWinner } from '../../../kit/tricks'
import { type Card, TRUMP, createDeck, strength, suitOf } from './cards'
import { breaksSpades, excusesFor, forcedOpening, lowestClub, situation } from './excuses'
import { blindNilOpen, handSize, sideCount, sideOf } from './rules'
import { contractOf, contractTricks, finishRound, takenBySeat } from './scoring'
import type { Call, Calling, Drawing, Exchanging, Game, GameEvent, Out, RoundPlay } from './types'

const noCards = (playerCount: number): Card[][] => allSeats(playerCount).map(() => [])

// ── Dealing and drawing ──────────────────────────────────────────────────

/** Deals the round, or with two players lays out the stock to draw from. */
export function beginRound(game: Game, ctx: Ctx, events: GameEvent[]): void {
  const count = game.playerCount
  const deck = shuffle(createDeck(game.rules.jokers), ctx.rng)
  game.aiSalt = Math.floor(ctx.rng() * 2 ** 32)
  events.push({ type: 'dealt', roundNumber: game.roundNumber, dealer: game.dealer })
  const left = nextSeat(game.dealer, count)
  if (count === 2) {
    game.phase = { kind: 'drawing', stock: deck, hands: noCards(count), out: { setAside: null, discards: noCards(count) }, turn: left }
    return
  }
  const size = handSize(count)
  const hands = allSeats(count).map((s) => deck.slice(s * size, (s + 1) * size))
  // With three, seventeen each leaves one card, which nobody sees.
  const setAside = count === 3 ? deck[count * size] : null
  startCalling(game, hands, { setAside, discards: noCards(count) })
}

/** The drawer keeps the top card and discards the next, or discards it and takes the next. */
export function draw(game: Game, phase: Drawing, seat: Seat, keep: boolean, events: GameEvent[]): void {
  const [top, next] = phase.stock
  phase.stock = phase.stock.slice(2)
  phase.hands[seat] = [...phase.hands[seat], keep ? top : next]
  phase.out.discards[seat] = [...phase.out.discards[seat], keep ? next : top]
  events.push({ type: 'drew', seat })
  if (phase.stock.length > 0) phase.turn = nextSeat(seat, game.playerCount)
  else startCalling(game, phase.hands, phase.out)
}

function startCalling(game: Game, hands: Card[][], out: Out): void {
  const count = game.playerCount
  // Only a seat that may call Blind nil gets its cards face down.
  const looked = allSeats(count).map((s) => !blindNilOpen(game.rules, count, game.scores, s))
  game.phase = { kind: 'calling', hands, out, calls: allSeats(count).map(() => null), looked, turn: nextSeat(game.dealer, count) }
}

// ── Calling ──────────────────────────────────────────────────────────────

export function lookAtHand(phase: Calling, seat: Seat): void {
  phase.looked[seat] = true
}

export function call(game: Game, phase: Calling, seat: Seat, made: Call, events: GameEvent[]): void {
  phase.calls[seat] = made
  // Calling Blind nil turns the hand up.
  phase.looked[seat] = true
  events.push({ type: 'called', seat, call: made })
  if (phase.calls.some((c) => c === null)) {
    phase.turn = nextSeat(seat, game.playerCount)
    return
  }
  const calls = phase.calls as Call[]
  const blind = calls.findIndex((c) => c.blind)
  if (blind !== -1 && partnerOf(blind, game.playerCount) !== null) {
    game.phase = { kind: 'exchanging', hands: phase.hands, out: phase.out, calls, exchange: { blind, gave: null, returned: null } }
    return
  }
  startPlay(game, phase.hands, phase.out, calls, null)
}

/** The seat that gives next in a Blind nil exchange: its player, then the partner. */
export function exchangeGiver(phase: Pick<Exchanging, 'exchange'>, playerCount: number): Seat {
  const { blind, gave } = phase.exchange
  return gave === null ? blind : (partnerOf(blind, playerCount) as Seat)
}

/** The Blind nil player gives two cards to its partner, who sees them and gives two back. */
export function giveCards(game: Game, phase: Exchanging, seat: Seat, cards: Card[], events: GameEvent[]): void {
  const to = seat === phase.exchange.blind ? (partnerOf(seat, game.playerCount) as Seat) : phase.exchange.blind
  phase.hands[seat] = cards.reduce((hand, c) => removeCard(hand, c), phase.hands[seat])
  phase.hands[to] = [...phase.hands[to], ...cards]
  events.push({ type: 'cardsGiven', seat })
  if (phase.exchange.gave === null) {
    phase.exchange = { ...phase.exchange, gave: cards }
    return
  }
  const exchange = { ...phase.exchange, returned: cards }
  events.push({ type: 'cardsExchanged' })
  startPlay(game, phase.hands, phase.out, phase.calls, exchange)
}

// ── Play ─────────────────────────────────────────────────────────────────

function startPlay(game: Game, hands: Card[][], out: Out, calls: Call[], exchange: RoundPlay['exchange']): void {
  const count = game.playerCount
  const play: RoundPlay = {
    hands,
    out,
    calls,
    tricks: [],
    current: [],
    spadesBroken: false,
    raised: allSeats(sideCount(count)).map(() => 0),
    settled: allSeats(count).map(() => 0),
    nilFailed: allSeats(count).map(() => false),
    exchange,
  }
  game.phase = { kind: 'playing', play, turn: firstLeader(game, hands) }
}

/** The player left of the dealer, or for a forced opening whoever holds the lowest club in play. */
export function firstLeader(game: Pick<Game, 'rules' | 'playerCount' | 'dealer'>, hands: readonly Card[][]): Seat {
  if (!forcedOpening(game.rules, game.playerCount)) return nextSeat(game.dealer, game.playerCount)
  const order = strength(game.rules.jokers)
  let leader = 0
  let low = Number.POSITIVE_INFINITY
  hands.forEach((hand, seat) => {
    const club = lowestClub(hand, game.rules)
    if (club !== null && order(club) < low) {
      low = order(club)
      leader = seat
    }
  })
  return leader
}

export function playCard(game: Game, play: RoundPlay, seat: Seat, card: Card, ctx: Ctx, events: GameEvent[]): void {
  const count = game.playerCount
  const hand = play.hands[seat]
  play.current.push(recordPlay(seat, card, hand, excusesFor(card, situation(play, game.rules), game.rules)))
  play.hands[seat] = removeCard(hand, card)
  events.push({ type: 'cardPlayed', seat, card })
  if (!play.spadesBroken && breaksSpades(card, game.rules)) {
    play.spadesBroken = true
    events.push({ type: 'spadesBroken' })
  }

  if (play.current.length < count) {
    game.phase = { kind: 'playing', play, turn: nextSeat(seat, count) }
    return
  }
  const winner = trickWinner(play.current, { trump: TRUMP, strength: strength(game.rules.jokers), suitOf: suitOf(game.rules.jokers) })
  const side = sideOf(winner, count)
  const before = contractTricks(side, play.calls, takenBySeat(play.tricks, count), count)
  play.tricks.push({ plays: play.current, winner })
  play.current = []
  events.push({ type: 'trickWon', seat: winner })
  const taken = takenBySeat(play.tricks, count)
  if (play.calls[winner].tricks === 0 && taken[winner] === 1 && !play.nilFailed[winner]) events.push({ type: 'nilBroken', seat: winner })
  const contract = contractOf(side, play.calls, play.raised, count)
  const after = contractTricks(side, play.calls, taken, count)
  if (contract > 0 && before < contract && after >= contract) events.push({ type: 'contractMade', side })
  game.phase = { kind: 'trickPause', play, deadline: ctx.now + TRICK_PAUSE_MS }
}

/** Runs when the trick pause ends: the winner leads the next trick, or the round is scored. */
export function afterTrick(game: Game, play: RoundPlay, events: GameEvent[]): void {
  if (play.tricks.length < handSize(game.playerCount)) {
    game.phase = { kind: 'playing', play, turn: play.tricks[play.tricks.length - 1].winner }
    return
  }
  finishRound(game, play, { kind: 'normal' }, events)
}

// ── Accusations ──────────────────────────────────────────────────────────

/** Every play of `seat` this round, in order. */
function playsOf(play: RoundPlay, seat: Seat) {
  return [...play.tricks.flatMap((t) => t.plays), ...play.current].filter((p) => p.seat === seat)
}

/** Whether `seat` has played a card this round that no accusation has judged yet. */
export function hasUnsettled(play: Pick<RoundPlay, 'settled'> & { tricks: readonly { plays: readonly { seat: Seat }[] }[]; current: readonly { seat: Seat }[] }, seat: Seat): boolean {
  let plays = 0
  for (const t of play.tricks) for (const p of t.plays) if (p.seat === seat) plays++
  for (const p of play.current) if (p.seat === seat) plays++
  return plays > play.settled[seat]
}

/**
 * Checks the accused's plays no accusation has judged yet. Under `renege: 'set'` the round ends with the guilty
 * side set (the accuser's, when wrong); under 'bidPlusThree' that side's contract rises by three, or a standing
 * Nil of the seat at fault fails, and play goes on with the accused's plays so far settled.
 */
export function challengePlay(game: Game, play: RoundPlay, challenger: Seat, accused: Seat, events: GameEvent[]): void {
  const own = playsOf(play, accused)
  const open = own.slice(play.settled[accused])
  const cheat = firstCheat(open, accused)
  const guilty = cheat !== null
  const penalty = game.rules.renege
  events.push({ type: 'challengeResolved', challenger, accused, guilty, penalty })
  const atFault = guilty ? accused : challenger
  if (penalty === 'set') {
    const card = (cheat ?? own[own.length - 1]).card
    const outcome = { kind: 'challenge', challenger, accused, guilty, rule: cheat?.broke[0] ?? null, card, setSide: sideOf(atFault, game.playerCount) } as const
    finishRound(game, play, outcome, events)
    return
  }
  play.settled = play.settled.map((n, s) => (s === accused ? own.length : n))
  // A Nil still standing fails; otherwise the side's contract rises.
  const standingNil = play.calls[atFault].tricks === 0 && !play.nilFailed[atFault] && takenBySeat(play.tricks, game.playerCount)[atFault] === 0
  if (standingNil) {
    play.nilFailed = play.nilFailed.map((failed, s) => failed || s === atFault)
  } else {
    const side = sideOf(atFault, game.playerCount)
    play.raised = play.raised.map((n, s) => (s === side ? n + 1 : n))
  }
}
