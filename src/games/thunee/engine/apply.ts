import { type Actor, type Ctx, againComplete, checkLobbyHost, emptySeats, isTableAction, redrawSurprises, screen, settle, tableAction } from '../../../kit/table'
import { hasCard } from './cards'
import { availableActions, seenBy } from './available'
import { actionShape } from './schema'
import { mayCall, pauseWaitingOn } from './predicates'
import { SEAT_COUNTS, TRADITIONAL, resolveRules } from './rules'
import * as round from './round'
import { type Seat, allSeats } from './seats'
import { type Action, type ApplyResult, FORMAT_VERSION, type Game, type GameEvent, type Phase, type RejectReason, type RoundPlay, type TrickPause } from './types'

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
    waiting: [],
    phase: { kind: 'lobby' },
  }
}

/**
 * The only way game state changes. Never mutates `game`; never throws on
 * player input.
 */
export function apply(game: Game, actor: Actor, action: Action, ctx: Ctx): ApplyResult {
  const screened = screen(game, actor, action, actionShape)
  if ('rejected' in screened) return screened
  const draft = copyGame(game)
  const result = run(draft, actor, screened.action, ctx)
  return 'rejected' in result ? result : { game: draft, events: result.events }
}

/**
 * A copy of `game` for `step` to change: every object and array that `step` changes in place is new,
 * and the rest is shared with `game`, since the engine never changes it once made: the rules, cards, the
 * plays and tricks, claims and summaries. A copy of every card and play cost more than the step.
 */
function copyGame(game: Game): Game {
  return { ...game, seats: game.seats.map((s) => ({ ...s })), balls: [game.balls[0], game.balls[1]], phase: copyPhase(game.phase) }
}

function copyPhase(phase: Phase): Phase {
  switch (phase.kind) {
    case 'calling':
    case 'thuneeWindow':
      return { ...phase, hands: phase.hands.map((h) => [...h]), stock: [...phase.stock], passed: [...phase.passed] }
    case 'trumpSelection':
      return { ...phase, hands: phase.hands.map((h) => [...h]), stock: [...phase.stock] }
    case 'playing':
    case 'trickPause':
      return { ...phase, play: copyPlay(phase.play) }
    default:
      return { ...phase }
  }
}

function copyPlay(play: RoundPlay): RoundPlay {
  const { hands, stock, tricks, current, jodhiClaims } = play
  return { ...play, hands: hands.map((h) => [...h]), stock: [...stock], tricks: [...tricks], current: [...current], jodhiClaims: [...jodhiClaims] }
}

/**
 * `apply` in place: changes `draft` and returns the events, or refuses and leaves `draft` as it
 * was. Every check comes before the first change. Never throws on player input.
 */
export function step(draft: Game, actor: Actor, action: Action, ctx: Ctx): { events: GameEvent[] } | { rejected: RejectReason } {
  // Checked before any field is read: a client could send anything at all.
  const screened = screen(draft, actor, action, actionShape)
  return 'rejected' in screened ? screened : run(draft, actor, screened.action, ctx)
}

/** `step` for an action that has passed `screen`. */
function run(draft: Game, actor: Actor, action: Action, ctx: Ctx): { events: GameEvent[] } | { rejected: RejectReason } {
  const events: GameEvent[] = []
  const decision = decisionOf(draft)
  const rejected = dispatch(draft, actor, action, ctx, events)
  if (rejected !== null) return { rejected }
  // A new decision starts its wait afresh: a trumper slow to choose is not already stalled in the Thunee window.
  if (decisionOf(draft) !== decision) draft.waiting = []
  settle(draft, ctx, seatsToAct(draft), untimedSeats(draft))
  return { events }
}

function pauseWaiting(game: Game, pause: TrickPause): Seat[] {
  return pauseWaitingOn({ deadline: pause.deadline, redeal: pause.redeal, thunee: pause.play.thunee, tricks: pause.play.tricks }, game.playerCount)
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
    case 'trickPause':
      return pauseWaiting(game, phase)
    default:
      return []
  }
}

/** The seats the table waits on with no deadline: the trumper choosing trump, the seat to play, and, without timers, the callers. */
export function untimedSeats(game: Game): Seat[] {
  const phase = game.phase
  switch (phase.kind) {
    case 'calling':
      return phase.deadline === null ? seatsToAct(game) : []
    case 'trumpSelection':
      return [phase.trumper]
    case 'thuneeWindow':
      return phase.deadline === null ? round.waitingOnThunee(game, phase) : []
    case 'playing':
      return [phase.turn]
    case 'trickPause':
      return pauseWaiting(game, phase)
    default:
      return []
  }
}

/** What the table is asking: a new phase, or a new call to answer, is a new question. */
function decisionOf(game: Game): string {
  const phase = game.phase
  return phase.kind === 'calling' ? `calling ${phase.call?.amount ?? 0}` : phase.kind
}

/** The earliest moment the server must wake up for, if any. */
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
      game.balls = [0, 0]
      game.roundNumber = 1
      game.dealer = Math.floor(ctx.rng() * game.playerCount)
      round.beginRound(game, ctx, events)
    } else if (action.type === 'tick') tick(game, ctx, events)
    return null
  }
  // Everyone has said Again: the host's due step starts the next game.
  if (actor === 'system' && action.type === 'rematch') {
    if (game.phase.kind !== 'gameOver' || !againComplete(game, game.phase.again)) return 'notAllowed'
    rematch(game, ctx, events)
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
  const can = availableActions(seenBy(game, seat))
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
      else if (phase.kind === 'thuneeWindow') round.passThunee(game, phase, seat, ctx, events)
      // No Jodhi, or deal again: the pause was waiting only for this answer.
      else if (phase.kind === 'trickPause') round.afterTrick(game, phase.play, ctx, events)
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
      round.callThunee(game, phase, seat, ctx, events)
      return null

    case 'playCard':
      if (phase.kind !== 'playing') return 'wrongPhase'
      if (phase.turn !== seat) return 'notYourTurn'
      if (!hasCard(phase.play.hands[seat], action.card)) return 'cardNotInHand'
      if (!hasCard(can.play, action.card)) return 'illegalCard'
      round.playCard(game, phase.play, seat, action.card, ctx, events)
      return null

    case 'claimJodhi':
      if (phase.kind !== 'playing' && phase.kind !== 'trickPause') return 'wrongPhase'
      if (!can.claimJodhi.includes(action.suit)) return 'notAllowed'
      // The claimant's own cards decide it; with cheating off only a true claim is accepted.
      if (!game.rules.allowCheating && !round.holdsClaim(game, phase.play, seat, action)) return 'falseClaim'
      round.claimJodhi(game, phase.play, seat, action, events)
      // A claim answers a pause that was waiting for it.
      if (phase.kind === 'trickPause' && pauseWaiting(game, phase).includes(seat)) round.afterTrick(game, phase.play, ctx, events)
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

    case 'challengeThunee':
      if (phase.kind !== 'playing' && phase.kind !== 'trickPause') return 'wrongPhase'
      if (!can.challengeThunee) return 'notAllowed'
      round.challengeThunee(game, phase.play, seat, events)
      return null

    case 'nextRound':
      if (!can.nextRound) return phase.kind === 'roundResult' ? 'notAllowed' : 'wrongPhase'
      game.roundNumber++
      round.beginRound(game, ctx, events)
      return null

    case 'rematch':
      if (phase.kind !== 'gameOver') return 'wrongPhase'
      if (action.now) {
        if (!can.rematch) return 'notHost'
        rematch(game, ctx, events)
      } else {
        if (!can.again) return 'notAllowed'
        phase.again = [...phase.again, seat].sort((a, b) => a - b)
      }
      return null

    default:
      return 'notAllowed'
  }
}

/** The next game, with the same seats and rules. */
function rematch(game: Game, ctx: Ctx, events: GameEvent[]): void {
  game.balls = [0, 0]
  game.khanaakCalled = false
  game.lastRoundWinner = null
  game.roundNumber = 1
  game.dealer = Math.floor(ctx.rng() * game.playerCount)
  redrawSurprises(game, ctx)
  round.beginRound(game, ctx, events)
}

/** Resolves a phase deadline that has passed. AI turns are driven by the server. */
function tick(game: Game, ctx: Ctx, events: GameEvent[]): void {
  const phase = game.phase
  if (!('deadline' in phase) || phase.deadline === null || phase.deadline > ctx.now) return
  if (phase.kind === 'calling') round.closeCalling(game, phase, ctx, events)
  else if (phase.kind === 'thuneeWindow') round.closeThunee(game, phase, ctx, events)
  else if (phase.kind === 'trickPause') round.afterTrick(game, phase.play, ctx, events)
}
