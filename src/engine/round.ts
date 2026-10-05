import { firstCheat, recordPlay } from '../kit/integrity'
import { type Card, createDeck, pointsOf, removeCard, shuffle } from './cards'
import {
  holdsJodhi,
  jodhiPoints,
  jodhiTimingOk,
  mayCall,
  prospectiveTrumper,
  thuneeEligible,
} from './predicates'
import { TRICK_PAUSE_MS } from './rules'
import { type Seat, allSeats, next, seatsFrom, teamOf } from './seats'
import { type Outcome, finishRound, thuneeTrickResult } from './scoring'
import { excusesFor, trickWinner } from './tricks'
import type { Action, Calling, Ctx, Game, GameEvent, RoundPlay, ThuneeWindow, TrumpChoice } from './types'

type RoundAction<T extends Action['type']> = Extract<Action, { type: T }>

// ── Dealing ──────────────────────────────────────────────────────────────

function defaultTrumper(game: Game): Seat {
  const right = next(game.dealer, game.playerCount)
  if (game.rules.defaultTrumper === 'dealerRight') return right
  const [a, b] = game.balls
  const team = a > b ? 0 : b > a ? 1 : game.lastRoundWinner
  if (team === null) return right
  return seatsFrom(right, game.playerCount).find((s) => teamOf(s) === team)!
}

/** Deals `count` cards to each seat from the top of `stock`, starting at the dealer's right. */
function dealTo(hands: Card[][], stock: Card[], count: number, game: Game): void {
  for (const seat of seatsFrom(next(game.dealer, game.playerCount), game.playerCount)) {
    hands[seat].push(...stock.splice(0, count))
  }
}

export function beginRound(game: Game, ctx: Ctx, events: GameEvent[]): void {
  const stock = shuffle(createDeck(), ctx.rng)
  const hands: Card[][] = allSeats(game.playerCount).map(() => [])
  dealTo(hands, stock, 4, game)
  game.aiSalt = Math.floor(ctx.rng() * 2 ** 32)
  game.phase = {
    kind: 'calling',
    hands,
    stock,
    defaultTrumper: defaultTrumper(game),
    call: null,
    passed: [],
    preselect: null,
    deadline: ctx.now + game.rules.callTimerSeconds * 1000,
  }
  events.push({ type: 'dealt', roundNumber: game.roundNumber, dealer: game.dealer, half: 1 })
}

// ── Calling ──────────────────────────────────────────────────────────────

export function call(game: Game, phase: Calling, seat: Seat, action: RoundAction<'call'>, ctx: Ctx, events: GameEvent[]) {
  phase.call = { seat, amount: action.amount }
  phase.preselect = null
  phase.deadline = ctx.now + game.rules.callTimerSeconds * 1000
  events.push({ type: 'called', seat, amount: action.amount })
  closeCallingIfDone(game, phase, ctx, events)
}

export function passCall(game: Game, phase: Calling, seat: Seat, ctx: Ctx, events: GameEvent[]) {
  phase.passed.push(seat)
  events.push({ type: 'passed', seat })
  closeCallingIfDone(game, phase, ctx, events)
}

function closeCallingIfDone(game: Game, phase: Calling, ctx: Ctx, events: GameEvent[]) {
  if (!allSeats(game.playerCount).some((s) => mayCall(s, phase))) closeCalling(game, phase, ctx, events)
}

export function closeCalling(game: Game, phase: Calling, ctx: Ctx, events: GameEvent[]) {
  const trumper = prospectiveTrumper(phase)
  const callAmount = phase.call?.amount ?? 0
  game.phase = { kind: 'trumpSelection', hands: phase.hands, stock: phase.stock, trumper, callAmount }
  if (phase.preselect?.seat === trumper) chooseTrump(game, phase.preselect.choice, ctx, events)
}

// ── Trump and the final deal ─────────────────────────────────────────────

export function chooseTrump(game: Game, choice: TrumpChoice, ctx: Ctx, events: GameEvent[]) {
  if (game.phase.kind !== 'trumpSelection') return
  const { hands, stock, trumper, callAmount } = game.phase
  dealTo(hands, stock, 2, game)
  const trump = choice === 'lastCard' ? hands[trumper][5].suit : choice
  events.push({ type: 'trumpChosen', seat: trumper, lastCard: choice === 'lastCard' })

  if (game.rules.redealIfNoTrumps && game.playerCount === 4) {
    const counting = allSeats(4).filter((s) => teamOf(s) !== teamOf(trumper))
    if (!counting.some((s) => hands[s].some((c) => c.suit === trump))) {
      events.push({ type: 'dealCancelled' })
      beginRound(game, ctx, events)
      return
    }
  }

  const window: ThuneeWindow = {
    kind: 'thuneeWindow',
    hands,
    stock,
    trumper,
    trump,
    callAmount,
    pending: null,
    passed: [],
    deadline: ctx.now + game.rules.thuneeWindowSeconds * 1000,
  }
  game.phase = window
  if (game.rules.thuneeWindowSeconds <= 0 || undecidedThunee(game, window).length === 0) {
    startPlay(game, window, null)
  }
}

// ── Thunee window ────────────────────────────────────────────────────────

/** Seats that could still call Thunee or pass. */
export function undecidedThunee(game: Game, phase: ThuneeWindow): Seat[] {
  return allSeats(game.playerCount).filter(
    (s) =>
      thuneeEligible(s, phase.hands[s], phase.trumper, game.rules) &&
      !phase.passed.includes(s) &&
      phase.pending !== s,
  )
}

export function callThunee(game: Game, phase: ThuneeWindow, seat: Seat, events: GameEvent[]) {
  events.push({ type: 'thuneeCalled', seat })
  if (teamOf(seat) === teamOf(phase.trumper)) {
    startPlay(game, phase, seat)
    return
  }
  phase.pending = seat
  closeThuneeIfDone(game, phase)
}

export function passThunee(game: Game, phase: ThuneeWindow, seat: Seat) {
  phase.passed.push(seat)
  closeThuneeIfDone(game, phase)
}

function closeThuneeIfDone(game: Game, phase: ThuneeWindow) {
  // A held call only waits for the trumper's team, who alone can override it.
  const waitingOn = undecidedThunee(game, phase).filter(
    (s) => phase.pending === null || teamOf(s) === teamOf(phase.trumper),
  )
  if (waitingOn.length === 0) closeThunee(game, phase)
}

export function closeThunee(game: Game, phase: ThuneeWindow) {
  startPlay(game, phase, phase.pending)
}

function startPlay(game: Game, phase: ThuneeWindow, thuneeCaller: Seat | null) {
  const play: RoundPlay = {
    hands: phase.hands,
    dealt: phase.hands.map((h) => [...h]),
    trumper: phase.trumper,
    callAmount: phase.callAmount,
    // Under Thunee the chosen trump is void: either no trump, or the caller's first card sets it.
    trump: thuneeCaller === null ? phase.trump : null,
    trumpRevealed: false,
    thunee: thuneeCaller === null ? null : { caller: thuneeCaller },
    half: 1,
    stock: phase.stock,
    tricks: [],
    current: [],
    jodhiClaims: [],
    jodhiOpenFor: null,
    double: null,
    khanaak: null,
  }
  const leader =
    thuneeCaller === null
      ? next(phase.trumper, game.playerCount)
      : // The caller's first card can only set trump if it is the card led.
        game.rules.thuneeLeader === 'caller' || game.rules.thuneeTrump === 'firstCardLed'
        ? thuneeCaller
        : next(thuneeCaller, game.playerCount)
  game.phase = { kind: 'playing', play, turn: leader }
}

// ── Play ─────────────────────────────────────────────────────────────────

export function playCard(game: Game, play: RoundPlay, seat: Seat, card: Card, ctx: Ctx, events: GameEvent[]) {
  const hand = play.hands[seat]
  const trickSoFar = play.current.map((p) => p.card)
  const record = recordPlay(seat, card, hand, excusesFor(card, trickSoFar, play.trump, game.rules))
  const firstCardOfRound = play.tricks.length === 0 && play.current.length === 0

  if (play.current.length === 0) play.jodhiOpenFor = null
  play.current.push(record)
  play.hands[seat] = removeCard(hand, card)
  events.push({ type: 'cardPlayed', seat, card })

  if (play.thunee === null) {
    if (firstCardOfRound && play.trump !== null) {
      play.trumpRevealed = true
      events.push({ type: 'trumpRevealed', suit: play.trump })
    }
  } else if (
    game.rules.thuneeTrump === 'firstCardLed' &&
    seat === play.thunee.caller &&
    !play.trumpRevealed
  ) {
    play.trump = card.suit
    play.trumpRevealed = true
    events.push({ type: 'trumpRevealed', suit: card.suit })
  }

  if (play.current.length < game.playerCount) {
    game.phase = { kind: 'playing', play, turn: next(seat, game.playerCount) }
    return
  }

  const winner = trickWinner(play.current, play.trump)
  play.tricks.push({ plays: play.current, winner, half: play.half })
  events.push({ type: 'trickWon', seat: winner, points: pointsOf(play.current.map((p) => p.card)) })
  play.current = []

  const team = teamOf(winner)
  const thisHalf = play.tricks.filter((t) => t.half === play.half)
  const teamWins = thisHalf.filter((t) => teamOf(t.winner) === team).length
  // A claim must come before the next card is led, so the last trick of a hand opens none.
  const moreToPlay = thisHalf.length < 6
  play.jodhiOpenFor = play.thunee === null && moreToPlay && jodhiTimingOk(teamWins, game.rules) ? team : null
  game.phase = { kind: 'trickPause', play, deadline: ctx.now + TRICK_PAUSE_MS }
}

/** Runs when the trick pause ends: next trick, second half, or scoring. */
export function afterTrick(game: Game, play: RoundPlay, events: GameEvent[]) {
  const last = play.tricks[play.tricks.length - 1]
  const tricksThisHalf = play.tricks.filter((t) => t.half === play.half).length

  if (play.thunee !== null) {
    const result = thuneeTrickResult(game, play.thunee.caller, last.winner)
    if (!result.ok) return finishRound(game, play, { kind: 'thunee', success: false, partnerCatch: result.partnerCatch }, events)
    if (tricksThisHalf === 6) return finishRound(game, play, { kind: 'thunee', success: true, partnerCatch: false }, events)
  }

  if (tricksThisHalf < 6) {
    game.phase = { kind: 'playing', play, turn: last.winner }
    return
  }
  if (play.khanaak !== null) return finishRound(game, play, { kind: 'khanaak' }, events)
  if (play.double !== null) return finishRound(game, play, { kind: 'double' }, events)

  if (game.playerCount === 2 && play.half === 1) {
    // Second half: the remaining twelve cards; trump and the call carry over.
    play.hands = [[], []]
    dealTo(play.hands, play.stock, 6, game)
    play.dealt = play.hands.map((h) => [...h])
    play.half = 2
    game.phase = { kind: 'playing', play, turn: last.winner }
    events.push({ type: 'dealt', roundNumber: game.roundNumber, dealer: game.dealer, half: 2 })
    return
  }
  finishRound(game, play, { kind: 'normal' }, events)
}

// ── Claims and special calls ─────────────────────────────────────────────

export function claimJodhi(game: Game, play: RoundPlay, seat: Seat, action: RoundAction<'claimJodhi'>, events: GameEvent[]) {
  const cards = game.rules.jodhiCards === 'inHand' ? play.hands[seat] : play.dealt[seat]
  const points = jodhiPoints(action.suit, action.withJack, play.trump)
  play.jodhiClaims.push({
    seat,
    trick: play.tricks.length,
    suit: action.suit,
    withJack: action.withJack,
    points,
    valid: holdsJodhi(cards, action.suit, action.withJack),
  })
  events.push({ type: 'jodhiClaimed', seat, suit: action.suit, withJack: action.withJack, points })
}

export function callDouble(play: RoundPlay, seat: Seat, events: GameEvent[]) {
  play.double = { caller: seat }
  events.push({ type: 'doubleCalled', seat })
}

export function callKhanaak(game: Game, play: RoundPlay, seat: Seat, events: GameEvent[]) {
  play.khanaak = { caller: seat }
  game.khanaakCalled = true
  events.push({ type: 'khanaakCalled', seat })
}

// ── Challenges ───────────────────────────────────────────────────────────

export function challengePlay(game: Game, play: RoundPlay, challenger: Seat, accused: Seat, events: GameEvent[]) {
  const plays = [...play.tricks.flatMap((t) => t.plays), ...play.current]
  const cheat = firstCheat(plays, accused)
  const own = plays.filter((p) => p.seat === accused)
  const outcome: Outcome = {
    kind: 'challenge',
    challenger,
    accused,
    about: 'play',
    guilty: cheat !== null,
    card: (cheat ?? own[own.length - 1]).card,
    rule: cheat?.broke[0],
  }
  events.push({ type: 'challengeResolved', challenger, accused, guilty: outcome.guilty })
  finishRound(game, play, outcome, events)
}

export function challengeJodhi(game: Game, play: RoundPlay, challenger: Seat, index: number, events: GameEvent[]) {
  const claim = play.jodhiClaims[index]
  const outcome: Outcome = {
    kind: 'challenge',
    challenger,
    accused: claim.seat,
    about: 'jodhi',
    guilty: !claim.valid,
    suit: claim.suit,
  }
  events.push({ type: 'challengeResolved', challenger, accused: claim.seat, guilty: outcome.guilty })
  finishRound(game, play, outcome, events)
}
