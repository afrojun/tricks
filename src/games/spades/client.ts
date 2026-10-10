/**
 * Spades' screens, as the shell loads them: its table, what its events show, its house rules. Practice runs the
 * game in the browser, computer players and tier-1 coach included.
 */
import { practiceClient } from '../../practice/client'
import type { GameClient } from '../../ui/contract'
import { type Action, type GameEvent, SEAT_COUNTS, type View } from './engine'
import { spadesPractice } from './practice'
import { dwell } from './ui/dwell'
import { present } from './ui/present'
import { ruleBook } from './ui/rules'
import { Table } from './ui/Table'
import { REJECTIONS } from './ui/text'

export const spadesClient: GameClient<View, Action, GameEvent> = {
  id: 'spades',
  name: 'Spades',
  tagline: 'Spades are trump. Call your tricks, then take them.',
  direction: 'clockwise',
  seatCounts: SEAT_COUNTS,
  dwell,
  present,
  Table,
  rules: ruleBook,
  lobbyTeams: (seat, playerCount) => (playerCount === 4 ? seat % 2 : null),
  timers: [],
  rejections: REJECTIONS,
  practice: practiceClient(spadesPractice, dwell),
}
