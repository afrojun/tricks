/** Thunee's coach: every member written by hand, in Thunee's own words. Practice calls it through the kit's `GameCoach`. */
import type { GameCoach } from '../../../kit/coach'
import type { Action, Card, GameEvent, RoundSummary, View } from '../engine'
import { advise } from './advise'
import { check } from './check'
import { narrate } from './narrate'
import type { Note } from './note'
import { review } from './review'
import { situation } from './situation'
import { topicsFor } from './topics'

/** A round keeps each half's dealt hands, by seat. */
export const thuneeCoach: GameCoach<View, Action, GameEvent, Note, Card[][], RoundSummary> = { situation, advise, check, narrate, topicsFor, review }
