/** Where each address leads, and how addresses are built. Pure, so it is tested without a browser. */
import { SHARE_PARAM } from '../presets/share'
import { GAMES, type GameId } from './games'

/** The games with screens. A game the server holds has an address here only once it has them. */
const GAME_IDS: readonly string[] = GAMES.map((game) => game.id)

export type Route =
  | { screen: 'tricks' }
  | { screen: 'home'; game: GameId }
  | { screen: 'room'; game: GameId; code: string }
  | { screen: 'practice'; game: GameId }
  | { screen: 'rules'; game: GameId }

export const CODE_LENGTH = 6

/** Room codes are letters only, upper-cased, whatever was typed or pasted. */
export function cleanCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, CODE_LENGTH)
}

const isGame = (part: string | undefined): part is GameId => part !== undefined && GAME_IDS.includes(part)

/** Old addresses (`/game/<CODE>`, `/practice`) are not redirected: they show the Tricks home. */
export function route(path: string): Route {
  const [game, rest, ...more] = path.split('/').filter(Boolean)
  if (!isGame(game) || more.length > 0) return { screen: 'tricks' }
  if (rest === undefined) return { screen: 'home', game }
  // Before a code: cleaned, "practice" would read as the code PRACTI.
  if (rest === 'practice') return { screen: 'practice', game }
  if (rest === 'rules') return { screen: 'rules', game }
  // Read like a typed code, as `/game/<x>` was: upper-cased, letters only, the first six kept.
  // So ABCDEFG and ab-cd-ef both open ABCDEF; fewer than six letters lead to the game's home.
  const code = cleanCode(rest)
  return code.length === CODE_LENGTH ? { screen: 'room', game, code } : { screen: 'home', game }
}

export function gamePath(game: string): string {
  return `/${game}`
}

export function roomPath(game: string, code: string): string {
  return `/${game}/${code}`
}

/** The parts of a click that decide where a link opens. */
export interface LinkClick {
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  defaultPrevented: boolean
}

/** Whether a click on an in-app link should navigate in place; any other click keeps the browser's own behaviour (new tab, window, download). */
export function opensInPlace(click: LinkClick): boolean {
  return click.button === 0 && !click.metaKey && !click.ctrlKey && !click.shiftKey && !click.altKey && !click.defaultPrevented
}

/** With a player count, a new practice game; without, the saved one. */
export function practicePath(game: string, players?: number): string {
  return `/${game}/practice${players === undefined ? '' : `?players=${players}`}`
}

const DRILL_PARAM = 'drill'

/** A drill, which practice plays instead of a game. */
export function drillPath(game: string, drill: string): string {
  return `/${game}/practice?${new URLSearchParams({ [DRILL_PARAM]: drill })}`
}

/** A game's home with its list of drills open. */
export function drillsPath(game: string): string {
  return `/${game}?${DRILL_PARAM}s`
}

/** Whether a home address asks for the list of drills. */
export function drillsQuery(search: string): boolean {
  return new URLSearchParams(search).has(`${DRILL_PARAM}s`)
}

/** The drill a practice address asks for, if any. */
export function drillQuery(search: string): string | undefined {
  return new URLSearchParams(search).get(DRILL_PARAM) ?? undefined
}

/** What the rules screen's address may carry: a preset to select, a shared preset's code, and the room it was opened from. */
export interface RulesQuery {
  preset?: string
  shared?: string
  from?: string
}

const PRESET_PARAM = 'preset'
const FROM_PARAM = 'from'

/** `/<game>/rules`, selecting a preset, showing a shared one, or with its back link to a room. */
export function rulesPath(game: string, query: RulesQuery = {}): string {
  const params = new URLSearchParams()
  if (query.preset !== undefined) params.set(PRESET_PARAM, query.preset)
  if (query.shared !== undefined) params.set(SHARE_PARAM, query.shared)
  if (query.from !== undefined) params.set(FROM_PARAM, query.from)
  const search = params.toString()
  return `/${game}/rules${search ? `?${search}` : ''}`
}

/** Reads the rules screen's query. A `from` that is not a room code is ignored. */
export function rulesQuery(search: string): RulesQuery {
  const params = new URLSearchParams(search)
  const from = cleanCode(params.get(FROM_PARAM) ?? '')
  return {
    preset: params.get(PRESET_PARAM) ?? undefined,
    shared: params.get(SHARE_PARAM) ?? undefined,
    from: from.length === CODE_LENGTH ? from : undefined,
  }
}
