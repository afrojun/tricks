/** Words the screens and the rooms both say: a list of names, and a game named by the people at it. */
import type { Seat } from './table'

/** "Asha", "Asha and Devi", "Asha, Chan and Devi". */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** "Thunee with Asha, Chan and Devi", seen from `seat`; or the game and its code while nobody else sits there. */
export function tableTitle(game: string, code: string, names: readonly string[], seat: Seat): string {
  const others = names.filter((name, s) => name !== '' && s !== seat)
  return others.length > 0 ? `${game} with ${listNames(others)}` : `${game}, game ${code}`
}
