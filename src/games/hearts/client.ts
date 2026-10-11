/**
 * Hearts' screens, as the shell loads them: its table, what its events show, its house rules.
 * Practice runs the game in the browser, computer players and tier-1 coach included.
 */
import { practiceClient } from '../../practice/client'
import type { GameClient } from '../../ui/contract'
import { type Action, type GameEvent, SEAT_COUNTS, type View } from './engine'
import { heartsPractice } from './practice'
import { dwell } from './ui/dwell'
import { present } from './ui/present'
import { recap } from './ui/recap'
import { ruleBook } from './ui/rules'
import { Table } from './ui/Table'
import { REJECTIONS } from './ui/text'

export const heartsClient: GameClient<View, Action, GameEvent> = {
  id: 'hearts',
  name: 'Hearts',
  tagline: 'Take no hearts, and never the queen of spades.',
  direction: 'clockwise',
  seatCounts: SEAT_COUNTS,
  dwell,
  present,
  recap,
  Table,
  rules: ruleBook,
  lobbyTeams: () => null,
  timers: [],
  rejections: REJECTIONS,
  practice: practiceClient(heartsPractice, dwell),
}
