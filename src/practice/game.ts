/** A practice game played entirely on this device: one person, honest computers, and a clock that waits. */
import type { Step } from '../kit/module'
import type { Said } from '../kit/talk'
import type { Actor, TableAction, TableState, TableView } from '../kit/table'
import type { NumberedEvent } from '../protocol'
import { waitingOnPlayer } from './clock'
import type { DecisionRecord, Drill, DrillTable, GamePractice, Note, RoundLog } from './contract'
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
  /** What the computers said about them. */
  said: Said[]
}

export class PracticeGame<G extends TableState, A extends { type: string }, E, V extends TableView, N extends Note, D, S> {
  readonly you = 0
  private readonly random: Rng
  /** The computers' banter since it was last taken. Never saved, and drawn apart from the game's own randomness. */
  private said: Said[] = []
  /** The round's decisions as saved so far, for `save`. */
  private written: { decisions: readonly DecisionRecord<V, A>[]; count: number; json: string } | null = null

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
    lobby: readonly A[] = [],
  ): PracticeGame<G, A, E, V, N, D, S> {
    const p = new PracticeGame(practice, practice.module.createGame(), seed, 0, 0, { dealt: [], decisions: [] }, null)
    p.must(null, p.table({ type: 'sit', seat: 0, name }))
    // The computers are named as in a room: `addAi` draws each a name nobody at the table has.
    for (const action of [...practice.setup(playerCount), ...lobby]) p.must(0, action)
    p.must(0, p.table({ type: 'start' }))
    return p
  }

  /** A practice game at a drill's first moment: started as any other, then arranged as the drill says. */
  static drill<G extends TableState, A extends { type: string }, E, V extends TableView, N extends Note, D, S>(
    practice: GamePractice<G, A, E, V, N, D, S>,
    drill: Drill<G, A, V, N>,
    seed: number,
    name: string,
  ): PracticeGame<G, A, E, V, N, D, S> {
    const p = PracticeGame.start(practice, drill.playerCount, seed, name, drill.lobby)
    drill.arrange(p.arranging(drill.id))
    // The round log starts at the drill's moment, keeping the deal as stacked.
    p.round = { dealt: p.round.dealt, decisions: [] }
    p.keepRound([])
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

  /**
   * The game as `JSON.stringify` writes a `Saved`, field by field. Practice saves after every change, and
   * the round's decisions, each with a full view, are most of a save; a decision never changes once
   * logged, so each is written only once.
   */
  save(): string {
    const json: { [K in keyof Saved<G, V, A, D>]: string } = {
      format: JSON.stringify(PRACTICE_FORMAT),
      game: JSON.stringify(this.game),
      rng: JSON.stringify(this.random.state),
      virtualNow: JSON.stringify(this.virtualNow),
      eventCount: JSON.stringify(this.eventCount),
      round: `{"dealt":${JSON.stringify(this.round.dealt)},"decisions":[${this.savedDecisions()}]}`,
      continued: JSON.stringify(this.continued),
    }
    return `{${Object.entries(json).map(([key, value]) => `"${key}":${value}`).join(',')}}`
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
    return { events: this.number(result), said: this.takeSaid() }
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
    return { events: this.number(events), said: this.takeSaid() }
  }

  /** Practice ms until something is next due, or null if nothing is. */
  nextIn(): number | null {
    // A step due now without a deadline, such as the next game once the player has said Again.
    if (this.practice.module.dueStep(this.game, this.virtualNow) !== null) return 0
    const next = this.practice.module.nextDeadline(this.game)
    return next === null ? null : Math.max(0, next - this.virtualNow)
  }

  /** A table action, which every game's actions include. */
  table(action: TableAction): A {
    return action as A
  }

  // ── Internals ─────────────────────────────────────────────────────────

  /** The game as a drill arranges it: actions as written, with no computer reacting, and the clock run by hand. */
  private arranging(id: string): DrillTable<G, A> {
    const module = this.practice.module
    const ctx = () => ({ now: this.virtualNow, rng: () => this.random.next() })
    const run = (actor: Actor, action: A) => {
      const result = module.apply(this.game, actor, action, ctx())
      if ('rejected' in result) throw new Error(`drill ${id}: ${action.type} by ${actor} rejected (${result.rejected}) in ${this.game.phase.kind}`)
      module.checkInvariants(result.game)
      this.game = result.game
    }
    const p = this
    return {
      get game() {
        return p.game
      },
      patch: (change) => {
        this.game = change(structuredClone(this.game), ctx())
        module.checkInvariants(this.game)
        // The deal the review shows is the stacked one, not the shuffle it replaced.
        this.round = { dealt: [], decisions: [] }
        this.keepRound([])
      },
      act: run,
      tick: () => {
        const next = module.nextDeadline(this.game)
        if (next !== null) this.virtualNow = Math.max(this.virtualNow, next)
        run('system', this.table({ type: 'tick' }))
      },
    }
  }

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
    this.said.push(...(module.banter?.(this.game, result.events, Math.random) ?? []))
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

  /** The round's decisions in JSON, without their brackets: those written before, and any logged since. */
  private savedDecisions(): string {
    const decisions = this.round.decisions
    if (this.written?.decisions !== decisions) this.written = { decisions, count: 0, json: '' }
    const written = this.written
    for (; written.count < decisions.length; written.count++) written.json += `${written.count > 0 ? ',' : ''}${JSON.stringify(decisions[written.count])}`
    return written.json
  }

  private takeSaid(): Said[] {
    const said = this.said
    this.said = []
    return said
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
