import type { Presentation } from './contract'

/**
 * Presentations held back by their `after`: shown when it passes, unless the table has moved on
 * to another phase first (a quick rematch, seen through its events or through a reconnect's
 * snapshot), in which case they are dropped with their sound. The timers are the host's, so a
 * test can hand in a fake clock.
 */
export class HeldPresentations {
  private held = new Map<ReturnType<typeof setTimeout>, { phase: string; cancel?: () => void }>()

  constructor(
    private readonly show: (shown: Presentation) => void,
    private readonly timers: Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'> = globalThis,
  ) {}

  /** The table is in `phase`: anything held for another phase is dropped, sound included. */
  moved(phase: string): void {
    for (const [timer, entry] of this.held) {
      if (entry.phase === phase) continue
      this.timers.clearTimeout(timer)
      this.held.delete(timer)
      entry.cancel?.()
    }
  }

  /** Shows `shown` now, or after its `after`, so long as the table stays in `phase`. */
  take(shown: Presentation, phase: string): void {
    this.moved(phase)
    if (!shown.after) return this.show(shown)
    const timer = this.timers.setTimeout(() => {
      this.held.delete(timer)
      this.show(shown)
    }, shown.after)
    this.held.set(timer, { phase, cancel: shown.cancel })
  }

  /** Drops everything still held, sounds included: the screen is going away. */
  clear(): void {
    for (const [timer, entry] of this.held) {
      this.timers.clearTimeout(timer)
      entry.cancel?.()
    }
    this.held.clear()
  }
}
