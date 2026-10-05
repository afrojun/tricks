/** Where each address leads, and how addresses are built. Pure, so it is tested without a browser. */
import { GAME_IDS, type GameId } from '../protocol'

export type Route =
  | { screen: 'tricks' }
  | { screen: 'home'; game: GameId }
  | { screen: 'room'; game: GameId; code: string }
  | { screen: 'practice'; game: GameId }

export const CODE_LENGTH = 6

/** Room codes are letters only, upper-cased, whatever was typed or pasted. */
export function cleanCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, CODE_LENGTH)
}

const isGame = (part: string | undefined): part is GameId => (GAME_IDS as readonly (string | undefined)[]).includes(part)

/** Old addresses (`/game/<CODE>`, `/practice`) are not redirected: they show the Tricks home. */
export function route(path: string): Route {
  const [game, rest, ...more] = path.split('/').filter(Boolean)
  if (!isGame(game) || more.length > 0) return { screen: 'tricks' }
  if (rest === undefined) return { screen: 'home', game }
  // Before a code: cleaned, "practice" would read as the code PRACTI.
  if (rest === 'practice') return { screen: 'practice', game }
  // cleanCode keeps letters only, so a malformed or escaped code simply fails to match a room.
  const code = cleanCode(rest)
  return code.length === CODE_LENGTH ? { screen: 'room', game, code } : { screen: 'home', game }
}

export function gamePath(game: GameId): string {
  return `/${game}`
}

export function roomPath(game: GameId, code: string): string {
  return `/${game}/${code}`
}

/** With a player count, a new practice game; without, the saved one. */
export function practicePath(game: GameId, players?: 2 | 4): string {
  return `/${game}/practice${players === undefined ? '' : `?players=${players}`}`
}
