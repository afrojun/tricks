/**
 * Every game the server can hold, by id. The only place that knows them all: the room, the
 * Worker's name check and the tests read it. The browser loads a game's screens on its own.
 */
import { type AnyGameModule, anyGame } from '../kit/module'
import { splitRoomName } from '../protocol'
import { hearts } from './hearts'
import { thunee } from './thunee'

export const GAMES: ReadonlyMap<string, AnyGameModule> = new Map([anyGame(thunee), anyGame(hearts)].map((module) => [module.id, module]))

/** The game a room named `<game>-<CODE>` holds; null for a name that is not a known game and a code. */
export function gameOf(roomName: string): AnyGameModule | null {
  const parts = splitRoomName(roomName)
  return (parts && GAMES.get(parts.game)) ?? null
}

export function isRoomName(name: string): boolean {
  return gameOf(name) !== null
}
