/**
 * Hearts' screens, as the shell loads them. The table is a placeholder until Hearts has its own,
 * and practice is still to come. Reads only the engine: the computer players stay on the server.
 */
import type { GameClient } from '../../ui/contract'
import { type Action, type GameEvent, SEAT_COUNTS, type View } from './engine'
import { dwell } from './ui/dwell'
import { present } from './ui/present'
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
  Table,
  rules: ruleBook,
  lobbyTeams: () => null,
  rejections: REJECTIONS,
  practice: null,
}
