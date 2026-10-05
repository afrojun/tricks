/**
 * The optional extension: calling, trump and Thunee by search. Rebuilds a game
 * from a view before card play, then plays each candidate out. Inside a
 * rollout, decisions before card play are the heuristic's (a random call or
 * Thunee is not a useful model of anyone); card play uses the chosen policy.
 */
import {
  type Action,
  type Ctx,
  type Game,
  type Seat,
  type View,
  FORMAT_VERSION,
  apply,
  availableActions,
  cardId,
  createDeck,
  isAiControlled,
  nextDeadline,
  seatsToAct,
  viewFor,
} from '../../engine'
import { seededRng } from '../../engine/testing'
import { chooseAction } from '../../ai/choose'
import { HONEST } from '../../ai/mind'
import { applyInPlace } from './applyInPlace'
import type { World } from './rebuild'
import { type Knowledge, sampleWorld } from './sample'
import { type RolloutPolicy, playOut } from './search'

const EARLY = ['calling', 'trumpSelection', 'thuneeWindow'] as const
type EarlyKind = (typeof EARLY)[number]
export const isEarly = (view: View) => (EARLY as readonly string[]).includes(view.phase.kind)

/** Rebuild for the three phases before card play. */
export function rebuildEarly(view: View, world: World): Game {
  const phase = view.phase as Extract<View['phase'], { kind: EarlyKind }>
  const hands = world.hands.map((h) => [...h])
  const stock = [...world.stock]
  const game: Game = {
    formatVersion: FORMAT_VERSION,
    rules: view.rules,
    playerCount: view.playerCount,
    seats: view.seats.map((s) => ({ ...s, persona: s.persona ?? 'straight' })),
    host: view.owner,
    balls: [view.balls[0], view.balls[1]],
    dealer: view.dealer,
    khanaakCalled: view.ballsTarget > view.rules.ballsToWin,
    lastRoundWinner: null,
    roundNumber: view.roundNumber,
    aiActAt: null,
    aiSalt: 0,
    acting: view.acting && { ...view.acting },
    phase:
      phase.kind === 'calling'
        ? {
            kind: 'calling',
            hands,
            stock,
            defaultTrumper: phase.defaultTrumper,
            call: phase.call && { ...phase.call },
            passed: [...phase.passed],
            // Another seat's preselected trump is hidden; assume none.
            preselect: phase.preselect === null ? null : { seat: view.seat!, choice: phase.preselect },
            deadline: phase.deadline,
          }
        : phase.kind === 'trumpSelection'
          ? { kind: 'trumpSelection', hands, stock, trumper: phase.trumper, callAmount: phase.callAmount }
          : {
              kind: 'thuneeWindow',
              hands,
              stock,
              trumper: phase.trumper,
              trump: phase.trump ?? world.trump!,
              callAmount: phase.callAmount,
              pending: phase.pending,
              passed: [...phase.passed],
              deadline: phase.deadline,
            },
  }
  if (seatsToAct(game).some((s) => isAiControlled(game, s))) game.aiActAt = view.acting?.since ?? 0
  return game
}

/** Before card play nothing has been shown: only the hand sizes, and trump in the Thunee window if it is hidden. */
export function earlyKnowledge(view: View): Knowledge {
  const phase = view.phase as Extract<View['phase'], { kind: EarlyKind }>
  const me = view.seat!
  const n = view.playerCount
  const mine = new Set(phase.hand.map(cardId))
  const unknown = createDeck().filter((c) => !mine.has(cardId(c)))
  const capacity = Array.from({ length: n + 1 }, (_, s) => (s < n && s !== me ? phase.handCounts[s] : 0))
  capacity[n] = unknown.length - capacity.reduce((a, b) => a + b, 0)
  const trumper = phase.kind === 'calling' ? -1 : phase.trumper
  return {
    me,
    playerCount: n,
    unknown,
    capacity,
    voids: capacity.map(() => new Set()),
    forced: capacity.map(() => []),
    trumpHidden: phase.kind === 'thuneeWindow' && phase.trump === null,
    trumper,
    countingHoldsTrump: view.rules.redealIfNoTrumps && n === 4,
    myHand: phase.hand,
    dropped: [],
  }
}

/** The candidates: pass or the lowest call; each trump choice; Thunee or pass. */
export function earlyCandidates(view: View): Action[] {
  const can = availableActions(view)
  switch (view.phase.kind) {
    case 'calling':
      return can.calls.length > 0 ? [{ type: 'pass' }, { type: 'call', amount: can.calls[0] }] : []
    case 'trumpSelection':
      return can.chooseTrump.map((choice) => ({ type: 'chooseTrump', choice }))
    case 'thuneeWindow':
      return can.pass ? [{ type: 'pass' }, ...(can.callThunee ? [{ type: 'callThunee' } as Action] : [])] : []
    default:
      return []
  }
}

const inPlace = (game: Game, actor: Seat | 'system', action: Action, ctx: Ctx) => {
  const r = applyInPlace(game, actor, action, ctx)
  if (typeof r === 'string') throw new Error(`rollout: ${JSON.stringify(action)} rejected (${r})`)
  return game
}

/** Plays a game from before card play to its result. A redeal scores nothing. */
function playOutEarly(start: Game, me: Seat, policy: RolloutPolicy, rng: () => number) {
  let game = start
  const ctx: Ctx = { now: 0, rng }
  let leftCalling = start.phase.kind !== 'calling'
  for (let guard = 0; guard < 100; guard++) {
    const kind = game.phase.kind
    if (kind === 'playing') return playOut(game, me, game.phase.play.tricks.length, policy, rng, inPlace)
    if (kind === 'calling' && leftCalling) return { value: 0, margin: 0, watched: null }
    if (kind !== 'calling') leftCalling = true
    const waiting = seatsToAct(game)
    let action: Action = { type: 'tick' }
    let actor: Seat | 'system' = 'system'
    if (waiting.length > 0) {
      actor = waiting[0]
      action = chooseAction(viewFor(game, actor, 'full'), HONEST)
    } else ctx.now = nextDeadline(game)!
    const r = apply(game, actor, action, ctx)
    if ('rejected' in r) throw new Error(`early rollout: ${JSON.stringify(action)} rejected (${r.rejected})`)
    game = r.game
  }
  throw new Error('early rollout did not reach card play')
}

export interface EarlyResult {
  action: Action
  stats: { action: Action; mean: number; margin: number }[]
}

export function searchEarly(view: View, opts: { worlds: number; policy: RolloutPolicy; seed: number }): EarlyResult | null {
  const candidates = earlyCandidates(view)
  if (candidates.length < 2) return null
  const me = view.seat!
  const k = earlyKnowledge(view)
  const rng = seededRng(opts.seed)
  const sum = candidates.map(() => ({ value: 0, margin: 0 }))
  for (let w = 0; w < opts.worlds; w++) {
    const world = sampleWorld(k, rng)
    const rolloutSeed = Math.floor(rng() * 2 ** 32)
    candidates.forEach((action, i) => {
      const first = apply(rebuildEarly(view, world), me, action, { now: 0, rng })
      if ('rejected' in first) throw new Error(`searchEarly: ${JSON.stringify(action)} rejected (${first.rejected})`)
      const r = playOutEarly(first.game, me, opts.policy, seededRng(rolloutSeed))
      sum[i].value += r.value
      sum[i].margin += r.margin
    })
  }
  const stats = candidates.map((action, i) => ({ action, mean: sum[i].value / opts.worlds, margin: sum[i].margin / opts.worlds }))
  const score = (s: (typeof stats)[number]) => s.mean + 1e-5 * s.margin
  const best = [...stats].sort((a, b) => score(b) - score(a))[0]
  return { action: best.action, stats }
}
