/**
 * The contract between a game's screens and the shell that hosts them: the Tricks home, a game's
 * home, the lobby, practice, and the frame around the table. Each game's `client.ts` supplies one,
 * and the shell loads it only when that game's address is visited. React types, so it lives here
 * with the screens and never in the kit.
 */
import type { ComponentType } from 'react'
import type { CommonRules } from '../kit/rules'
import type { Seat, TableView } from '../kit/table'
import type { PracticeClient } from '../practice/client'
import type { RuleBook } from '../presets/book'
import type { Moment } from './Moments'
import type { Direction } from './seats'

/** What the shell reads of any game's view: the table, and the rules in force. */
export interface ShellView extends TableView {
  rules: CommonRules
}

/** How long a won game's moment holds the middle of the table; a game's `dwell` for game over covers it. */
export const WIN_BEAT_MS = 2600

/** What one event shows besides its sound, which `present` plays itself. */
export interface Presentation {
  /** A line over the foot of the screen. */
  toast?: string
  /** Shown one at a time in the middle of the table. */
  moments?: Moment[]
  /** A won game: confetti in this colour, a theme token such as `var(--team0)`. */
  celebrate?: string
  /**
   * Show all of this only after so many ms, for a climax that waits on what the table is still
   * showing: Thunee's win waits for its balls to fill. Sounds are not held; `present` plays them
   * with `playSound(name, after)` to match.
   */
  after?: number
  /** Called if the table moves on to another phase (a rematch) before `after` passes and this is dropped: takes back the sound scheduled with it. */
  cancel?: () => void
}

export interface GameClient<V extends ShellView, A, E extends { type: string }> {
  /** 'thunee', 'hearts': the game module's id, its path and its rooms' prefix. */
  id: string
  name: string
  /** One line under the name: 'Jack high, twelve balls to win.' */
  tagline: string
  /** Which way play goes, so which side the next player sits on as the viewer sees the table. */
  direction: Direction
  seatCounts: readonly number[]
  /** How long an event holds the screen before the next message is shown. */
  dwell(event: E): number
  /** Plays one event's sound and says what else it shows. */
  present(event: E, view: V, seat: Seat | null): Presentation
  /** Everything after the lobby. */
  Table: ComponentType<{ view: V; room: string }>
  /** House rules: defaults, schema for share links, built-in presets, and each rule's label and choices. */
  rules: RuleBook<V['rules']>
  /** How the lobby groups seats: a seat's team, or null for a game without teams. */
  lobbyTeams(seat: Seat, playerCount: number): number | null
  /** The words for the game's own reasons for refusing an action; the shell words the table's. */
  rejections: Readonly<Record<string, string>>
  practice: PracticeClient<V, A, E> | null
}

/** Any game's client, as the shell holds it: the view as far as the shell reads it, and the game's actions and events, passed along unread. */
export type AnyGameClient = GameClient<ShellView, unknown, { type: string }>

/**
 * Forgets a client's own types, for the list of games. Sound while the shell hands a client only
 * what its own game made: views and events from a session it opened with that client.
 */
export function anyClient<V extends ShellView, A, E extends { type: string }>(client: GameClient<V, A, E>): AnyGameClient {
  return client as unknown as AnyGameClient
}
