import { hasCard } from './cards'
import { availableActions, replaceableSeats } from './available'
import { emptySeats, fixHost, lobbyAction } from './lobby'
import { mayCall } from './predicates'
import { TRADITIONAL } from './rules'
import * as round from './round'
import { type Seat, allSeats } from './seats'
import { type Action, type Actor, type ApplyResult, type Ctx, FORMAT_VERSION, type Game, type GameEvent, type RejectReason } from './types'
import { viewFor } from './view'

export function createGame(): Game {
  return {
    formatVersion: FORMAT_VERSION,
    rules: TRADITIONAL,
    playerCount: 4,
    seats: emptySeats(4),
    host: null,
    balls: [0, 0],
    dealer: 0,
    khanaakCalled: false,
    lastRoundWinner: null,
    roundNumber: 0,
    aiActAt: null,
    aiSalt: 0,
    acting: null,
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
  schedule(draft, ctx)
  return { game: draft, events }
}

export function isAiControlled(game: Game, seat: Seat): boolean {
  const info = game.seats[seat]
  return info.kind === 'ai' || info.standIn
}

/** Seats that have something to decide right now. */
export function seatsToAct(game: Game): Seat[] {
  const phase = game.phase
  switch (phase.kind) {
    case 'calling':
      return allSeats(game.playerCount).filter((s) => mayCall(s, phase))
    case 'trumpSelection':
      return [phase.trumper]
    case 'thuneeWindow':
      return round.undecidedThunee(game, phase)
    case 'playing':
      return [phase.turn]
    default:
      return []
  }
}

/** The earliest moment the server must wake up for, if any. */
export function nextDeadline(game: Game): number | null {
  const phase = game.phase
  const phaseDeadline = 'deadline' in phase ? phase.deadline : null
  const times = [phaseDeadline, game.aiActAt].filter((t): t is number => t !== null)
  return times.length > 0 ? Math.min(...times) : null
}

const AI_DELAY_MIN_MS = 600
const AI_DELAY_SPREAD_MS = 600

/** Recomputes who the game is waiting on and when the next AI seat should act. */
function schedule(game: Game, ctx: Ctx): void {
  const phase = game.phase
  const waitingOn = phase.kind === 'trumpSelection' ? phase.trumper : phase.kind === 'playing' ? phase.turn : null
  if (waitingOn === null) game.acting = null
  else if (game.acting?.seat !== waitingOn) game.acting = { seat: waitingOn, since: ctx.now }

  const aiNeeded = seatsToAct(game).some((s) => isAiControlled(game, s))
  if (!aiNeeded) game.aiActAt = null
  else if (game.aiActAt === null || game.aiActAt <= ctx.now) {
    game.aiActAt = ctx.now + AI_DELAY_MIN_MS + Math.floor(ctx.rng() * AI_DELAY_SPREAD_MS)
  }
}

function dispatch(game: Game, actor: Actor, action: Action, ctx: Ctx, events: GameEvent[]): RejectReason | null {
  // System actions.
  if (action.type === 'tick' || action.type === 'setConnected') {
    if (actor !== 'system') return 'notAllowed'
    if (action.type === 'tick') tick(game, ctx, events)
    else {
      const seat = game.seats[action.seat]
      if (!seat || seat.kind !== 'human') return 'badSeat'
      seat.connected = action.connected
      fixHost(game)
      events.push({ type: 'seatChanged' })
    }
    return null
  }
  if (actor === 'system') return 'notAllowed'

  switch (action.type) {
    case 'sit':
    case 'leaveSeat':
    case 'rename':
    case 'addAi':
    case 'clearSeat':
    case 'setRules':
    case 'setPlayerCount':
    case 'start': {
      const rejected = lobbyAction(game, actor, action, ctx, events)
      if (rejected !== null) return rejected
      if (action.type === 'start') {
        game.balls = [0, 0]
        game.roundNumber = 1
        game.dealer = Math.floor(ctx.rng() * game.playerCount)
        round.beginRound(game, ctx, events)
      }
      return null
    }
  }

  if (actor === null) return 'notSeated'
  return roundAction(game, actor, action, ctx, events)
}

function roundAction(game: Game, seat: Seat, action: Action, ctx: Ctx, events: GameEvent[]): RejectReason | null {
  const can = availableActions(viewFor(game, seat))
  const phase = game.phase

  switch (action.type) {
    case 'call':
      if (phase.kind !== 'calling') return 'wrongPhase'
      if (!can.calls.includes(action.amount)) return can.calls.length > 0 ? 'badAmount' : 'notAllowed'
      round.call(game, phase, seat, action, ctx, events)
      return null

    case 'pass':
      if (!can.pass) return 'notAllowed'
      if (phase.kind === 'calling') round.passCall(game, phase, seat, ctx, events)
      else if (phase.kind === 'thuneeWindow') round.passThunee(game, phase, seat)
      return null

    case 'preselectTrump':
      if (phase.kind !== 'calling') return 'wrongPhase'
      if (!can.preselect.includes(action.choice)) return can.preselect.length > 0 ? 'badChoice' : 'notAllowed'
      phase.preselect = { seat, choice: action.choice }
      return null

    case 'chooseTrump':
      if (phase.kind !== 'trumpSelection') return 'wrongPhase'
      if (!can.chooseTrump.includes(action.choice)) return can.chooseTrump.length > 0 ? 'badChoice' : 'notYourTurn'
      round.chooseTrump(game, action.choice, ctx, events)
      return null

    case 'callThunee':
      if (phase.kind !== 'thuneeWindow') return 'wrongPhase'
      if (!can.callThunee) return 'notAllowed'
      round.callThunee(game, phase, seat, events)
      return null

    case 'playCard':
      if (phase.kind !== 'playing') return 'wrongPhase'
      if (phase.turn !== seat) return 'notYourTurn'
      if (!hasCard(can.play, action.card)) return 'cardNotInHand'
      round.playCard(game, phase.play, seat, action.card, ctx, events)
      return null

    case 'claimJodhi':
      if (phase.kind !== 'playing' && phase.kind !== 'trickPause') return 'wrongPhase'
      if (!can.claimJodhi.includes(action.suit)) return 'notAllowed'
      round.claimJodhi(game, phase.play, seat, action, events)
      return null

    case 'callDouble':
      if (phase.kind !== 'playing') return 'wrongPhase'
      if (!can.callDouble) return 'notAllowed'
      round.callDouble(phase.play, seat, events)
      return null

    case 'callKhanaak':
      if (phase.kind !== 'playing') return 'wrongPhase'
      if (!can.callKhanaak) return 'notAllowed'
      round.callKhanaak(game, phase.play, seat, events)
      return null

    case 'challengePlay':
      if (phase.kind !== 'playing' && phase.kind !== 'trickPause') return 'wrongPhase'
      if (!can.challengePlay.includes(action.seat)) return 'notAllowed'
      round.challengePlay(game, phase.play, seat, action.seat, events)
      return null

    case 'challengeJodhi':
      if (phase.kind !== 'playing' && phase.kind !== 'trickPause') return 'wrongPhase'
      if (!can.challengeJodhi.includes(action.claim)) return 'notAllowed'
      round.challengeJodhi(game, phase.play, seat, action.claim, events)
      return null

    case 'nextRound':
      if (!can.nextRound) return phase.kind === 'roundResult' ? 'notAllowed' : 'wrongPhase'
      game.roundNumber++
      round.beginRound(game, ctx, events)
      return null

    case 'rematch':
      if (phase.kind !== 'gameOver') return 'wrongPhase'
      if (!can.rematch) return 'notHost'
      game.balls = [0, 0]
      game.khanaakCalled = false
      game.lastRoundWinner = null
      game.roundNumber = 1
      game.dealer = Math.floor(ctx.rng() * game.playerCount)
      // A surprise persona revealed at game over stays revealed.
      for (const s of game.seats) s.personaHidden = false
      round.beginRound(game, ctx, events)
      return null

    case 'replaceWithAi': {
      if (phase.kind === 'lobby' || phase.kind === 'gameOver') return 'wrongPhase'
      const target = game.seats[action.seat]
      if (!target || target.kind !== 'human' || target.standIn || action.seat === seat) return 'badSeat'
      if (!replaceableSeats(viewFor(game, seat), ctx.now).includes(action.seat)) {
        return viewFor(game, seat).host === seat ? 'notAllowed' : 'notHost'
      }
      target.standIn = true
      events.push({ type: 'seatChanged' })
      return null
    }

    case 'reclaimSeat':
      if (!can.reclaimSeat) return 'notAllowed'
      game.seats[seat].standIn = false
      events.push({ type: 'seatChanged' })
      return null

    default:
      return 'notAllowed'
  }
}

/** Resolves a phase deadline that has passed. AI turns are driven by the server. */
function tick(game: Game, ctx: Ctx, events: GameEvent[]): void {
  const phase = game.phase
  if (!('deadline' in phase) || phase.deadline > ctx.now) return
  if (phase.kind === 'calling') round.closeCalling(game, phase, ctx, events)
  else if (phase.kind === 'thuneeWindow') round.closeThunee(game, phase)
  else if (phase.kind === 'trickPause') round.afterTrick(game, phase.play, events)
}
