import { firstCheat, recordPlay } from '../../../kit/integrity'
import { type Card, createDeck, pointsOf, removeCard, shuffle } from './cards'
import {
  holdsJodhi,
  holdsSixOfOneSuit,
  jodhiPoints,
  jodhiTimingOk,
  jodhiWaits,
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
    deadline: deadlineIn(game, ctx, game.rules.callTimerSeconds),
  }
  events.push({ type: 'dealt', roundNumber: game.roundNumber, dealer: game.dealer, half: 1 })
}

/** The counting side holds no trump: the same dealer deals the round again. */
function dealAgain(game: Game, ctx: Ctx, events: GameEvent[]): void {
  events.push({ type: 'dealCancelled' })
  beginRound(game, ctx, events)
}

/** When a timed window closes, or null without timers. */
function deadlineIn(game: Game, ctx: Ctx, seconds: number): number | null {
  return game.rules.timers ? ctx.now + seconds * 1000 : null
}

// ── Calling ──────────────────────────────────────────────────────────────

export function call(game: Game, phase: Calling, seat: Seat, action: RoundAction<'call'>, ctx: Ctx, events: GameEvent[]) {
  phase.call = { seat, amount: action.amount }
  phase.preselect = null
  phase.deadline = deadlineIn(game, ctx, game.rules.callTimerSeconds)
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

  const window: ThuneeWindow = {
    kind: 'thuneeWindow',
    hands,
    stock,
    trumper,
    trump,
    callAmount,
    pending: null,
    passed: [],
    deadline: deadlineIn(game, ctx, game.rules.thuneeWindowSeconds),
  }
  game.phase = window
  if ((game.rules.timers && game.rules.thuneeWindowSeconds <= 0) || undecidedThunee(game, window).length === 0) {
    startPlay(game, window, null, ctx, events)
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

export function callThunee(game: Game, phase: ThuneeWindow, seat: Seat, ctx: Ctx, events: GameEvent[]) {
  events.push({ type: 'thuneeCalled', seat })
  if (teamOf(seat) === teamOf(phase.trumper)) {
    startPlay(game, phase, seat, ctx, events)
    return
  }
  phase.pending = seat
  closeThuneeIfDone(game, phase, ctx, events)
}

export function passThunee(game: Game, phase: ThuneeWindow, seat: Seat, ctx: Ctx, events: GameEvent[]) {
  phase.passed.push(seat)
  closeThuneeIfDone(game, phase, ctx, events)
}

/** Seats the window still waits for. A held call only waits for the trumper's team, who alone can override it. */
export function waitingOnThunee(game: Game, phase: ThuneeWindow): Seat[] {
  return undecidedThunee(game, phase).filter((s) => phase.pending === null || teamOf(s) === teamOf(phase.trumper))
}

function closeThuneeIfDone(game: Game, phase: ThuneeWindow, ctx: Ctx, events: GameEvent[]) {
  if (waitingOnThunee(game, phase).length === 0) closeThunee(game, phase, ctx, events)
}

export function closeThunee(game: Game, phase: ThuneeWindow, ctx: Ctx, events: GameEvent[]) {
  startPlay(game, phase, phase.pending, ctx, events)
}

function startPlay(game: Game, phase: ThuneeWindow, thuneeCaller: Seat | null, ctx: Ctx, events: GameEvent[]) {
  // Every card is dealt, and everyone has seen their six: if the counting side holds no trump, deal again.
  // A Thunee has its own trump, and its own redeal (see `opponentsShowNoTrump`).
  if (thuneeCaller === null && game.rules.redealIfNoTrumps && game.playerCount === 4) {
    const counting = allSeats(4).filter((s) => teamOf(s) !== teamOf(phase.trumper))
    if (!counting.some((s) => phase.hands[s].some((c) => c.suit === phase.trump))) return dealAgain(game, ctx, events)
  }
  const play: RoundPlay = {
    hands: phase.hands,
    dealt: phase.hands.map((h) => [...h]),
    trumper: phase.trumper,
    callAmount: phase.callAmount,
    // Under Thunee the chosen trump is void: either no trump, or the caller's first card sets it.
    trump: thuneeCaller === null ? phase.trump : null,
    trumpRevealed: false,
    thunee: thuneeCaller === null ? null : { caller: thuneeCaller, sixOfASuit: holdsSixOfOneSuit(phase.hands[thuneeCaller]) },
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
  const redeal = game.rules.redealIfNoTrumps && opponentsShowNoTrump(game, play)
  // A computer leads as soon as the pause ends, so without timers its partner gets as long as they need;
  // and a person who called Thunee gets as long as they need to challenge before the cards are dealt again.
  const caller = play.thunee?.caller
  const waits = redeal
    ? !game.rules.timers && caller !== undefined && game.seats[caller].kind === 'human' && !game.seats[caller].standIn
    : jodhiWaits(game.seats, game.playerCount, game.rules, play.jodhiOpenFor, winner)
  game.phase = { kind: 'trickPause', play, deadline: waits ? null : ctx.now + TRICK_PAUSE_MS, redeal }
}

/**
 * In a four-player Thunee with a trump, whether both of the caller's opponents have shown they were dealt no
 * trump: each has played another suit to a trump lead and never played a trump. Then the Thunee cannot be
 * stopped, and the round is dealt again.
 */
function opponentsShowNoTrump(game: Game, play: RoundPlay): boolean {
  if (game.playerCount !== 4 || play.thunee === null || play.trump === null) return false
  const caller = play.thunee.caller
  const trumpLeads = play.tricks.filter((t) => t.plays[0].card.suit === play.trump)
  const playedTrump = (s: Seat) => play.tricks.some((t) => t.plays.some((p) => p.seat === s && p.card.suit === play.trump))
  return allSeats(4)
    .filter((s) => teamOf(s) !== teamOf(caller))
    .every((s) => !playedTrump(s) && trumpLeads.some((t) => t.plays.some((p) => p.seat === s && p.card.suit !== play.trump)))
}

/** Runs when the trick pause ends: next trick, second half, a new deal, or scoring. */
export function afterTrick(game: Game, play: RoundPlay, ctx: Ctx, events: GameEvent[]) {
  const redeal = game.phase.kind === 'trickPause' && game.phase.redeal
  const last = play.tricks[play.tricks.length - 1]
  const tricksThisHalf = play.tricks.filter((t) => t.half === play.half).length

  if (play.thunee !== null) {
    const result = thuneeTrickResult(game, play.thunee.caller, last.winner)
    if (!result.ok) return finishRound(game, play, { kind: 'thunee', success: false, partnerCatch: result.partnerCatch }, events)
    // A redeal the trick made plain comes first, even on the sixth trick, as the pause has told everyone.
    if (redeal) return dealAgain(game, ctx, events)
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
    // The counting player held no trump in the first six cards: if none came in the second six either, deal again.
    const counting = (1 - play.trumper) as Seat
    const holdsTrump = (cards: Card[]) => cards.some((c) => c.suit === play.trump)
    if (game.rules.redealIfNoTrumps && !holdsTrump(play.dealt[counting]) && !holdsTrump(play.hands[counting])) return dealAgain(game, ctx, events)
    play.dealt = play.hands.map((h) => [...h])
    play.half = 2
    game.phase = { kind: 'playing', play, turn: last.winner }
    events.push({ type: 'dealt', roundNumber: game.roundNumber, dealer: game.dealer, half: 2 })
    return
  }
  finishRound(game, play, { kind: 'normal' }, events)
}

// ── Claims and special calls ─────────────────────────────────────────────

/** Whether `seat` holds the cards a claim names: in hand now, or dealt this half, as the rules say. */
export function holdsClaim(game: Game, play: RoundPlay, seat: Seat, claim: RoundAction<'claimJodhi'>): boolean {
  const cards = game.rules.jodhiCards === 'inHand' ? play.hands[seat] : play.dealt[seat]
  return holdsJodhi(cards, claim.suit, claim.withJack)
}

export function claimJodhi(game: Game, play: RoundPlay, seat: Seat, action: RoundAction<'claimJodhi'>, events: GameEvent[]) {
  const points = jodhiPoints(action.suit, action.withJack, play.trump)
  play.jodhiClaims.push({
    seat,
    trick: play.tricks.length,
    suit: action.suit,
    withJack: action.withJack,
    points,
    valid: holdsClaim(game, play, seat, action),
  })
  events.push({ type: 'jodhiClaimed', seat, withJack: action.withJack, points })
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

export function challengeThunee(game: Game, play: RoundPlay, challenger: Seat, events: GameEvent[]) {
  const caller = play.thunee!.caller
  const outcome: Outcome = { kind: 'challenge', challenger, accused: caller, about: 'thunee', guilty: play.thunee!.sixOfASuit }
  events.push({ type: 'challengeResolved', challenger, accused: caller, guilty: outcome.guilty })
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
