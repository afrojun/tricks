/** Reading the round from a seat's view. Computer players get the `full` view. */
import { type Card, type Seat, type Suit, type View, type ViewPlay, type ViewPlaying, allSeats, createDeck, hasCard, pointsOf, rankStrength, teamOf, trickWinner } from '../engine'

export interface TrickRecord {
  index: number
  half: 1 | 2
  plays: ViewPlay[]
  /** Null for the trick still being played. */
  winner: Seat | null
}

/** Every trick of the round whose cards are visible, the current one last. */
export function history(phase: ViewPlaying): TrickRecord[] {
  const done = phase.tricks.map((t, index) => ({ index, half: t.half, plays: t.plays, winner: t.winner as Seat | null }))
  const current = { index: phase.tricks.length, half: phase.half, plays: phase.current, winner: null }
  return [...done, current].filter((t) => t.plays.length > 0)
}

/** Cards the seat has not seen: neither in its hand nor played in a trick it remembers. They may be in any other hand, or not dealt yet. */
export function unseen(phase: ViewPlaying): Card[] {
  const seen = [...phase.hand, ...history(phase).flatMap((t) => t.plays.map((p) => p.card))]
  return createDeck().filter((c) => !hasCard(seen, c))
}

/** The suits each seat has shown it holds none of this half, by not following them. Hands are dealt afresh each half. */
export function shownVoid(phase: ViewPlaying): Map<Seat, Set<Suit>> {
  const voids = new Map<Seat, Set<Suit>>()
  for (const trick of history(phase).filter((t) => t.half === phase.half)) {
    const led = trick.plays[0].card.suit
    for (const p of trick.plays.slice(1)) {
      if (p.card.suit !== led) voids.set(p.seat, (voids.get(p.seat) ?? new Set()).add(led))
    }
  }
  return voids
}

/**
 * Whether a card led by `me` must win the trick, as far as the seat can tell: no opponent can hold an
 * unseen card that beats it, counting only suits they have not shown they lack. It trusts that
 * nobody has hidden a card by not following suit.
 */
export function sureLead(view: View, phase: ViewPlaying, me: Seat, card: Card): boolean {
  const voids = shownVoid(phase)
  const opponents = allSeats(view.playerCount).filter((s) => teamOf(s) !== teamOf(me))
  const beats = (x: Card) =>
    x.suit === card.suit ? rankStrength(x.rank) > rankStrength(card.rank) : phase.trump !== null && x.suit === phase.trump && card.suit !== phase.trump
  return !unseen(phase).some((x) => beats(x) && opponents.some((o) => !voids.get(o)?.has(x.suit)))
}

export function wouldWin(phase: ViewPlaying, me: Seat, card: Card): boolean {
  return trickWinner([...phase.current, { seat: me, card }], phase.trump) === me
}

/**
 * 1, plus a half each for being behind in balls and behind in card points this round.
 * With `asOf`, card points count only tricks up to that index (balls do not change in a round),
 * so a past moment can be judged as it was. Needs a full view: the tricks must show their cards.
 */
export function mood(view: View, asOf = Infinity): number {
  const me = view.seat
  if (me === null) return 1
  const team = teamOf(me)
  let m = view.balls[team] < view.balls[1 - team] ? 1.5 : 1
  const phase = view.phase
  if (phase.kind === 'playing' || phase.kind === 'trickPause') {
    const points = [0, 0]
    phase.tricks.forEach((t, index) => {
      if (index <= asOf) points[teamOf(t.winner)] += pointsOf(t.plays.map((p) => p.card))
    })
    if (points[team] < points[1 - team]) m += 0.5
  }
  return m
}
