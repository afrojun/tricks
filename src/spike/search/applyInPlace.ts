/**
 * Prototype of the one engine change the search wants: `apply` without the
 * `structuredClone`, for a private copy of a game that nobody else holds.
 * A trimmed copy of `src/engine/apply.ts` covering the actions a rollout
 * takes (card play, claims, Double, Khanaak and the trick-pause tick); the
 * validation and the round functions are the engine's own.
 */
import { availableActions, hasCard, isAiControlled, seatsToAct, viewFor } from '../../engine'
import * as round from '../../engine/round'
import type { Action, Ctx, Game, GameEvent, RejectReason, Seat } from '../../engine'

/** Applies `action` to `game` itself. Returns the events, or the rejection; a rejected action leaves `game` untouched. */
export function applyInPlace(game: Game, actor: Seat | 'system', action: Action, ctx: Ctx, validate = true): GameEvent[] | RejectReason {
  const events: GameEvent[] = []
  const rejected = actor === 'system' ? systemAction(game, action, ctx, events) : roundAction(game, actor, action, ctx, events, validate)
  if (rejected !== null) return rejected
  schedule(game, ctx)
  return events
}

const AI_DELAY_MIN_MS = 600
const AI_DELAY_SPREAD_MS = 600

/** As in apply.ts. */
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

function systemAction(game: Game, action: Action, ctx: Ctx, events: GameEvent[]): RejectReason | null {
  if (action.type !== 'tick') return 'notAllowed'
  const phase = game.phase
  if (!('deadline' in phase) || phase.deadline > ctx.now) return null
  if (phase.kind === 'calling') round.closeCalling(game, phase, ctx, events)
  else if (phase.kind === 'thuneeWindow') round.closeThunee(game, phase)
  else if (phase.kind === 'trickPause') round.afterTrick(game, phase.play, events)
  return null
}

function roundAction(game: Game, seat: Seat, action: Action, ctx: Ctx, events: GameEvent[], validate: boolean): RejectReason | null {
  const phase = game.phase
  if (phase.kind !== 'playing' && phase.kind !== 'trickPause') return 'wrongPhase'
  const can = validate ? availableActions(viewFor(game, seat)) : null
  switch (action.type) {
    case 'playCard':
      if (phase.kind !== 'playing') return 'wrongPhase'
      if (phase.turn !== seat) return 'notYourTurn'
      if (can && !hasCard(can.play, action.card)) return 'cardNotInHand'
      round.playCard(game, phase.play, seat, action.card, ctx, events)
      return null
    case 'claimJodhi':
      if (can && !can.claimJodhi.includes(action.suit)) return 'notAllowed'
      round.claimJodhi(game, phase.play, seat, action, events)
      return null
    case 'callDouble':
      if (phase.kind !== 'playing' || (can && !can.callDouble)) return 'notAllowed'
      round.callDouble(phase.play, seat, events)
      return null
    case 'callKhanaak':
      if (phase.kind !== 'playing' || (can && !can.callKhanaak)) return 'notAllowed'
      round.callKhanaak(game, phase.play, seat, events)
      return null
    default:
      return 'notAllowed'
  }
}
