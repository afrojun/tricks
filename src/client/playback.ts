import type { ServerMessage } from '../protocol'

/** With more than this many messages waiting, skip to the newest instead of replaying. */
export const MAX_WAITING = 6

interface Clock {
  now: () => number
  setTimer: (run: () => void, ms: number) => void
  clearTimer: () => void
}

function browserClock(): Clock {
  let handle: ReturnType<typeof setTimeout> | undefined
  return {
    now: () => Date.now(),
    setTimer: (run, ms) => (handle = setTimeout(run, ms)),
    clearTimer: () => clearTimeout(handle),
  }
}

type Deliver<V, E> = (message: ServerMessage<V, E>, receivedAt: number) => void

/**
 * Paces server messages so each move can be seen. A message is shown as soon
 * as nothing is being held; it then holds the next one back for its dwell:
 * the longest the game gives any of its events.
 */
export class Playback<V, E> {
  private waiting: { message: ServerMessage<V, E>; receivedAt: number }[] = []
  private heldUntil = 0

  constructor(
    private readonly deliver: Deliver<V, E>,
    /** How long one of the game's events holds the screen. */
    private readonly dwell: (event: E) => number,
    private readonly clock: Clock = browserClock(),
  ) {}

  push(message: ServerMessage<V, E>): void {
    const receivedAt = this.clock.now()
    if (message.type !== 'sync') return this.deliver(message, receivedAt)
    this.waiting.push({ message, receivedAt })
    if (this.waiting.length > MAX_WAITING) {
      // Too far behind to be worth replaying: jump to where the game is now.
      this.waiting = this.waiting.slice(-1)
      this.heldUntil = 0
    }
    this.drain()
  }

  /**
   * Show anything waiting now and stop holding. Called when the player acts,
   * so the result of their own action is never kept back by an earlier dwell.
   */
  release(): void {
    this.heldUntil = 0
    this.drain()
    this.heldUntil = 0
  }

  /** Forget everything in flight, for a fresh connection. */
  reset(): void {
    this.waiting = []
    this.heldUntil = 0
    this.clock.clearTimer()
  }

  private drain(): void {
    this.clock.clearTimer()
    while (this.waiting.length > 0) {
      const now = this.clock.now()
      if (now < this.heldUntil) {
        this.clock.setTimer(() => this.drain(), this.heldUntil - now)
        return
      }
      const { message, receivedAt } = this.waiting.shift()!
      this.heldUntil = now + this.holdFor(message)
      this.deliver(message, receivedAt)
    }
  }

  private holdFor(message: ServerMessage<V, E>): number {
    if (message.type !== 'sync') return 0
    return Math.max(0, ...message.events.map((e) => this.dwell(e)))
  }
}
