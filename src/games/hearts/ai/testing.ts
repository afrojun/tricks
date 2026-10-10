/** Helpers for the search player's tests. Not used by the app. */
import type { SearchGame, World } from '../../../kit/search/types'
import { deepFreeze, same } from '../../../kit/testing'
import type { Card } from '../engine/cards'
import { checkInvariants } from '../engine/invariants'
import type { Table } from '../engine/testing'
import type { Action, Game, View } from '../engine/types'
import { viewFor } from '../engine/view'
import { rebuild } from './imagine'
import { heartsSearch } from './search'

/**
 * The adapter with every rebuilt world checked: the invariants hold, and the seat gets its own view back exactly.
 * The search rebuilds a world once for each candidate, from the same view and world, and `rebuild` reads
 * nothing else; frozen once checked, they give the same game every time, so each world is checked once.
 */
export function checking(tally = { worlds: 0 }, worlds = heartsSearch.worlds): SearchGame<Game, Action, View, Card> {
  let checked: { view: View; world: World<Card> } | null = null
  return {
    ...heartsSearch,
    worlds,
    rebuild(view, world) {
      const game = rebuild(view, world)
      if (checked?.view === view && checked.world === world) return game
      deepFreeze(view)
      deepFreeze(world)
      checkInvariants(game)
      if (!same(viewFor(game, view.seat, 'full'), view)) throw new Error('a rebuilt world gives another view')
      tally.worlds++
      checked = { view, world }
      return game
    },
  }
}

/** The seat's `full` view of the table's game, as the search decides from. */
export const full = (t: Table, seat: number) => viewFor(t.game, seat, 'full')
