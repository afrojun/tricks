/** When a computer persona breaks the rules, and how it covers its tracks. */
import { hasCard, sameCard } from '../../../kit/cards'
import { brokenRules, exposes, noticeOdds } from '../../../kit/integrity'
import { type Mind, TRAITS } from '../../../kit/mind'
import { allSeats } from '../../../kit/table'
import { type Card, QUEEN_OF_SPADES, trickPoints } from '../engine/cards'
import { excusesFor, seenPlays, situation } from '../engine/excuses'
import { CHALLENGE_POINTS, PLAYERS, passTarget } from '../engine/rules'
import type { View, ViewPlaying } from '../engine/types'
import { GIVEN, LANDED, QUEEN_DODGE } from './catch'
import { mood, unseen, winningPlay, wouldWin } from './read'

/** The attention Sly assumes of each seat watching it. */
const ASSUMED_ATTENTION = 0.6
/** The points Wild reneges to dodge, before its mood. */
const WILD_PRIZE = 4

export interface Cheat {
  card: Card
  /** The points the honest card would have taken as the trick stands. */
  dodges: number
}

/**
 * A renege: a card off the suit led, while holding it, so as not to take the
 * points `honest` would win as the trick stands, above all the queen of spades.
 * Only reneges: the card must break no other rule, and the table must accept
 * it. `discard` is how this seat throws a card when it is void. Sly weighs the
 * chance of being shown up against the points; Wild does not.
 */
export function chooseCheat(
  view: View,
  phase: ViewPlaying,
  honest: Card,
  mind: Mind,
  accepted: readonly Card[],
  discard: (cards: readonly Card[]) => Card,
): Cheat | null {
  const { cheats, moody } = TRAITS[mind.persona]
  const me = view.seat
  if (cheats === 'never' || me === null || phase.current.length === 0) return null
  const led = phase.current[0].card.suit
  const held = phase.hand.filter((c) => c.suit === led)
  if (held.length === 0 || !wouldWin(phase.current, me, honest)) return null
  const dodges = trickPoints([...phase.current.map((p) => p.card), honest], view.rules)
  if (dodges <= 0) return null

  const at = situation(phase)
  const careful = cheats === 'careful'
  const own = seenPlays(view).filter((p) => p.seat === me)
  const reneges = phase.hand.filter(
    (c) =>
      c.suit !== led &&
      hasCard(accepted, c) &&
      brokenRules(phase.hand, excusesFor(c, at, view.rules)).join() === 'followSuit' &&
      !(careful && exposes(c, own)),
  )
  if (reneges.length === 0) return null
  const card = discard(reneges)

  if (careful) {
    const risk = showUpRisk(view, phase, card, held)
    return (1 - risk) * dodges > risk * CHALLENGE_POINTS ? { card, dodges } : null
  }
  return dodges * (moody ? mood(view) : 1) >= WILD_PRIZE ? { card, dodges } : null
}

/**
 * Sly's estimate of the chance that some seat notices a renege of the suit of
 * `held`. Each watches with the attention Sly assumes until the first card of
 * that suit must come out: after the rest of the hand if nobody else can lead
 * the suit, otherwise after about half of it. The seat that passed to this one
 * knows the cards it gave, and sees through a renege of their suit at once.
 */
function showUpRisk(view: View, phase: ViewPlaying, card: Card, held: readonly Card[]): number {
  const me = view.seat!
  const rest = phase.hand.length - 1 - held.length
  const gap = unseen(phase).some((c) => c.suit === held[0].suit) ? Math.floor(rest / 2) : rest
  const queen = sameCard(card, QUEEN_OF_SPADES) || phase.current.some((p) => sameCard(p.card, QUEEN_OF_SPADES))
  const winner = winningPlay(phase.current).seat
  const direction = view.direction
  const passer = direction === 'none' ? null : allSeats(PLAYERS).find((s) => passTarget(s, direction) === me)
  const given = held.some((c) => hasCard(phase.received, c))
  let unnoticed = 1
  for (const seat of allSeats(PLAYERS)) {
    if (seat === me) continue
    const knows = given && seat === passer
    const salience = (queen ? QUEEN_DODGE : 1) * (seat === winner ? LANDED : 1) * (knows ? GIVEN : 1)
    unnoticed *= 1 - noticeOdds(ASSUMED_ATTENTION, knows ? 0 : gap, salience)
  }
  return 1 - unnoticed
}

/** Leaves out cards that would show up an earlier cheat of one's own, while anything else may be played. */
export function holdBack(view: View, legal: readonly Card[]): readonly Card[] {
  const own = seenPlays(view).filter((p) => p.seat === view.seat)
  const safe = legal.filter((c) => !exposes(c, own))
  return safe.length > 0 ? safe : legal
}
