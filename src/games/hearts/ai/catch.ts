/**
 * How a computer catches a cheat: from a proof, with the same cards a person
 * at the table has seen, or, for the personas that have them, on a hunch.
 */
import { type Suit, sameCard } from '../../../kit/cards'
import { type Proof, type SeenPlay, chanceOfVoid, noticed, proofsOf } from '../../../kit/integrity'
import { type Mind, TRAITS, roll } from '../../../kit/mind'
import type { Seat } from '../../../kit/table'
import { availableActions } from '../engine/available'
import { type Card, QUEEN_OF_SPADES, RANKS, penaltyPoints } from '../engine/cards'
import { seenPlays } from '../engine/excuses'
import { HAND_SIZE, PASS_SIZE, PLAYERS, passTarget } from '../engine/rules'
import type { Action, View, ViewPlay, ViewPlaying } from '../engine/types'
import { history, inPlay, mood, place, winningPlay } from './read'

/** How much more a cheat stands out when it dodged the queen of spades. */
export const QUEEN_DODGE = 1.5
/** ...when what it dodged landed on the observer. */
export const LANDED = 1.2
/** ...when the observer gave the cheat the very card that shows it up. */
export const GIVEN = 1.5

// ── Proofs ───────────────────────────────────────────────────────────────

/**
 * Every proof this observer has that another seat cheated: an excuse shown
 * false by a later card of the same seat (the kit's `proofsOf`), or by a
 * card the observer passed that seat and had not yet seen it play. Needs a
 * `full` view.
 */
export function findProofs(view: View): Proof[] {
  const phase = inPlay(view)
  const me = view.seat
  if (phase === null || me === null) return []
  const plays = seenPlays(view)
  const out: Proof[] = []
  for (const cheat of plays) {
    if (cheat.seat === me || cheat.excuses.length === 0) continue
    const done = cheat.trick < phase.tricks.length ? phase.tricks[cheat.trick] : null
    // A later card comes in a later trick, so the cheat's trick is over and how much it stands out is settled.
    if (done) out.push(...proofsOf(cheat, plays, () => standsOut(done.plays, done.winner, cheat.seat, me)))
    const given = givenProofs(view, phase, plays, cheat)
    if (given.length === 0) continue
    // A passed card proves the cheat as it is played. It is judged on the trick as it stood then, and on later
    // calls on that same prefix, so cards played after it never change its one look.
    const trick = done ? done.plays : phase.current
    const then = trick.slice(0, trick.findIndex((p) => p.seat === cheat.seat) + 1)
    const salience = standsOut(then, winningPlay(then).seat, cheat.seat, null) * GIVEN
    for (const proof of given) out.push({ ...proof, salience })
  }
  return out
}

/**
 * How much a cheat stands out, judged on the cards of its trick and who won
 * them: more when it dodged the queen of spades, more again when what it
 * dodged landed on the observer (only once the trick is over: pass null before).
 */
function standsOut(trick: readonly ViewPlay[], winner: Seat, cheater: Seat, observer: Seat | null): number {
  let salience = 1
  if (winner !== cheater && trick.some((p) => sameCard(p.card, QUEEN_OF_SPADES))) salience *= QUEEN_DODGE
  if (winner === observer && penaltyPoints(trick.map((p) => p.card)) > 0) salience *= LANDED
  return salience
}

/**
 * Proofs from the cards the observer passed: the seat it passed them to held
 * them until it played them, so an excuse one of them matches is false at once.
 */
function givenProofs(view: View, phase: ViewPlaying, plays: readonly SeenPlay<Card>[], cheat: SeenPlay<Card>): Proof[] {
  const direction = view.direction
  if (direction === 'none' || passTarget(view.seat!, direction) !== cheat.seat) return []
  // Only a view that has seen every earlier trick knows which of them were still held.
  if (phase.tricks.slice(0, cheat.trick).some((t) => t.plays.length === 0)) return []
  const held = phase.gave.filter((g) => !plays.some((p) => p.seat === cheat.seat && p.trick < cheat.trick && sameCard(p.card, g)))
  return cheat.excuses
    .filter((e) => held.some((g) => e.without(g)))
    .map((e) => ({ id: `${e.rule}:${cheat.seat}:${cheat.trick}:given`, accused: cheat.seat, rule: e.rule, claim: null, gap: 0, salience: 1 }))
}

// ── Signals and hunches ──────────────────────────────────────────────────

/** Something that looks like cheating but proves nothing. */
export interface Signal {
  id: string
  accused: Seat
  /** The trick it happened in. */
  at: number
}

/** Below this chance of a real void, showing out of a suit is suspicious. */
export const VOID_DOUBT = 0.1

/**
 * What looks like cheating to this observer: showing out of a suit so early
 * that a real void is unlikely (counted once per seat and suit), and throwing
 * a card off suit on a trick that already holds the queen of spades.
 */
export function findSignals(view: View): Signal[] {
  const phase = inPlay(view)
  const me = view.seat
  if (phase === null || me === null) return []
  const tricks = history(phase)
  // What the observer knows as play goes on: its own hand since the exchange and its own plays, the cards it
  // passed, which stay with the seat it passed them to until played, and each card as it is played.
  const known = new Set([...phase.hand, ...phase.gave].map(place))
  for (const t of tricks) for (const p of t.plays) if (p.seat === me) known.add(place(p.card))
  const given = new Set(phase.gave.map(place))
  let stillGiven = given.size
  const shown = new Set<string>()
  const out: Signal[] = []
  for (const t of tricks) {
    const led = t.plays[0].card.suit
    t.plays.forEach((p, i) => {
      const at = place(p.card)
      known.add(at)
      if (given.has(at)) stillGiven--
      if (i === 0 || p.card.suit === led) return
      const first = !shown.has(`${p.seat}:${led}`)
      shown.add(`${p.seat}:${led}`)
      if (p.seat === me) return
      if (t.plays.slice(0, i).some((q) => sameCard(q.card, QUEEN_OF_SPADES))) out.push({ id: `queen:${t.index}:${p.seat}`, accused: p.seat, at: t.index })
      if (first && voidOdds(view, t.index, p.seat, led, known, stillGiven) < VOID_DOUBT) out.push({ id: `void:${t.index}:${p.seat}`, accused: p.seat, at: t.index })
    })
  }
  return out
}

/**
 * The chance, as the observer saw it just after `seat` showed out of `led` in
 * trick `trick`, that it truly held none of the suit. Uses only what was known
 * then: the cards in `known`, by place, and how many of the cards the observer
 * passed that seat were still unplayed. After a pass a hand is not a random
 * draw: its owner chose three cards to give away, and may have emptied the
 * suit with them.
 */
function voidOdds(view: View, trick: number, seat: Seat, led: Suit, known: ReadonlySet<number>, stillGiven: number): number {
  const direction = view.direction
  const held = HAND_SIZE - trick - 1 - (direction !== 'none' && passTarget(view.seat!, direction) === seat ? stillGiven : 0)
  const unseen = RANKS.filter((rank) => !known.has(place({ suit: led, rank }))).length
  const hidden = HAND_SIZE * PLAYERS - known.size
  if (direction === 'none') return chanceOfVoid(hidden, unseen, held)
  return chanceOfFew(hidden, unseen, held + PASS_SIZE, PASS_SIZE)
}

/** The chance that `drawn` cards from `hidden` include at most `most` of `unseen` particular ones. */
function chanceOfFew(hidden: number, unseen: number, drawn: number, most: number): number {
  const n = Math.min(drawn, hidden)
  let p = 0
  for (let k = 0; k <= Math.min(most, unseen, n); k++) p += (choose(unseen, k) * choose(hidden - unseen, n - k)) / choose(hidden, n)
  return Math.min(1, p)
}

/** n choose k; exact for the numbers of a card game. */
function choose(n: number, k: number): number {
  let r = 1
  for (let j = 0; j < k; j++) r = (r * (n - j)) / (j + 1)
  return r
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
    // Judged in the mood of its moment, so a signal gets the same one look whenever it is weighed.
    const chance = traits.hunchChance * (traits.moody ? mood(view, latest.at) : 1)
    if (roll(mind.salt, me, `hunch:${latest.id}`) < chance) return { type: 'challengePlay', seat }
  }
  return null
}

/**
 * The accusation this computer makes now, if any. Each proof gets one look,
 * with the attention of the persona: the roll for it never changes, so a proof
 * missed once stays missed. Personas that act on hunches then weigh the
 * signals. Needs a `full` view.
 */
export function chooseChallenge(view: View, mind: Mind): Action | null {
  const me = view.seat
  if (me === null) return null
  const can = availableActions(view)
  if (can.challengePlay.length === 0) return null
  const proof = noticed(findProofs(view).filter((p) => can.challengePlay.includes(p.accused)), mind, me)
  if (proof !== null) return { type: 'challengePlay', seat: proof.accused }
  return hunch(view, mind, can.challengePlay)
}
