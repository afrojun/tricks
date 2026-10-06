/** Thunee's screens, as the shell loads them: its table, what its events show, its house rules and its practice. */
import { practiceClient } from '../../practice/client'
import type { GameClient } from '../../ui/contract'
import { type Action, type GameEvent, SEAT_COUNTS, type View, teamOf } from './engine'
import { thuneePractice } from './practice'
import { dwell } from './ui/dwell'
import { present } from './ui/present'
import { ruleBook } from './ui/rules'
import { Table } from './ui/Table'
import { REJECTIONS } from './ui/text'

export const thuneeClient: GameClient<View, Action, GameEvent> = {
  id: 'thunee',
  name: 'Thunee',
  tagline: 'Jack high, twelve balls to win.',
  direction: 'counterclockwise',
  seatCounts: SEAT_COUNTS,
  dwell,
  present,
  Table,
  rules: ruleBook,
  // Two players are two teams of one, so the lobby names them as players.
  lobbyTeams: (seat) => teamOf(seat),
  rejections: REJECTIONS,
  practice: practiceClient(thuneePractice, dwell),
}
