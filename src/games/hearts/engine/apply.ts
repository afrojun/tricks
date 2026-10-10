import { hasCard, sameCard } from '../../../kit/cards'
import { type Actor, type Ctx, type Seat, againComplete, allSeats, checkLobbyHost, emptySeats, isTableAction, redrawSurprises, screen, settle, tableAction } from '../../../kit/table'
import { availableActions, seenBy } from './available'
import { PASS_SIZE, PLAYERS, SEAT_COUNTS, STANDARD, resolveRules } from './rules'
import * as round from './round'
import { actionShape } from './schema'
import { type Action, type ApplyResult, FORMAT_VERSION, type Game, type GameEvent, type Phase, type RejectReason, type RoundPlay } from './types'

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
  const screened = screen(game, actor, action, actionShape)
  if ('rejected' in screened) return screened
  const draft = copyGame(game)
  const result = stepScreened(draft, actor, screened.action, ctx)
  return 'rejected' in result ? result : { game: draft, events: result.events }
}

/**
 * A copy of `game` for `step` to change: every object and array that `step` changes in place is new, and the
 * rest is shared with `game`, since the engine never changes it once made, only replaces it: the rules, the
 * scores, cards, each hand, the plays and tricks, the cards passed, and summaries. A copy of every card and
 * play cost more than the step.
 */
function copyGame(game: Game): Game {
  return { ...game, seats: game.seats.map((s) => ({ ...s })), phase: copyPhase(game.phase) }
}

function copyPhase(phase: Phase): Phase {
  switch (phase.kind) {
    case 'passing':
      return { ...phase, chosen: [...phase.chosen] }
    case 'playing':
    case 'trickPause':
      return { ...phase, play: copyPlay(phase.play) }
    case 'gameOver':
      return { ...phase }
    default:
      // A lobby and a round's result are replaced, never changed.
      return phase
  }
}

function copyPlay(play: RoundPlay): RoundPlay {
  return { ...play, hands: [...play.hands], tricks: [...play.tricks], current: [...play.current] }
}

/**
 * The in-place half of `apply`: changes `draft` and returns the events. On a
 * rejection the draft is left as it was, since every action is checked before
 * anything is changed. The caller must own the draft: not frozen, and not
 * shared with views still in use. It is the module's `step`, for imagined
 * games. The search player, which makes its actions from the game's own
 * cards, uses `stepScreened`; everything else goes through `apply`.
 */
export function step(draft: Game, actor: Actor, action: Action, ctx: Ctx): { events: GameEvent[] } | { rejected: RejectReason } {
  // Checked before any field is read: a client could send anything at all.
  const screened = screen(draft, actor, action, actionShape)
  return 'rejected' in screened ? screened : stepScreened(draft, actor, screened.action, ctx)
}

/**
 * `step` for an action of a known good shape: one that has passed `screen`, or one the search player made
 * from the game's own cards. It is checked against the rules as any other.
 */
export function stepScreened(draft: Game, actor: Actor, action: Action, ctx: Ctx): { events: GameEvent[] } | { rejected: RejectReason } {
  const kind = draft.phase.kind
  const events: GameEvent[] = []
  const rejected = dispatch(draft, actor, action, ctx, events)
  if (rejected !== null) return { rejected }
  // A new phase starts every wait afresh: whoever passes last may also hold the two of clubs.
  if (draft.phase.kind !== kind) draft.waiting = []
  const toAct = seatsToAct(draft)
  settle(draft, ctx, toAct, toAct)
  return { events }
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
  if (phaseDeadline === null || game.aiActAt === null) return phaseDeadline ?? game.aiActAt
  return Math.min(phaseDeadline, game.aiActAt)
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
    case 'choosePass': {
      if (phase.kind !== 'passing') return 'wrongPhase'
      if (can.pass.length === 0) return 'notAllowed'
      const cards = action.cards
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
  game.scores = [0, 0, 0, 0]
  game.roundNumber = 1
  redrawSurprises(game, ctx)
  round.beginRound(game, ctx, events)
}

/** Resolves a phase deadline that has passed. Computer turns are driven by the host. */
function tick(game: Game, ctx: Ctx, events: GameEvent[]): void {
  const phase = game.phase
  if (phase.kind === 'trickPause' && phase.deadline <= ctx.now) round.afterTrick(game, phase.play, events)
}
