/**
 * How a computer catches a cheat: from a proof, with the same cards a person at the table has seen, or, for the
 * personas that have them, on a hunch. Never its own partner: an accusation that lands costs its own side.
 */
import { type Proof, chanceOfVoid, noticed, playProofs } from '../../../kit/integrity'
import { type Mind, TRAITS, roll } from '../../../kit/mind'
import type { Seat } from '../../../kit/table'
import { availableActions } from '../engine/available'
import { createDeck, place } from '../engine/cards'
import { seenPlays } from '../engine/excuses'
import { handSize, sideOf } from '../engine/rules'
import type { Action, View } from '../engine/types'
import { inPlay, mood, order } from './read'

/** How much more a cheat stands out when it saved a Nil. */
export const NIL_SAVE = 1.5

/** Every proof this observer has that an opponent cheated, from the plays it has seen. Needs a `full` view. */
export function findProofs(view: View): Proof[] {
  const phase = inPlay(view)
  const me = view.seat
  if (phase === null || me === null) return []
  const mine = sideOf(me, view.playerCount)
  return playProofs(
    seenPlays(view),
    (seat) => sideOf(seat, view.playerCount) !== mine,
    (cheat) => (phase.calls[cheat.seat].tricks === 0 ? NIL_SAVE : 1),
  )
}

/** Something that looks like cheating but proves nothing. */
export interface Signal {
  id: string
  accused: Seat
  at: number
}

/** Below this chance of a real void, showing out of a suit is suspicious; a Nil showing out, below three times it. */
export const VOID_DOUBT = 0.1

/**
 * What looks like cheating to this observer: an opponent showing out of a suit so early that a real void is
 * unlikely, judged on what the observer knew then, so a signal never comes and goes as play goes on.
 */
export function findSignals(view: View): Signal[] {
  const phase = inPlay(view)
  const me = view.seat
  if (phase === null || me === null) return []
  const o = order(view)
  const mine = sideOf(me, view.playerCount)
  const size = handSize(view.playerCount)
  const deck = createDeck(view.rules.jokers)
  const tricks = [...phase.tricks.map((t, index) => ({ index, plays: t.plays })), { index: phase.tricks.length, plays: phase.current }].filter((t) => t.plays.length > 0)
  // What the observer knew from the start: the hand it held, which is its hand now and every card it played, and its discards.
  const known = new Set([...phase.hand, ...phase.discards].map(place))
  for (const t of tricks) for (const p of t.plays) if (p.seat === me) known.add(place(p.card))
  const out: Signal[] = []
  const shown = new Set<string>()
  for (const t of tricks) {
    const led = o.suitOf(t.plays[0].card)
    t.plays.forEach((p, i) => {
      known.add(place(p.card))
      if (i === 0 || o.suitOf(p.card) === led || sideOf(p.seat, view.playerCount) === mine) return
      if (shown.has(`${p.seat}:${led}`)) return
      shown.add(`${p.seat}:${led}`)
      const unplaced = deck.filter((c) => !known.has(place(c)))
      const odds = chanceOfVoid(unplaced.length, unplaced.filter((c) => o.suitOf(c) === led).length, size - t.index - 1)
      const doubt = phase.calls[p.seat].tricks === 0 ? VOID_DOUBT * 3 : VOID_DOUBT
      if (odds < doubt) out.push({ id: `void:${t.index}:${p.seat}`, accused: p.seat, at: t.index })
    })
  }
  return out
}

/** A hunch gets one look per new signal, once a seat has drawn enough of them. */
function hunch(view: View, mind: Mind, accusable: readonly Seat[]): Action | null {
  const traits = TRAITS[mind.persona]
  const me = view.seat
  if (traits.hunchAt === null || me === null) return null
  const bySeat = new Map<Seat, Signal[]>()
  for (const s of findSignals(view)) bySeat.set(s.accused, [...(bySeat.get(s.accused) ?? []), s])
  for (const [seat, signals] of bySeat) {
    if (signals.length < traits.hunchAt || !accusable.includes(seat)) continue
    const latest = signals[signals.length - 1]
    const chance = traits.hunchChance * (traits.moody ? mood(view) : 1)
    if (roll(mind.salt, me, `hunch:${latest.id}`) < chance) return { type: 'challengePlay', seat }
  }
  return null
}

/**
 * The accusation this computer makes now, if any. Each proof gets one look, with the attention of the persona:
 * the roll for it never changes, so a proof missed once stays missed. Personas that act on hunches then weigh
 * the signals. Never a partner. Needs a `full` view.
 */
export function chooseChallenge(view: View, mind: Mind): Action | null {
  const me = view.seat
  if (me === null) return null
  const mine = sideOf(me, view.playerCount)
  const accusable = availableActions(view).challengePlay.filter((s) => sideOf(s, view.playerCount) !== mine)
  if (accusable.length === 0) return null
  const proof = noticed(findProofs(view).filter((p) => accusable.includes(p.accused)), mind, me)
  if (proof !== null) return { type: 'challengePlay', seat: proof.accused }
  return hunch(view, mind, accusable)
}
