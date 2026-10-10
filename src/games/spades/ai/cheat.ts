/** When a computer persona breaks the rules, and how it covers its tracks. */
import { hasCard } from '../../../kit/cards'
import { brokenRules, exposes, noticeOdds } from '../../../kit/integrity'
import { type Mind, TRAITS, roll } from '../../../kit/mind'
import { allSeats } from '../../../kit/table'
import type { Card } from '../engine/cards'
import { excusesFor, seenPlays, situation } from '../engine/excuses'
import { NIL_POINTS, RENEGE_TRICKS, sideOf } from '../engine/rules'
import type { View, ViewPlaying } from '../engine/types'
import { mood, order, standing, standingNil, wouldWin } from './read'

/** The attention Sly assumes of each seat watching it. */
const ASSUMED_ATTENTION = 0.6
/** What winning one trick the contract needs is worth, in points, to a cheat. */
const TRICK_PRIZE = 30
/** The fewest points Sly reneges for. */
const SLY_PRIZE = 30
/** The points Wild reneges for, before its mood. */
const WILD_PRIZE = 20
/** How often Wild takes a chance to steal a trick. */
const WILD_TRICK_CHANCE = 0.25

export interface Cheat {
  card: Card
  saves: 'nil' | 'trick'
}

/**
 * A renege: a card off the suit led, while holding it, that saves this seat's standing Nil (the honest card would
 * win) or wins a trick its contract needs (the honest card would not, a spade would). Only reneges: the card must
 * break no other rule, and the table must accept it. Sly weighs the chance of being shown up against the prize;
 * Wild does not.
 */
export function chooseCheat(view: View, phase: ViewPlaying, honest: Card, mind: Mind, accepted: readonly Card[]): Cheat | null {
  const { cheats, moody } = TRAITS[mind.persona]
  const me = view.seat
  if (cheats === 'never' || me === null || phase.current.length === 0) return null
  const o = order(view)
  const led = o.suitOf(phase.current[0].card)
  const held = phase.hand.filter((c) => o.suitOf(c) === led)
  if (held.length === 0) return null
  const careful = cheats === 'careful'
  const at = situation(phase, view.rules)
  const own = seenPlays(view).filter((p) => p.seat === me)
  const reneges = phase.hand.filter(
    (c) => o.suitOf(c) !== led && hasCard(accepted, c) && brokenRules(phase.hand, excusesFor(c, at, view.rules)).join() === 'followSuit' && !(careful && exposes(c, own)),
  )
  if (reneges.length === 0) return null
  const wins = (c: Card) => wouldWin(view, phase.current, me, c)

  let choice: Cheat | null = null
  let prize = 0
  if (standingNil(phase, me) && wins(honest)) {
    const safe = reneges.filter((c) => !wins(c)).sort((a, b) => o.strength(b) - o.strength(a))
    if (safe.length > 0) {
      choice = { card: safe[0], saves: 'nil' }
      prize = NIL_POINTS
    }
  } else if (!standingNil(phase, me) && standing(view, phase, me).needs > 0 && !wins(honest)) {
    const winning = reneges.filter(wins).sort((a, b) => o.strength(a) - o.strength(b))
    if (winning.length > 0) {
      choice = { card: winning[0], saves: 'trick' }
      prize = TRICK_PRIZE
    }
  }
  if (choice === null) return null

  if (careful) {
    const risk = showUpRisk(view, phase, held.length)
    // Caught, the side is set, or must take three more tricks than it called, which mostly comes to the same.
    const cost = 10 * (phase.contracts[sideOf(me, view.playerCount)] + (view.rules.renege === 'set' ? 0 : RENEGE_TRICKS)) + prize
    return prize >= SLY_PRIZE && (1 - risk) * prize > risk * cost ? choice : null
  }
  // Wild does not weigh the risk, but nor does it renege at every chance: a trick is easier to steal than a Nil to save.
  const chance = choice.saves === 'nil' ? 1 : WILD_TRICK_CHANCE
  if (roll(mind.salt, me, `renege:${phase.tricks.length}`) >= chance) return null
  return prize * (moody ? mood(view) : 1) >= WILD_PRIZE ? choice : null
}

/**
 * Sly's estimate of the chance that some seat notices a renege of a suit it holds `held` of: each watches with
 * the attention Sly assumes until the first of them must come out, which Sly expects only once the rest of its
 * hand is gone.
 */
function showUpRisk(view: View, phase: ViewPlaying, held: number): number {
  const me = view.seat!
  const gap = phase.hand.length - 1 - held
  let unnoticed = 1
  for (const seat of allSeats(view.playerCount)) if (seat !== me) unnoticed *= 1 - noticeOdds(ASSUMED_ATTENTION, gap, 1)
  return 1 - unnoticed
}

/** Leaves out cards that would show up an earlier cheat of one's own, while anything else may be played. */
export function holdBack(view: View, legal: readonly Card[]): readonly Card[] {
  const own = seenPlays(view).filter((p) => p.seat === view.seat)
  const safe = legal.filter((c) => !exposes(c, own))
  return safe.length > 0 ? safe : legal
}
