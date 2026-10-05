/** A practice game played entirely on this device: one person, honest computers, and a clock that waits. */
import { type Step, dueStep, reactions } from '../ai/drive'
import type { DecisionRecord, RoundLog } from '../coach/note'
import {
  type Action,
  type Actor,
  type Game,
  type GameEvent,
  type RejectReason,
  type View,
  FORMAT_VERSION,
  apply,
  checkInvariants,
  createGame,
  nextDeadline,
  viewFor,
} from '../engine'
import type { NumberedEvent } from '../protocol'
import { pauseId, waitingOnPlayer } from './clock'
import { type Rng, rng } from './rng'

export type { DecisionRecord, RoundLog }

export const PRACTICE_KEY = 'tricks-thunee-practice'
/** Raise when the saved shape changes; older saves are discarded. */
export const PRACTICE_FORMAT = 2

/** Computer seats are named by where they sit, as seen from seat 0. */
const NAMES: Record<2 | 4, string[]> = { 2: ['Opponent'], 4: ['Right', 'Partner', 'Left'] }

interface Saved {
  format: number
  game: Game
  rng: number
  virtualNow: number
  eventCount: number
  round: RoundLog
  continued: string | null
}

export interface Applied {
  events: NumberedEvent[]
}

export class PracticeGame {
  readonly you = 0
  private readonly random: Rng

  private constructor(
    public game: Game,
    seed: number,
    /** Practice time: only moves while nothing is waiting on the player. */
    public virtualNow: number,
    private eventCount: number,
    public round: RoundLog,
    /** The trick pause the player has continued past. */
    private continued: string | null,
  ) {
    this.random = rng(seed)
  }

  static start(playerCount: 2 | 4, seed: number, name: string): PracticeGame {
    const p = new PracticeGame(createGame(), seed, 0, 0, { dealt: [], decisions: [] }, null)
    p.must(null, { type: 'sit', seat: 0, name })
    if (playerCount === 2) p.must(0, { type: 'setPlayerCount', playerCount: 2 })
    for (let seat = 1; seat < playerCount; seat++) p.must(0, { type: 'addAi', seat, persona: 'straight' })
    p.must(0, { type: 'setRules', overrides: {} })
    // The lobby has no action to rename another seat; this is the starting state, before anything is played.
    p.game = { ...p.game, seats: p.game.seats.map((s, i) => (i === 0 ? s : { ...s, name: NAMES[playerCount][i - 1] })) }
    p.must(0, { type: 'start' })
    return p
  }

  /** A saved game, or null if there is none or it was saved by another version. */
  static load(json: string | null): PracticeGame | null {
    if (json === null) return null
    try {
      const s = JSON.parse(json) as Saved
      if (s.format !== PRACTICE_FORMAT || s.game?.formatVersion !== FORMAT_VERSION) return null
      const numbers = [s.rng, s.virtualNow, s.eventCount].every((n) => typeof n === 'number' && Number.isFinite(n))
      if (!numbers || !Array.isArray(s.round?.decisions) || !Array.isArray(s.round?.dealt)) return null
      if (typeof s.game.phase?.kind !== 'string' || !Array.isArray(s.game.seats)) return null
      // Anything the engine would reject, or could not show, is a broken save.
      checkInvariants(s.game)
      viewFor(s.game, 0, 'full')
      return new PracticeGame(s.game, s.rng, s.virtualNow, s.eventCount, s.round, s.continued ?? null)
    } catch {
      return null
    }
  }

  save(): string {
    const saved: Saved = {
      format: PRACTICE_FORMAT,
      game: this.game,
      rng: this.random.state,
      virtualNow: this.virtualNow,
      eventCount: this.eventCount,
      round: this.round,
      continued: this.continued,
    }
    return JSON.stringify(saved)
  }

  /** What the table shows: the player's view with only the last trick face up. */
  view(): View {
    return viewFor(this.game, this.you)
  }

  /** What the coach reasons from: the same view, remembering every card played face up this round. */
  coachView(): View {
    return viewFor(this.game, this.you, 'full')
  }

  waiting(sheetOpen: boolean): boolean {
    return waitingOnPlayer(this.game, this.you, sheetOpen, this.continued)
  }

  /** The player's action, recorded with the advice they had. */
  act(action: Action, advised: Action | null): { rejected: RejectReason } | Applied {
    const before = this.coachView()
    const round = this.round
    const result = this.apply(this.you, action)
    if (!Array.isArray(result)) return result
    // A redeal starts a new log; a decision about the cards thrown in does not belong in it.
    if (isRoundDecision(action) && this.round === round) this.round.decisions.push({ view: before, advised, taken: action } satisfies DecisionRecord)
    return { events: this.number(result) }
  }

  /** Ends the trick pause the player was reading; the clock can then reach its deadline. */
  continueTrick(): void {
    this.continued = pauseId(this.game)
  }

  /**
   * Lets up to `ms` of practice time pass, resolving every deadline and computer turn on the way.
   * Time stops as soon as something waits on the player.
   */
  advance(ms: number, sheetOpen: boolean): Applied {
    const target = this.virtualNow + ms
    const events: GameEvent[] = []
    for (let guard = 0; guard < 500; guard++) {
      if (this.waiting(sheetOpen)) break
      const step = dueStep(this.game, this.virtualNow)
      if (step) {
        events.push(...this.runStep(step))
        continue
      }
      const next = nextDeadline(this.game)
      if (next === null || next > target) {
        this.virtualNow = Math.max(this.virtualNow, target)
        break
      }
      this.virtualNow = Math.max(this.virtualNow, next)
    }
    return { events: this.number(events) }
  }

  /** Practice ms until something is next due, or null if nothing is. */
  nextIn(): number | null {
    const next = nextDeadline(this.game)
    return next === null ? null : Math.max(0, next - this.virtualNow)
  }

  // ── Internals ─────────────────────────────────────────────────────────

  private runStep(step: Step): GameEvent[] {
    const first = this.apply(step.actor, step.action)
    if (Array.isArray(first)) return first
    if (step.fallback) {
      const second = this.apply(step.actor, step.fallback)
      if (Array.isArray(second)) return second
    }
    if (step.actor === 'system') return []
    throw new Error(`computer seat ${step.actor} has no acceptable action in ${this.game.phase.kind}`)
  }

  /** Applies one action and every computer reaction to it, keeping the round log. */
  private apply(actor: Actor, action: Action): GameEvent[] | { rejected: RejectReason } {
    const result = apply(this.game, actor, action, { now: this.virtualNow, rng: () => this.random.next() })
    if ('rejected' in result) return { rejected: result.rejected }
    checkInvariants(result.game)
    this.game = result.game
    this.keepRound(result.events)
    const events = [...result.events]
    for (const ask of reactions(this.game, result.events)) {
      const step = ask(this.game)
      if (!step) continue
      const more = this.apply(step.actor, step.action)
      if (Array.isArray(more)) events.push(...more)
    }
    return events
  }

  private keepRound(events: readonly GameEvent[]): void {
    if (events.some((e) => e.type === 'dealt' && e.half === 1)) this.round = { dealt: [], decisions: [] }
    const phase = this.game.phase
    if (phase.kind === 'playing' || phase.kind === 'trickPause') {
      this.round.dealt[phase.play.half - 1] = phase.play.dealt.map((h) => [...h])
    }
  }

  private number(events: readonly GameEvent[]): NumberedEvent[] {
    return events.map((e) => ({ ...e, n: ++this.eventCount }))
  }

  /** Setup actions that cannot fail. */
  private must(actor: Actor, action: Action): void {
    const result = this.apply(actor, action)
    if (!Array.isArray(result)) throw new Error(`practice setup: ${action.type} rejected (${result.rejected})`)
  }
}

function isRoundDecision(action: Action): boolean {
  return action.type !== 'nextRound' && action.type !== 'rematch' && action.type !== 'tick'
}
