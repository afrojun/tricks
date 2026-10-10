/** Reading the round from a seat's view. Computer players get the `full` view. */
import { partnerOf } from '../../../kit/partners'
import type { Seat } from '../../../kit/table'
import { trickWinner } from '../../../kit/tricks'
import { type Card, TRUMP, createDeck, place, strength, suitOf } from '../engine/cards'
import { sideOf } from '../engine/rules'
import { contractTricks } from '../engine/scoring'
import type { View, ViewPlay, ViewPlaying } from '../engine/types'

export const inPlay = (view: View): ViewPlaying | null => (view.phase.kind === 'playing' || view.phase.kind === 'trickPause' ? view.phase : null)

/** How cards are ordered and played under the view's rules. */
export function order(view: Pick<View, 'rules'>) {
  return { trump: TRUMP, strength: strength(view.rules.jokers), suitOf: suitOf(view.rules.jokers) }
}

/** Cards neither in the viewer's hand nor known to it: what the others may hold, or what was set aside. Needs a `full` view. */
export function unseen(view: View, phase: ViewPlaying): Card[] {
  const known: boolean[] = []
  for (const c of phase.hand) known[place(c)] = true
  for (const t of phase.tricks) for (const p of t.plays) known[place(p.card)] = true
  for (const p of phase.current) known[place(p.card)] = true
  for (const c of phase.discards) known[place(c)] = true
  return createDeck(view.rules.jokers).filter((c) => !known[place(c)])
}

/** The play winning the trick so far. */
export function winningPlay(view: View, current: readonly ViewPlay[]): ViewPlay {
  const seat = trickWinner(current, order(view))
  return current.find((p) => p.seat === seat)!
}

export function wouldWin(view: View, current: readonly ViewPlay[], me: Seat, card: Card): boolean {
  return current.length === 0 || trickWinner([...current, { seat: me, card }], order(view)) === me
}

/** Whether no unseen card of its suit beats `card`. */
export function isBoss(view: View, phase: ViewPlaying, card: Card): boolean {
  const { strength: rank, suitOf: of } = order(view)
  return !unseen(view, phase).some((c) => of(c) === of(card) && rank(c) > rank(card))
}

/** A Nil still standing: called, no trick taken, not failed. */
export function standingNil(phase: ViewPlaying, seat: Seat): boolean {
  return phase.calls[seat].tricks === 0 && phase.taken[seat] === 0 && !phase.nilFailed[seat]
}

/** How the viewer's side stands: tricks still needed for its contract (0 or less once made), and tricks left. */
export function standing(view: View, phase: ViewPlaying, seat: Seat) {
  const side = sideOf(seat, view.playerCount)
  const left = phase.hand.length + (phase.current.some((p) => p.seat === seat) ? 1 : 0)
  return { needs: phase.contracts[side] - contractTricks(side, phase.calls, phase.taken, view.playerCount), left }
}

/** Opponents of `seat` with a contract still to make, and the tricks each still needs. */
export function opponentNeeds(view: View, phase: ViewPlaying, seat: Seat): number[] {
  const mine = sideOf(seat, view.playerCount)
  const out: number[] = []
  phase.contracts.forEach((contract, side) => {
    if (side === mine || contract === 0) return
    out.push(contract - contractTricks(side, phase.calls, phase.taken, view.playerCount))
  })
  return out
}

/** The partner at four, or null. */
export const partner = (view: View, seat: Seat): Seat | null => partnerOf(seat, view.playerCount)

/** 1, or 1.5 when behind in the game. */
export function mood(view: View): number {
  const me = view.seat
  if (me === null) return 1
  const mine = view.scores[sideOf(me, view.playerCount)]
  return view.scores.some((s) => s > mine) ? 1.5 : 1
}
