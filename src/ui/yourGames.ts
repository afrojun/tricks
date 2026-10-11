/** The words and order of "Your games": what each game a device sits in is waiting on. */
import type { RoomStatus } from '../protocol'
import { listNames } from './talk/choices'

/**
 * Runs `work` each time `run` is called and shows only the latest call's answer: an earlier call that
 * answers later is dropped, as is any answer after `close`.
 */
export function latestOnly<T>(work: () => Promise<T>, show: (value: T) => void): { run: () => Promise<void>; close: () => void } {
  let latest = 0
  let open = true
  return {
    run: async () => {
      const mine = ++latest
      const value = await work()
      if (open && mine === latest) show(value)
    },
    close: () => {
      open = false
    },
  }
}

/** "Thunee with Asha, Chan and Devi", or the game and its code while nobody else has sat down. */
export function gameTitle(game: string, code: string, status: RoomStatus): string {
  const others = status.names.filter((name, seat) => name !== '' && seat !== status.seat)
  return others.length > 0 ? `${game} with ${listNames(others)}` : `${game}, game ${code}`
}

/** What the game waits on, as the row's second line. */
export function statusLine(status: RoomStatus): string {
  if (status.stage === 'lobby') return 'In the lobby'
  if (status.stage === 'gameOver') return 'Game over'
  if (status.stage === 'roundOver') return 'Round over'
  if (status.standIn) return 'Computer playing for you'
  if (status.yourTurn) return 'Your turn'
  const waiting = status.waitingOn.filter((seat) => seat !== status.seat).map((seat) => status.names[seat])
  return waiting.length > 0 ? `Waiting for ${listNames(waiting)}` : 'Computers playing'
}

/** Whether the row asks something of this player now: their turn, a computer playing for them, or a round anyone may move on from. */
export function needsYou(status: RoomStatus): boolean {
  return status.stage === 'roundOver' || (status.stage === 'playing' && (status.yourTurn || status.standIn))
}

/** The rows that need the player first, then games in play, then lobbies, then finished games; otherwise as kept, newest first. */
export function rank(status: RoomStatus): number {
  if (needsYou(status)) return 0
  return status.stage === 'playing' ? 1 : status.stage === 'lobby' ? 2 : 3
}
