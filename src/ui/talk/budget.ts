/**
 * The client's budget for talk: one line, emote or throw every `TALK_BUDGET_MS`, shared by the
 * tray and every name's menu. The room has a shorter limit of its own, so a person never meets it.
 */
import { useSyncExternalStore } from 'react'
import { TALK_BUDGET_MS } from '../../kit/talk'

export interface BudgetState {
  /** When the next thing may be said, by `Date.now()`. */
  until: number
  /** The key (`sayKey`) of the last thing said, whose button stays pressed while the budget runs. */
  last: string | null
  cooling: boolean
}

interface Clock {
  now: () => number
  later: (run: () => void, ms: number) => void
}

const browserClock: Clock = { now: () => Date.now(), later: (run, ms) => setTimeout(run, ms) }

export class Budget {
  private state: BudgetState = { until: 0, last: null, cooling: false }
  private listeners = new Set<() => void>()

  constructor(
    private readonly gap = TALK_BUDGET_MS,
    private readonly clock: Clock = browserClock,
  ) {}

  getState = (): BudgetState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Spends the budget on `key`; false while it is still running, and nothing should be said. */
  spend(key: string): boolean {
    const now = this.clock.now()
    if (now < this.state.until) return false
    const until = now + this.gap
    this.set({ until, last: key, cooling: true })
    this.clock.later(() => {
      if (this.state.until === until) this.set({ ...this.state, cooling: false })
    }, this.gap)
    return true
  }

  private set(state: BudgetState): void {
    this.state = state
    this.listeners.forEach((listener) => listener())
  }
}

/** One budget for the page: a person talks at one table at a time. */
export const budget = new Budget()

export function useBudget(): BudgetState {
  return useSyncExternalStore(budget.subscribe, budget.getState)
}
