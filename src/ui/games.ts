/**
 * The games the browser knows: what the Tricks home lists, and where each game's screens load
 * from. Nothing here loads a game; its code is fetched only when one of its addresses is visited.
 * The server's list, `src/games/index.ts`, is never imported by the browser.
 */
import type { Card } from '../kit/cards'
import { type AnyGameClient, anyClient } from './contract'

/** A game as the Tricks home lists it, without loading it. Each game's own client says the same. */
export interface GameEntry {
  id: string
  name: string
  tagline: string
  seatCounts: readonly number[]
  /** The card that stands for the game on its box: Thunee's high Jack, Hearts' queen of spades, Spades' ace. */
  emblem: Card
}

export const GAMES = [
  { id: 'thunee', name: 'Thunee', tagline: 'Jack high, twelve balls to win.', seatCounts: [2, 4], emblem: { rank: 'J', suit: 'spades' } },
  { id: 'hearts', name: 'Hearts', tagline: 'Take no hearts, and never the queen of spades.', seatCounts: [4], emblem: { rank: 'Q', suit: 'spades' } },
  { id: 'spades', name: 'Spades', tagline: 'Spades are trump. Call your tricks, then take them.', seatCounts: [2, 3, 4], emblem: { rank: 'A', suit: 'spades' } },
] as const satisfies readonly GameEntry[]

export type GameId = (typeof GAMES)[number]['id']

/** One dynamic import per game, so the build gives each game a chunk of its own. */
const LOADERS: Record<GameId, () => Promise<AnyGameClient>> = {
  thunee: () => import('../games/thunee/client').then((m) => anyClient(m.thuneeClient)),
  hearts: () => import('../games/hearts/client').then((m) => anyClient(m.heartsClient)),
  spades: () => import('../games/spades/client').then((m) => anyClient(m.spadesClient)),
}

const loaded = new Map<GameId, Promise<AnyGameClient>>()

/** A game's screens, fetched once and kept. The same promise every time, as React's `use` needs. */
export function loadGame(id: GameId): Promise<AnyGameClient> {
  let pending = loaded.get(id)
  if (!pending) {
    pending = LOADERS[id]()
    loaded.set(id, pending)
  }
  return pending
}
