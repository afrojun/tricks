/**
 * The games this device has a seat in, for "Your games": each room's game and code and when it was
 * last seen with a seat, and what the room says of it now. The device keeps only the list; the
 * room answers for itself, and only to a device seated in it.
 */
import { type RoomStatus, STATUS_TOKEN_HEADER, roomName } from '../protocol'
import { deviceToken } from './identity'

const KEY = 'tricks-rooms'
/** The newest rooms kept, and how long one not seen is kept. */
export const MAX_ROOMS = 20
export const ROOM_KEPT_MS = 30 * 24 * 60 * 60 * 1000

export interface KeptRoom {
  game: string
  code: string
  /** When this device last saw itself seated there. */
  seen: number
}

/** The rooms kept, newest first, none older than a month. */
export function keptRooms(now = Date.now()): KeptRoom[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    if (!Array.isArray(raw)) return []
    return raw
      .filter((r): r is KeptRoom => typeof r?.game === 'string' && typeof r?.code === 'string' && typeof r?.seen === 'number')
      .filter((r) => now - r.seen < ROOM_KEPT_MS)
      .sort((a, b) => b.seen - a.seen)
      .slice(0, MAX_ROOMS)
  } catch {
    return []
  }
}

function write(rooms: KeptRoom[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(rooms))
  } catch {
    // A full or blocked store forgets.
  }
}

/** This device has a seat in a room: kept, as seen now. */
export function keepRoom(game: string, code: string, now = Date.now()): void {
  const others = keptRooms(now).filter((r) => r.game !== game || r.code !== code)
  write([{ game, code, seen: now }, ...others].slice(0, MAX_ROOMS))
}

/**
 * This device has no seat in a room any more: stood up, or the room was reset. With `seen`, only if the
 * room has not been kept again since then: an answer about an older seat must not forget a newer one.
 */
export function forgetRoom(game: string, code: string, now = Date.now(), seen?: number): void {
  const rooms = keptRooms(now)
  const left = rooms.filter((r) => r.game !== game || r.code !== code || (seen !== undefined && r.seen !== seen))
  if (left.length === rooms.length) return
  write(left)
  // Its last event seen goes with it: a room reset and played again is a new game.
  try {
    const seenEvents = JSON.parse(localStorage.getItem('tricks-seen') ?? '{}') as Record<string, number>
    delete seenEvents[`${game}-${code}`]
    localStorage.setItem('tricks-seen', JSON.stringify(seenEvents))
  } catch {
    // A full or blocked store forgets.
  }
}

/** What a room says of this device's seat now, or null when it gives none: the room forgot the seat, and so does the device. */
export async function fetchStatus(room: KeptRoom): Promise<RoomStatus | null | 'unknown'> {
  try {
    const response = await fetch(`/parties/room/${roomName(room.game, room.code)}`, { headers: { [STATUS_TOKEN_HEADER]: deviceToken() } })
    if (response.status === 404) {
      forgetRoom(room.game, room.code, Date.now(), room.seen)
      return null
    }
    // Too many requests, or the network: say nothing of it this time.
    if (!response.ok) return 'unknown'
    return (await response.json()) as RoomStatus
  } catch {
    return 'unknown'
  }
}

const SEEN_KEY = 'tricks-seen'

function readSeen(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as unknown
    return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, number>) : {}
  } catch {
    return {}
  }
}

/** The number of the last event this device saw in a room it sits in, to ask what it missed; null if none is kept. */
export function lastSeenEvent(game: string, code: string): number | null {
  if (!keptRooms().some((r) => r.game === game && r.code === code)) return null
  const n = readSeen()[`${game}-${code}`]
  return Number.isInteger(n) && n >= 0 ? n : null
}

/** Keeps the room's latest event as seen, for the rooms this device sits in only; the rest are dropped as it writes. */
export function noteSeenEvent(game: string, code: string, n: number): void {
  const key = `${game}-${code}`
  const seen = readSeen()
  if (seen[key] === n) return
  const kept = new Set(keptRooms().map((r) => `${r.game}-${r.code}`))
  const next = Object.fromEntries(Object.entries({ ...seen, [key]: n }).filter(([k]) => kept.has(k)))
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(next))
  } catch {
    // A full or blocked store forgets.
  }
}
