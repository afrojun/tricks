import { hasCard, removeCard, shuffle } from '../../../kit/cards'
import { firstCheat, recordPlay } from '../../../kit/integrity'
import { TRICK_PAUSE_MS } from '../../../kit/rules'
import { type Ctx, type Seat, allSeats, nextSeat } from '../../../kit/table'
import { trickWinner } from '../../../kit/tricks'
import { type Card, TWO_OF_CLUBS, createDeck, strength, trickPoints } from './cards'
import { breaksHearts, excusesFor, situation } from './excuses'
import { HAND_SIZE, PLAYERS, passDirection, passTarget } from './rules'
import { finishRound } from './scoring'
import type { Game, GameEvent, Passing, RoundPlay } from './types'

const noCards = (): Card[][] => allSeats(PLAYERS).map(() => [])

// ── Dealing and passing ──────────────────────────────────────────────────

export function beginRound(game: Game, ctx: Ctx, events: GameEvent[]): void {
  const deck = shuffle(createDeck(), ctx.rng)
  const hands = allSeats(PLAYERS).map((s) => deck.slice(s * HAND_SIZE, (s + 1) * HAND_SIZE))
  game.aiSalt = Math.floor(ctx.rng() * 2 ** 32)
  const direction = passDirection(game.rules, game.roundNumber)
  events.push({ type: 'dealt', roundNumber: game.roundNumber, direction })
  if (direction === 'none') startPlay(game, hands, noCards(), noCards())
  else game.phase = { kind: 'passing', hands, direction, chosen: allSeats(PLAYERS).map(() => null) }
}

/** Locks in a seat's three cards; when the fourth seat has chosen, the cards change hands. */
export function choosePass(game: Game, phase: Passing, seat: Seat, cards: Card[], events: GameEvent[]): void {
  phase.chosen[seat] = cards
  events.push({ type: 'passChosen', seat })
  if (phase.chosen.some((c) => c === null)) return

  const gave = phase.chosen as Card[][]
  const received = noCards()
  const hands = phase.hands.map((hand, s) => gave[s].reduce((h, c) => removeCard(h, c), hand))
  for (const from of allSeats(PLAYERS)) {
    const to = passTarget(from, phase.direction)
    received[to] = gave[from].map((c) => ({ ...c }))
    hands[to] = [...hands[to], ...received[to]]
  }
  events.push({ type: 'passesExchanged' })
  startPlay(game, hands, received, gave)
}

function startPlay(game: Game, hands: Card[][], received: Card[][], gave: Card[][]): void {
  const play: RoundPlay = { hands, tricks: [], current: [], heartsBroken: false, received, gave }
  game.phase = { kind: 'playing', play, turn: hands.findIndex((h) => hasCard(h, TWO_OF_CLUBS)) }
}

// ── Play ─────────────────────────────────────────────────────────────────

export function playCard(game: Game, play: RoundPlay, seat: Seat, card: Card, ctx: Ctx, events: GameEvent[]): void {
  const hand = play.hands[seat]
  play.current.push(recordPlay(seat, card, hand, excusesFor(card, situation(play), game.rules)))
  play.hands[seat] = removeCard(hand, card)
  events.push({ type: 'cardPlayed', seat, card })
  if (!play.heartsBroken && breaksHearts(card, game.rules)) {
    play.heartsBroken = true
    events.push({ type: 'heartsBroken' })
  }

  if (play.current.length < PLAYERS) {
    game.phase = { kind: 'playing', play, turn: nextSeat(seat, PLAYERS) }
    return
  }
  const winner = trickWinner(play.current, { trump: null, strength })
  events.push({ type: 'trickWon', seat: winner, points: trickPoints(play.current.map((p) => p.card), game.rules) })
  play.tricks.push({ plays: play.current, winner })
  play.current = []
  game.phase = { kind: 'trickPause', play, deadline: ctx.now + TRICK_PAUSE_MS }
}

/** Runs when the trick pause ends: the winner leads the next trick, or the round is scored. */
export function afterTrick(game: Game, play: RoundPlay, events: GameEvent[]): void {
  if (play.tricks.length < HAND_SIZE) {
    game.phase = { kind: 'playing', play, turn: play.tricks[play.tricks.length - 1].winner }
    return
  }
  finishRound(game, play, { kind: 'normal' }, events)
}

// ── Accusations ──────────────────────────────────────────────────────────

/** Checks every play the accused has made this round. The round ends at once. */
export function challengePlay(game: Game, play: RoundPlay, challenger: Seat, accused: Seat, events: GameEvent[]): void {
  const plays = [...play.tricks.flatMap((t) => t.plays), ...play.current]
  const cheat = firstCheat(plays, accused)
  const own = plays.filter((p) => p.seat === accused)
  const guilty = cheat !== null
  events.push({ type: 'challengeResolved', challenger, accused, guilty })
  finishRound(game, play, { kind: 'challenge', challenger, accused, guilty, rule: cheat?.broke[0] ?? null, card: (cheat ?? own[own.length - 1]).card }, events)
}
