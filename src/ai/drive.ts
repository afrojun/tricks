/** What happens without a person acting: deadlines, computer turns, and computers' reactions. Shared by every host. */
import type { Ask as KitAsk, Step as KitStep } from '../kit/module'
import { type Action, type Game, type GameEvent, isAiControlled, seatsToAct, teamOf, viewFor } from '../games/thunee/engine'
import { chooseAction, chooseJodhi, fallbackAction } from './choose'
import { mindFor } from '../kit/mind'
import { chooseChallenge } from './suspicion'

/** Something to apply without a person acting: the kit's `Step`, for Thunee. */
export type Step = KitStep<Action>
/** One question put to a computer seat: the kit's `Ask`, for Thunee. */
export type Ask = KitAsk<Game, Action>

/** A passed phase deadline, or a computer turn whose time has come. Null when nothing is due. */
export function dueStep(game: Game, now: number): Step | null {
  const phase = game.phase
  if ('deadline' in phase && phase.deadline <= now) return { actor: 'system', action: { type: 'tick' } }
  if (game.aiActAt === null || game.aiActAt > now) return null
  const seat = seatsToAct(game).find((s) => isAiControlled(game, s))
  if (seat === undefined) return null
  const view = viewFor(game, seat, 'full')
  return { actor: seat, action: chooseAction(view, mindFor(game, seat)), fallback: fallbackAction(view) }
}

/**
 * The questions to put to computer seats after an applied action, in order:
 * a Jodhi after their team wins a trick (cheating personas sometimes bluff),
 * then a challenge after any card or claim. The host applies each answer
 * (which may raise reactions of its own) before asking the next.
 */
export function reactions(game: Game, events: readonly GameEvent[]): Ask[] {
  const asks: Ask[] = []
  const seats = [...Array(game.playerCount).keys()]
  const won = events.find((e) => e.type === 'trickWon')
  if (won) {
    for (const seat of seats) {
      if (!isAiControlled(game, seat) || teamOf(seat) !== teamOf(won.seat)) continue
      asks.push((now) => {
        const claim = chooseJodhi(viewFor(now, seat, 'full'), mindFor(now, seat))
        return claim && { actor: seat, action: claim }
      })
    }
  }
  if (events.some((e) => e.type === 'cardPlayed' || e.type === 'jodhiClaimed')) {
    for (const seat of seats) {
      asks.push((now) => {
        // A challenge ends the round, so later seats find nothing in play.
        if (now.phase.kind !== 'playing' && now.phase.kind !== 'trickPause') return null
        if (!isAiControlled(now, seat)) return null
        const challenge = chooseChallenge(viewFor(now, seat, 'full'), mindFor(now, seat))
        return challenge && { actor: seat, action: challenge }
      })
    }
  }
  return asks
}
