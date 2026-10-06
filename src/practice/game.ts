/** A practice game played entirely on this device: one person, honest computers, and a clock that waits. */
import type { Step } from '../kit/module'
import type { Actor, TableAction, TableState, TableView } from '../kit/table'
import type { NumberedEvent } from '../protocol'
import { waitingOnPlayer } from './clock'
import type { DecisionRecord, GamePractice, Note, RoundLog } from './contract'
import { type Rng, rng } from './rng'

export type { DecisionRecord, RoundLog }

/** Where a game's practice is saved on this device. */
export function practiceKey(game: string): string {
  return `tricks-${game}-practice`
}

/** Raise when the saved shape changes; older saves are discarded. */
export const PRACTICE_FORMAT = 2

interface Saved<G, V, A, D> {
  format: number
  game: G
  rng: number
  virtualNow: number
  eventCount: number
  round: RoundLog<V, A, D>
  continued: string | null
}

export interface Applied<E> {
  events: NumberedEvent<E>[]
}

export class PracticeGame<G extends TableState, A extends { type: string }, E, V extends TableView, N extends Note, D, S> {
  readonly you = 0
  private readonly random: Rng

  private constructor(
    readonly practice: GamePractice<G, A, E, V, N, D, S>,
    public game: G,
    seed: number,
    /** Practice time: only moves while nothing is waiting on the player. */
    public virtualNow: number,
    private eventCount: number,
    public round: RoundLog<V, A, D>,
    /** The pause the player has continued past. */
    private continued: string | null,
  ) {
    this.random = rng(seed)
  }

  static start<G extends TableState, A extends { type: string }, E, V extends TableView, N extends Note, D, S>(
    practice: GamePractice<G, A, E, V, N, D, S>,
    playerCount: number,
    seed: number,
    name: string,
  ): PracticeGame<G, A, E, V, N, D, S> {
    const p = new PracticeGame(practice, practice.module.createGame(), seed, 0, 0, { dealt: [], decisions: [] }, null)
    p.must(null, p.table({ type: 'sit', seat: 0, name }))
    for (const action of practice.setup(playerCount)) p.must(0, action)
    // The lobby has no action to rename another seat; this is the starting state, before anything is played.
    const names = practice.seatNames(playerCount)
    p.game = { ...p.game, seats: p.game.seats.map((s, i) => (i === 0 ? s : { ...s, name: names[i - 1] })) }
    p.must(0, p.table({ type: 'start' }))
    return p
  }

  /** A saved game, or null if there is none or it was saved by another version. */
  static load<G extends TableState, A extends { type: string }, E, V extends TableView, N extends Note, D, S>(
    practice: GamePractice<G, A, E, V, N, D, S>,
    json: string | null,
  ): PracticeGame<G, A, E, V, N, D, S> | null {
    if (json === null) return null
    try {
      const s = JSON.parse(json) as Saved<G, V, A, D>
      if (s.format !== PRACTICE_FORMAT || s.game?.formatVersion !== practice.module.formatVersion) return null
      const numbers = [s.rng, s.virtualNow, s.eventCount].every((n) => typeof n === 'number' && Number.isFinite(n))
      if (!numbers || !Array.isArray(s.round?.decisions) || !Array.isArray(s.round?.dealt)) return null
      if (typeof s.game.phase?.kind !== 'string' || !Array.isArray(s.game.seats)) return null
      // Anything the engine would reject, or could not show, is a broken save.
      practice.module.checkInvariants(s.game)
      practice.module.viewFor(s.game, 0, 'full')
      return new PracticeGame(practice, s.game, s.rng, s.virtualNow, s.eventCount, s.round, s.continued ?? null)
    } catch {
      return null
    }
  }

  save(): string {
    const saved: Saved<G, V, A, D> = {
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
  view(): V {
    return this.practice.module.viewFor(this.game, this.you)
  }

  /** What the coach reasons from: the same view, remembering every card played face up this round. */
  coachView(): V {
    return this.practice.module.viewFor(this.game, this.you, 'full')
  }

  waiting(sheetOpen: boolean): boolean {
    const toAct = this.practice.module.seatsToAct(this.game)
    return waitingOnPlayer(this.practice.pauseId(this.game), toAct, this.you, sheetOpen, this.continued)
  }

  /** Whether a pause is waiting for the player to continue past it. */
  paused(): boolean {
    const pause = this.practice.pauseId(this.game)
    return pause !== null && pause !== this.continued
  }

  /** The player's action, recorded with the advice they had. */
  act(action: A, advised: A | null): { rejected: string } | Applied<E> {
    const before = this.coachView()
    const round = this.round
    const result = this.apply(this.you, action)
    if (!Array.isArray(result)) return result
    // A redeal starts a new log; a decision about the cards thrown in does not belong in it.
    if (this.practice.isDecision(action) && this.round === round) this.round.decisions.push({ view: before, advised, taken: action } satisfies DecisionRecord<V, A>)
    return { events: this.number(result) }
  }

  /** Ends the pause the player was reading; the clock can then reach its deadline. */
  continueTrick(): void {
    this.continued = this.practice.pauseId(this.game)
  }

  /**
   * Lets up to `ms` of practice time pass, resolving every deadline and computer turn on the way.
   * Time stops as soon as something waits on the player.
   */
  advance(ms: number, sheetOpen: boolean): Applied<E> {
    const target = this.virtualNow + ms
    const events: E[] = []
    for (let guard = 0; guard < 500; guard++) {
      if (this.waiting(sheetOpen)) break
      const step = this.practice.module.dueStep(this.game, this.virtualNow)
      if (step) {
        events.push(...this.runStep(step))
        continue
      }
      const next = this.practice.module.nextDeadline(this.game)
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
    const next = this.practice.module.nextDeadline(this.game)
    return next === null ? null : Math.max(0, next - this.virtualNow)
  }

  /** A table action, which every game's actions include. */
  table(action: TableAction): A {
    return action as A
  }

  // ── Internals ─────────────────────────────────────────────────────────

  private runStep(step: Step<A>): E[] {
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
  private apply(actor: Actor, action: A): E[] | { rejected: string } {
    const module = this.practice.module
    const result = module.apply(this.game, actor, action, { now: this.virtualNow, rng: () => this.random.next() })
    if ('rejected' in result) return { rejected: result.rejected }
    module.checkInvariants(result.game)
    this.game = result.game
    this.keepRound(result.events)
    const events = [...result.events]
    for (const ask of module.reactions(this.game, result.events)) {
      const step = ask(this.game)
      if (!step) continue
      const more = this.apply(step.actor, step.action)
      if (Array.isArray(more)) events.push(...more)
    }
    return events
  }

  private keepRound(events: readonly E[]): void {
    if (this.practice.roundBegins(events)) this.round = { dealt: [], decisions: [] }
    const deal = this.practice.dealInPlay(this.game)
    if (deal !== null) this.round.dealt[deal.index] = deal.hands
  }

  private number(events: readonly E[]): NumberedEvent<E>[] {
    return events.map((e) => ({ ...e, n: ++this.eventCount }))
  }

  /** Setup actions that cannot fail. */
  private must(actor: Actor, action: A): void {
    const result = this.apply(actor, action)
    if (!Array.isArray(result)) throw new Error(`practice setup: ${action.type} rejected (${result.rejected})`)
  }
}
