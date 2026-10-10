/**
 * Cheating and catching it. A game describes each rule of play as an excuse:
 * "you may play this only if you hold none of those". From that one
 * description follow a card's legality, the hidden record of the rules a play
 * broke, and the proof a later card gives that an excuse was false.
 */
import { type Mind, TRAITS, roll } from './mind'
import type { Seat } from './table'

/**
 * A play that is legal only if the hand it came from held no card matching
 * `without`. The card that needs the excuse never matches it. Excuses are
 * derived from public state when needed: they hold functions and are never saved.
 */
export interface Excuse<C> {
  /** 'followSuit', 'undercut', 'heartsLead', 'firstTrickPoints'. */
  rule: string
  without: (card: C) => boolean
}

/** A card played, as the engine records it. */
export interface PlayRecord<C> {
  seat: Seat
  card: C
  /** Hidden: the hand the card was played from. */
  handBefore: C[]
  /** Hidden: the rules the play broke; empty for a legal play. */
  broke: string[]
}

/** Whether `hand` shows `excuse` to be false: it holds a card the excuse says it had none of. */
const shownFalse = <C>(excuse: Excuse<C>, hand: readonly C[]) => hand.some((c) => excuse.without(c))

/** The rules whose excuses `handBefore` shows to be false. */
export function brokenRules<C>(handBefore: readonly C[], excuses: readonly Excuse<C>[]): string[] {
  const broke: string[] = []
  for (const e of excuses) if (shownFalse(e, handBefore)) broke.push(e.rule)
  return broke
}

/** The cards of `hand` whose excuses all hold. */
export function legalCards<C>(hand: readonly C[], excusesFor: (card: C) => Excuse<C>[]): C[] {
  return hand.filter((card) => !excusesFor(card).some((e) => shownFalse(e, hand)))
}

/** The record of `card` played from `hand`, judged against the excuses the play needs. */
export function recordPlay<C>(seat: Seat, card: C, hand: readonly C[], excuses: readonly Excuse<C>[]): PlayRecord<C> {
  return { seat, card, handBefore: [...hand], broke: brokenRules(hand, excuses) }
}

/** The verdict on an accusation: the accused seat's first play that broke a rule, or null if none did. */
export function firstCheat<C>(plays: readonly PlayRecord<C>[], accused: Seat): PlayRecord<C> | null {
  return plays.find((p) => p.seat === accused && p.broke.length > 0) ?? null
}

// ── What an observer can prove ───────────────────────────────────────────

/** A play as an observer sees it. `deal` separates hands dealt apart, such as Thunee's two halves. */
export interface SeenPlay<C> {
  seat: Seat
  card: C
  /** The trick's index in the round. */
  trick: number
  deal: number
  excuses: Excuse<C>[]
  /**
   * Already judged by an accusation, in a game where play goes on after one (Spades' "Bid plus three"): never
   * the cheat a proof or a careful cheat looks for, though still a card that shows up a later one.
   */
  settled?: boolean
}

/** A certain sign of cheating. */
export interface Proof {
  /** `<rule>:<seat>:<trick>:<revealing trick>`. Stable, so a proof gets one look: see `roll`. */
  id: string
  accused: Seat
  /** The rule broken, for a play. */
  rule: string | null
  /** The claim disproved, for a declaration. */
  claim: number | null
  /** Tricks between the cheat and the card that shows it up. */
  gap: number
  /** How much the moment stands out; multiplies the chance of noticing. A game raises it from 1. */
  salience: number
}

/**
 * Every excuse a suspect's later card shows to be false: a card from the same
 * deal, played to a later trick, that matches the excuse's `without`. Needs
 * only the public play history, so a computer catches a cheat with the same
 * information a person has. `salience` lets a game weigh each proof by the
 * cheat and the card that shows it up.
 */
export function playProofs<C>(
  plays: readonly SeenPlay<C>[],
  suspect: (seat: Seat) => boolean,
  salience: (cheat: SeenPlay<C>, reveal: SeenPlay<C>) => number = () => 1,
): Proof[] {
  const out: Proof[] = []
  for (const cheat of plays) if (cheat.excuses.length > 0 && !cheat.settled && suspect(cheat.seat)) out.push(...proofsOf(cheat, plays, salience))
  return out
}

/** The proofs against one play of `plays`, as `playProofs` finds them for a suspect. */
export function proofsOf<C>(
  cheat: SeenPlay<C>,
  plays: readonly SeenPlay<C>[],
  salience: (cheat: SeenPlay<C>, reveal: SeenPlay<C>) => number = () => 1,
): Proof[] {
  const out: Proof[] = []
  for (const excuse of cheat.excuses) {
    for (const reveal of plays) {
      if (reveal.seat !== cheat.seat || reveal.deal !== cheat.deal || reveal.trick <= cheat.trick) continue
      if (!excuse.without(reveal.card)) continue
      out.push({
        id: `${excuse.rule}:${cheat.seat}:${cheat.trick}:${reveal.trick}`,
        accused: cheat.seat,
        rule: excuse.rule,
        claim: null,
        gap: reveal.trick - cheat.trick - 1,
        salience: salience(cheat, reveal),
      })
    }
  }
  return out
}

/**
 * Whether playing `card` would prove one of one's own earlier excuses false.
 * `own` is one's own plays from the current deal. A careful cheat holds such a card back.
 */
export function exposes<C>(card: C, own: readonly SeenPlay<C>[]): boolean {
  return own.some((p) => !p.settled && p.excuses.some((e) => e.without(card)))
}

/** The chance of noticing: attention, fading with the tricks in between, raised by salience. */
export function noticeOdds(attention: number, gap: number, salience: number): number {
  return Math.min(1, attention * 0.5 ** (gap / 2) * salience)
}

/** The chance that `held` cards drawn from `hidden` unseen cards include none of `unseen` particular ones. */
export function chanceOfVoid(hidden: number, unseen: number, held: number): number {
  if (unseen === 0) return 1
  if (hidden - unseen < held) return 0
  return choose(hidden - unseen, held) / choose(hidden, held)
}

/** n choose k; exact for the numbers of a card game. */
function choose(n: number, k: number): number {
  let r = 1
  for (let j = 0; j < k; j++) r = (r * (n - j)) / (j + 1)
  return r
}

/** The first proof this mind notices. Each proof's roll never changes, so one missed stays missed. */
export function noticed(proofs: readonly Proof[], mind: Mind, observer: Seat): Proof | null {
  const { attention } = TRAITS[mind.persona]
  return proofs.find((p) => roll(mind.salt, observer, p.id) < noticeOdds(attention, p.gap, p.salience)) ?? null
}
