import type { Seat } from '../../kit/table'

/**
 * Throws still to land, by thrower, with what stops each one's sound (and a nudge's buzz).
 * Muting a thrower, turning reactions off or leaving the table stops them before they land.
 */
export class Landings {
  private pending = new Set<{ from: Seat; stop: () => void; at: number }>()

  constructor(private readonly now: () => number = Date.now) {}

  add(from: Seat, stop: () => void, after: number): void {
    const now = this.now()
    for (const l of this.pending) if (l.at < now) this.pending.delete(l)
    this.pending.add({ from, stop, at: now + after })
  }

  /** Stops those whose thrower `which` picks; every one when given none. */
  stop(which: (from: Seat) => boolean = () => true): void {
    for (const l of this.pending) {
      if (!which(l.from)) continue
      l.stop()
      this.pending.delete(l)
    }
  }
}
