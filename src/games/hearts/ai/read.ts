/** Reading the round from a seat's view. Computer players get the `full` view. */
import { SUITS, type Suit, sameCard } from '../../../kit/cards'
import type { Seat } from '../../../kit/table'
import { trickWinner } from '../../../kit/tricks'
import { type Card, QUEEN_OF_SPADES, RANKS, type Rank, createDeck, penaltyPoints, strength } from '../engine/cards'
import { MOON_POINTS, PLAYERS } from '../engine/rules'
import type { View, ViewPlay, ViewPlaying } from '../engine/types'

export const inPlay = (view: View): ViewPlaying | null =>
  view.phase.kind === 'playing' || view.phase.kind === 'trickPause' ? view.phase : null

export interface TrickRecord {
  index: number
  plays: ViewPlay[]
  /** Null for the trick still being played. */
  winner: Seat | null
}

/** Every trick of the round whose cards are visible, the current one last. */
export function history(phase: ViewPlaying): TrickRecord[] {
  const done = phase.tricks.map((t, index) => ({ index, plays: t.plays, winner: t.winner as Seat | null }))
  return [...done, { index: phase.tricks.length, plays: phase.current, winner: null }].filter((t) => t.plays.length > 0)
}

/** Where each card comes in `createDeck`'s order, by suit and then rank. */
const PLACES = Object.fromEntries(SUITS.map((suit, s) => [suit, Object.fromEntries(RANKS.map((rank, r) => [rank, s * RANKS.length + r]))])) as Record<Suit, Record<Rank, number>>

/** Where a card comes in `createDeck`'s order. */
export const place = (c: Card) => PLACES[c.suit][c.rank]

/** Cards neither in the viewer's hand nor seen played: what the other seats may hold. Needs a `full` view. */
export function unseen(phase: ViewPlaying): Card[] {
  const known: boolean[] = []
  for (const c of phase.hand) known[place(c)] = true
  for (const t of phase.tricks) for (const p of t.plays) known[place(p.card)] = true
  for (const p of phase.current) known[place(p.card)] = true
  return createDeck().filter((_, i) => !known[i])
}

/** The play winning the trick so far. */
export function winningPlay(current: readonly ViewPlay[]): ViewPlay {
  const seat = trickWinner(current, { trump: null, strength })
  return current.find((p) => p.seat === seat)!
}

export function wouldWin(current: readonly ViewPlay[], me: Seat, card: Card): boolean {
  return trickWinner([...current, { seat: me, card }], { trump: null, strength }) === me
}

/** The queen of spades is with another seat: neither held nor seen played. */
export function queenOut(phase: ViewPlaying): boolean {
  return unseen(phase).some((c) => sameCard(c, QUEEN_OF_SPADES))
}

/** Hearts and the queen of spades each seat has taken in the tricks before `before`. Needs a `full` view. */
export function penaltyTaken(phase: ViewPlaying, before = Infinity): number[] {
  const out = Array.from({ length: PLAYERS }, () => 0)
  phase.tricks.forEach((t, index) => {
    if (index < before) out[t.winner] += penaltyPoints(t.plays.map((p) => p.card))
  })
  return out
}

/** Another seat that has taken every point so far, and at least half the round's: it may shoot the moon. */
export function moonThreat(view: View, phase: ViewPlaying): Seat | null {
  const taken = penaltyTaken(phase)
  const shooter = taken.findIndex((p) => p * 2 >= MOON_POINTS)
  if (shooter === -1 || shooter === view.seat) return null
  return taken.every((p, seat) => seat === shooter || p === 0) ? shooter : null
}

/**
 * 1, plus a half each for being behind in the game and for having taken the
 * most points this round. With `before`, points count only the tricks before
 * that index (scores do not change in a round), so a past moment is judged as
 * it was. Needs a `full` view.
 */
export function mood(view: View, before = Infinity): number {
  const me = view.seat
  if (me === null) return 1
  let m = view.scores.some((score, seat) => seat !== me && score < view.scores[me]) ? 1.5 : 1
  const phase = inPlay(view)
  if (phase !== null) {
    const taken = penaltyTaken(phase, before)
    if (taken[me] > 0 && taken.every((p) => p <= taken[me])) m += 0.5
  }
  return m
}
