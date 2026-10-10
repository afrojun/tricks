/** When a computer persona breaks the rules, and how it covers its tracks. */
import { exposes, noticeOdds } from '../../../kit/integrity'
import { type Mind, TRAITS, roll } from '../../../kit/mind'
import { type Action, type Card, type Suit, type View, type ViewPlaying, pointsOf, rankStrength, sameCard, seenPlays, teamOf, trickWinner } from '../engine'
import { history, mood, wouldWin } from './read'

/** The attention a cheat assumes of whoever is watching. */
const ASSUMED_ATTENTION = 0.6
/** The most risk of being shown up Sly takes. */
const SLY_NERVE = 0.25
/** Wild's nerve in a good mood; being behind raises it, up to WILD_NERVE_MAX. */
const WILD_NERVE = 0.3
const WILD_NERVE_MAX = 0.45
/** The chance Wild gives in to a trick's temptation at all. */
const WILD_GIVES_IN = 0.15
/** The chance Wild bluffs a Jodhi it judges safe. */
const BLUFF_CHANCE = 0.5

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

  // Shown up when the first card of `led` must come out: after the other cards are gone, since both cheats hold it back.
  const heldCards = phase.hand.filter((c) => c.suit === led)
  const held = heldCards.length
  // J and 9 are the top two ranks, so the giveaway is a J or 9 only when every held card of the suit is.
  const showsHigh = heldCards.every((c) => c.rank === 'J' || c.rank === '9')
  const gap = Math.max(0, 5 - done - held)
  const theirLead = teamOf(phase.current[0].seat) !== teamOf(me)
  const risk = (c: Card) => noticeOdds(ASSUMED_ATTENTION, gap, 1.3 * (prize(c) >= 30 ? 1.3 : 1) * (theirLead ? 1.2 : 1) * (showsHigh ? 1.2 : 1))

  if (cheats === 'careful') {
    return wins.filter((c) => prize(c) >= 20 && risk(c) < SLY_NERVE).sort((a, b) => risk(a) - risk(b))[0] ?? null
  }

  // Wild dares more than Sly, more still when behind, but gives in only now and then; it takes the first card that tempts it.
  if (roll(mind.salt, me, `renege:${phase.tricks.length}`) >= WILD_GIVES_IN) return null
  const m = moody ? mood(view) : 1
  const flashy = phase.current.some((p) => p.card.rank === 'J' || p.card.rank === '9')
  return wins.find((c) => (prize(c) >= 20 / m || flashy) && risk(c) < nerve(mind, m)) ?? null
}

/** The most risk of being shown up this cheat takes, in the mood `m`. */
function nerve(mind: Mind, m: number): number {
  return TRAITS[mind.persona].cheats === 'careful' ? SLY_NERVE : Math.min(WILD_NERVE * m, WILD_NERVE_MAX)
}

/**
 * A false Jodhi, which only Wild tries, with four players and once a round:
 * it holds one of the pair, and neither opponent can hold the other, since both
 * have shown out of the suit this half and neither has played it since. Every
 * card comes out by the end of the round, so its partner will play the other in
 * front of them; Sly knows this, and never bluffs one.
 */
export function chooseBluff(view: View, phase: ViewPlaying, open: readonly Suit[], mind: Mind): Action | null {
  const me = view.seat
  if (TRAITS[mind.persona].cheats !== 'reckless' || me === null || view.playerCount !== 4 || phase.jodhiClaims.some((j) => j.seat === me)) return null
  const tricks = history(phase)
  const played = tricks.flatMap((t) => t.plays)
  // Out of the suit since it showed out: a later card of the suit shows the void was a renege.
  const shownOut = (seat: number, suit: Suit) => {
    const plays = tricks.filter((t) => t.half === phase.half).flatMap((t) => t.plays.map((p) => ({ ...p, led: t.plays[0].card.suit })))
    const out = plays.findIndex((p) => p.seat === seat && p.led === suit && p.card.suit !== suit)
    return out >= 0 && !plays.slice(out).some((p) => p.seat === seat && p.card.suit === suit)
  }
  const opponents = phase.handCounts.flatMap((_, seat) => (teamOf(seat) === teamOf(me) ? [] : [seat]))
  for (const suit of open) {
    const pair = phase.hand.filter((c) => c.suit === suit && (c.rank === 'K' || c.rank === 'Q'))
    if (pair.length !== 1) continue
    const missing: Card = { suit, rank: pair[0].rank === 'K' ? 'Q' : 'K' }
    if (played.some((p) => sameCard(p.card, missing)) || !opponents.every((s) => shownOut(s, suit))) continue
    if (roll(mind.salt, me, `bluff:${phase.tricks.length}:${suit}`) < BLUFF_CHANCE) return { type: 'claimJodhi', suit, withJack: false }
  }
  return null
}

/** Leaves out cards that would show up one of its own excuses this half, while anything else may be played. */
export function holdBack(view: View, phase: ViewPlaying, legal: readonly Card[]): readonly Card[] {
  const own = seenPlays(view).filter((p) => p.seat === view.seat && p.deal === phase.half)
  const safe = legal.filter((c) => !exposes(c, own))
  return safe.length > 0 ? safe : legal
}
