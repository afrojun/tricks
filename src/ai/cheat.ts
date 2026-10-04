/** When a computer persona breaks the rules, and how it covers its tracks. */
import { type Card, type Suit, type View, type ViewPlaying, pointsOf, rankStrength, teamOf, trickWinner } from '../engine'
import { type Mind, TRAITS } from './mind'
import { history, mood, wouldWin } from './read'
import { noticeOdds } from './suspicion'

/** The attention Sly assumes of whoever is watching. */
const ASSUMED_ATTENTION = 0.6

/**
 * A renege that wins a trick the honest card would lose, if this persona
 * would risk it. Only reneges: an illegal undercut is never chosen.
 */
export function chooseCheat(view: View, phase: ViewPlaying, honest: Card, mind: Mind): Card | null {
  const { cheats, moody } = TRAITS[mind.persona]
  const me = view.seat
  if (cheats === 'never' || me === null || phase.current.length === 0 || wouldWin(phase, me, honest)) return null
  if (teamOf(trickWinner(phase.current, phase.trump)) === teamOf(me)) return null
  const led = phase.current[0].card.suit
  if (!phase.hand.some((c) => c.suit === led)) return null
  const wins = phase.hand
    .filter((c) => c.suit !== led && wouldWin(phase, me, c))
    .sort((a, b) => rankStrength(a.rank) - rankStrength(b.rank))
  const prize = (c: Card) => pointsOf([...phase.current.map((p) => p.card), c])
  const done = phase.tricks.filter((t) => t.half === phase.half).length

  if (cheats === 'careful') {
    // Shown up when the first card of `led` must come out: after the other cards are gone.
    const held = phase.hand.filter((c) => c.suit === led).length
    const gap = Math.max(0, 5 - done - held)
    const theirLead = teamOf(phase.current[0].seat) !== teamOf(me)
    const risk = (c: Card) => noticeOdds(ASSUMED_ATTENTION, gap, 1.3 * (prize(c) >= 30 ? 1.3 : 1) * (theirLead ? 1.2 : 1))
    return wins.filter((c) => prize(c) >= 20 && risk(c) < 0.25).sort((a, b) => risk(a) - risk(b))[0] ?? null
  }

  const m = moody ? mood(view) : 1
  const flashy = phase.current.some((p) => p.card.rank === 'J' || p.card.rank === '9')
  return wins.find((c) => prize(c) >= 20 / m || flashy || done === 5) ?? null
}

/** Leaves out cards that would show up an earlier renege this half, while anything else may be played. */
export function holdBack(view: View, phase: ViewPlaying, legal: readonly Card[]): readonly Card[] {
  const me = view.seat
  const shownVoid = new Set<Suit>()
  for (const t of history(phase)) {
    if (t.half !== phase.half) continue
    const led = t.plays[0].card.suit
    t.plays.forEach((p, i) => i > 0 && p.seat === me && p.card.suit !== led && shownVoid.add(led))
  }
  const safe = legal.filter((c) => !shownVoid.has(c.suit))
  return safe.length > 0 ? safe : legal
}
