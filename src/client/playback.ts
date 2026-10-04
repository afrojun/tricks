import type { GameEvent } from '../engine'
import type { ServerMessage } from '../protocol'

/** How long each kind of event stays on screen before the next message is shown. */
const DWELL_MS: Partial<Record<GameEvent['type'], number>> = {
  passed: 300,
  cardPlayed: 450,
  dealt: 600,
  trumpRevealed: 600,
  trumpChosen: 700,
  called: 800,
  jodhiClaimed: 1400,
  dealCancelled: 1500,
  doubleCalled: 1600,
  khanaakCalled: 1600,
  thuneeCalled: 1800,
  challengeResolved: 2200,
}

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

type Deliver = (message: ServerMessage, receivedAt: number) => void

/**
 * Paces server messages so each move can be seen. A message is shown as soon
 * as nothing is being held; it then holds the next one back for its dwell.
 */
export class Playback {
  private waiting: { message: ServerMessage; receivedAt: number }[] = []
  private heldUntil = 0

  constructor(
    private readonly deliver: Deliver,
    private readonly clock: Clock = browserClock(),
  ) {}

  push(message: ServerMessage): void {
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
      this.heldUntil = now + dwell(message)
      this.deliver(message, receivedAt)
    }
  }
}

function dwell(message: ServerMessage): number {
  if (message.type !== 'sync') return 0
  return Math.max(0, ...message.events.map((e) => DWELL_MS[e.type] ?? 0))
}
