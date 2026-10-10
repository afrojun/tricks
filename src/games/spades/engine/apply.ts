import { hasCard, sameCard } from '../../../kit/cards'
import { copy } from '../../../kit/copy'
import { type Actor, type Ctx, type Seat, againComplete, checkLobbyHost, emptySeats, isTableAction, redrawSurprises, screen, settle, tableAction } from '../../../kit/table'
import { availableActions } from './available'
import { DEFAULT_PLAYERS, EXCHANGE_SIZE, SEAT_COUNTS, STANDARD, resolveRules, sideCount } from './rules'
import * as round from './round'
import { actionShape } from './schema'
import { type Action, type ApplyResult, FORMAT_VERSION, type Game, type GameEvent, type RejectReason } from './types'
import { viewFor } from './view'

export function createGame(): Game {
  return {
    formatVersion: FORMAT_VERSION,
    playerCount: DEFAULT_PLAYERS,
    seats: emptySeats(DEFAULT_PLAYERS),
    host: null,
    waiting: [],
    aiActAt: null,
    aiSalt: 0,
    rules: STANDARD,
    dealer: 0,
    scores: [0, 0],
    bags: [0, 0],
    roundNumber: 0,
    phase: { kind: 'lobby' },
  }
}

/** The only way game state changes. Never mutates `game`; never throws on player input. */
export function apply(game: Game, actor: Actor, action: Action, ctx: Ctx): ApplyResult {
  const screened = screen(game, actor, action, actionShape)
  if ('rejected' in screened) return screened
  const draft = copy(game)
  const result = stepScreened(draft, actor, screened.action, ctx)
  return 'rejected' in result ? result : { game: draft, events: result.events }
}

/**
 * The in-place half of `apply`: changes `draft` and returns the events. On a rejection the draft is left as it
 * was, since every action is checked before anything is changed. The caller must own the draft.
 */
export function step(draft: Game, actor: Actor, action: Action, ctx: Ctx): { events: GameEvent[] } | { rejected: RejectReason } {
  // Checked before any field is read: a client could send anything at all.
  const screened = screen(draft, actor, action, actionShape)
  return 'rejected' in screened ? screened : stepScreened(draft, actor, screened.action, ctx)
}

/** `step` for an action of a known good shape. It is checked against the rules as any other. */
export function stepScreened(draft: Game, actor: Actor, action: Action, ctx: Ctx): { events: GameEvent[] } | { rejected: RejectReason } {
  const kind = draft.phase.kind
  const events: GameEvent[] = []
  const rejected = dispatch(draft, actor, action, ctx, events)
  if (rejected !== null) return { rejected }
  // A new phase starts every wait afresh.
  if (draft.phase.kind !== kind) draft.waiting = []
  const toAct = seatsToAct(draft)
  settle(draft, ctx, toAct, toAct)
  return { events }
}

/** Seats that have something to decide right now: the seat to draw, call, give or play. */
export function seatsToAct(game: Game): Seat[] {
  const phase = game.phase
  switch (phase.kind) {
    case 'drawing':
    case 'calling':
    case 'playing':
      return [phase.turn]
    case 'exchanging':
      return [round.exchangeGiver(phase, game.playerCount)]
    default:
      return []
  }
}

/** The earliest moment the host must wake up for, if any. */
export function nextDeadline(game: Game): number | null {
  const phase = game.phase
  const phaseDeadline = 'deadline' in phase ? phase.deadline : null
  if (phaseDeadline === null || game.aiActAt === null) return phaseDeadline ?? game.aiActAt
  return Math.min(phaseDeadline, game.aiActAt)
}

function dispatch(game: Game, actor: Actor, action: Action, ctx: Ctx, events: GameEvent[]): RejectReason | null {
  if (isTableAction(action)) {
    const rejected = tableAction(game, actor, action, ctx, events, { seatCounts: SEAT_COUNTS })
    if (rejected !== null) return rejected
    if (action.type === 'start') newGame(game, ctx, events)
    else if (action.type === 'tick') tick(game, ctx, events)
    return null
  }
  // Everyone has said Again: the host's due step starts the next game.
  if (actor === 'system' && action.type === 'rematch') {
    if (game.phase.kind !== 'gameOver' || !againComplete(game, game.phase.again)) return 'notAllowed'
    redrawSurprises(game, ctx)
    newGame(game, ctx, events)
    return null
  }
  if (actor === 'system') return 'notAllowed'

  if (action.type === 'setRules') {
    const rejected = checkLobbyHost(game, actor)
    if (rejected !== null) return rejected
    game.rules = resolveRules(action.overrides)
    events.push({ type: 'seatChanged' })
    return null
  }

  if (actor === null) return 'notSeated'
  return roundAction(game, actor, action, ctx, events)
}

function roundAction(game: Game, seat: Seat, action: Action, ctx: Ctx, events: GameEvent[]): RejectReason | null {
  const can = availableActions(viewFor(game, seat))
  const phase = game.phase

  switch (action.type) {
    case 'draw':
      if (phase.kind !== 'drawing') return 'wrongPhase'
      if (!can.draw) return 'notYourTurn'
      round.draw(game, phase, seat, action.keep, events)
      return null

    case 'lookAtHand':
      if (phase.kind !== 'calling') return 'wrongPhase'
      if (!can.look) return 'notAllowed'
      round.lookAtHand(phase, seat)
      return null

    case 'call':
      if (phase.kind !== 'calling') return 'wrongPhase'
      if (phase.turn !== seat) return 'notYourTurn'
      if (!can.calls.includes(action.tricks)) return 'badCall'
      round.call(game, phase, seat, { tricks: action.tricks, blind: false }, events)
      return null

    case 'callBlindNil':
      if (phase.kind !== 'calling') return 'wrongPhase'
      if (phase.turn !== seat) return 'notYourTurn'
      if (!can.blindNil) return 'badCall'
      round.call(game, phase, seat, { tricks: 0, blind: true }, events)
      return null

    case 'giveCards': {
      if (phase.kind !== 'exchanging') return 'wrongPhase'
      if (can.give.length === 0) return 'notYourTurn'
      const cards = action.cards
      const distinct = cards.every((c, i) => !cards.slice(0, i).some((d) => sameCard(c, d)))
      if (cards.length !== EXCHANGE_SIZE || !distinct || !cards.every((c) => hasCard(can.give, c))) return 'badChoice'
      round.giveCards(game, phase, seat, cards.map((c) => ({ suit: c.suit, rank: c.rank })), events)
      return null
    }

    case 'playCard': {
      if (phase.kind !== 'playing') return 'wrongPhase'
      if (phase.turn !== seat) return 'notYourTurn'
      const card = action.card
      if (!hasCard(phase.play.hands[seat], card)) return 'cardNotInHand'
      if (!hasCard(can.play, card)) return 'illegalCard'
      round.playCard(game, phase.play, seat, { suit: card.suit, rank: card.rank }, ctx, events)
      return null
    }

    case 'challengePlay':
      if (phase.kind !== 'playing' && phase.kind !== 'trickPause') return 'wrongPhase'
      if (!can.challengePlay.includes(action.seat)) return 'notAllowed'
      round.challengePlay(game, phase.play, seat, action.seat, events)
      return null

    case 'nextRound':
      if (!can.nextRound) return phase.kind === 'roundResult' ? 'notAllowed' : 'wrongPhase'
      game.roundNumber++
      game.dealer = (game.dealer + 1) % game.playerCount
      round.beginRound(game, ctx, events)
      return null

    case 'rematch':
      if (phase.kind !== 'gameOver') return 'wrongPhase'
      if (action.now) {
        if (!can.rematch) return 'notHost'
        redrawSurprises(game, ctx)
        newGame(game, ctx, events)
      } else {
        if (!can.again) return 'notAllowed'
        phase.again = [...phase.again, seat].sort((a, b) => a - b)
      }
      return null

    default:
      return 'notAllowed'
  }
}

/** A new game, with the same seats and rules: scores and bags by side, and a dealer drawn at random. */
function newGame(game: Game, ctx: Ctx, events: GameEvent[]): void {
  const sides = sideCount(game.playerCount)
  game.scores = Array.from({ length: sides }, () => 0)
  game.bags = Array.from({ length: sides }, () => 0)
  game.roundNumber = 1
  game.dealer = Math.floor(ctx.rng() * game.playerCount)
  round.beginRound(game, ctx, events)
}

/** Resolves a phase deadline that has passed. Computer turns are driven by the host. */
function tick(game: Game, ctx: Ctx, events: GameEvent[]): void {
  const phase = game.phase
  if (phase.kind === 'trickPause' && phase.deadline <= ctx.now) round.afterTrick(game, phase.play, events)
}
