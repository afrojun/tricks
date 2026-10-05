import { hasCard, sameCard } from '../../../kit/cards'
import { type Actor, type Ctx, type Seat, allSeats, checkLobbyHost, emptySeats, isTableAction, revealPersonas, settle, tableAction } from '../../../kit/table'
import { availableActions } from './available'
import { PASS_SIZE, PLAYERS, SEAT_COUNTS, STANDARD, resolveRules } from './rules'
import * as round from './round'
import { type Action, type ApplyResult, FORMAT_VERSION, type Game, type GameEvent, type RejectReason } from './types'
import { viewFor } from './view'

export function createGame(): Game {
  return {
    formatVersion: FORMAT_VERSION,
    playerCount: PLAYERS,
    seats: emptySeats(PLAYERS),
    host: null,
    waiting: [],
    aiActAt: null,
    aiSalt: 0,
    rules: STANDARD,
    scores: [0, 0, 0, 0],
    roundNumber: 0,
    phase: { kind: 'lobby' },
  }
}

/**
 * The only way game state changes. Never mutates `game`; never throws on
 * player input.
 */
export function apply(game: Game, actor: Actor, action: Action, ctx: Ctx): ApplyResult {
  const draft = structuredClone(game)
  const events: GameEvent[] = []
  const rejected = dispatch(draft, actor, action, ctx, events)
  if (rejected !== null) return { rejected }
  // A new phase starts every wait afresh: whoever passes last may also hold the two of clubs.
  if (draft.phase.kind !== game.phase.kind) draft.waiting = []
  const toAct = seatsToAct(draft)
  settle(draft, ctx, toAct, toAct)
  return { game: draft, events }
}

/** Seats that have something to decide right now: every seat still to choose its pass, or the seat to play. */
export function seatsToAct(game: Game): Seat[] {
  const phase = game.phase
  switch (phase.kind) {
    case 'passing':
      return allSeats(PLAYERS).filter((s) => phase.chosen[s] === null)
    case 'playing':
      return [phase.turn]
    default:
      return []
  }
}

/** The earliest moment the host must wake up for, if any. */
export function nextDeadline(game: Game): number | null {
  const phase = game.phase
  const phaseDeadline = 'deadline' in phase ? phase.deadline : null
  const times = [phaseDeadline, game.aiActAt].filter((t): t is number => t !== null)
  return times.length > 0 ? Math.min(...times) : null
}

function dispatch(game: Game, actor: Actor, action: Action, ctx: Ctx, events: GameEvent[]): RejectReason | null {
  if (isTableAction(action)) {
    const rejected = tableAction(game, actor, action, ctx, events, { seatCounts: SEAT_COUNTS })
    if (rejected !== null) return rejected
    if (action.type === 'start') {
      game.scores = [0, 0, 0, 0]
      game.roundNumber = 1
      round.beginRound(game, ctx, events)
    } else if (action.type === 'tick') tick(game, ctx, events)
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
    case 'choosePass': {
      if (phase.kind !== 'passing') return 'wrongPhase'
      if (can.pass.length === 0) return 'notAllowed'
      const cards = Array.isArray(action.cards) ? action.cards : []
      const distinct = cards.every((c, i) => !cards.slice(0, i).some((d) => sameCard(c, d)))
      if (cards.length !== PASS_SIZE || !distinct || !cards.every((c) => hasCard(can.pass, c))) return 'badChoice'
      round.choosePass(game, phase, seat, cards.map((c) => ({ suit: c.suit, rank: c.rank })), events)
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
      round.beginRound(game, ctx, events)
      return null

    case 'rematch':
      if (phase.kind !== 'gameOver') return 'wrongPhase'
      if (!can.rematch) return 'notHost'
      game.scores = [0, 0, 0, 0]
      game.roundNumber = 1
      revealPersonas(game)
      round.beginRound(game, ctx, events)
      return null

    default:
      return 'notAllowed'
  }
}

/** Resolves a phase deadline that has passed. Computer turns are driven by the host. */
function tick(game: Game, ctx: Ctx, events: GameEvent[]): void {
  const phase = game.phase
  if (phase.kind === 'trickPause' && phase.deadline <= ctx.now) round.afterTrick(game, phase.play, events)
}
