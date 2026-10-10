/** What a computer player can prove about its opponents' play, from its own full view. */
import { type Proof, type SeenPlay, chanceOfVoid, noticed, playProofs } from '../../../kit/integrity'
import { type Mind, TRAITS, roll } from '../../../kit/mind'
import { type Action, type Card, type Seat, type Suit, type View, type ViewPlaying, RANKS, SUITS, availableActions, cardId, pointsOf, sameCard, seenPlays, teamOf } from '../engine'
import { type TrickRecord, history, mood, place } from './read'

export const inPlay = (view: View): ViewPlaying | null =>
  view.phase.kind === 'playing' || view.phase.kind === 'trickPause' ? view.phase : null

/**
 * Certain signs of cheating: a renege or undercut shown up by a later card (the
 * kit's proofs from Thunee's excuses), or an impossible Jodhi.
 */
export function findProofs(view: View): Proof[] {
  const phase = inPlay(view)
  const me = view.seat
  if (phase === null || me === null) return []
  const opponent = (s: Seat) => teamOf(s) !== teamOf(me)
  const tricks = history(phase)
  const trickAt = (index: number) => tricks.find((t) => t.index === index)!
  const salience = (cheat: SeenPlay<Card>, reveal: SeenPlay<Card>) => playSalience(trickAt(cheat.trick), cheat.seat, reveal.card, me)
  const out = playProofs(seenPlays(view), opponent, salience)

  phase.jodhiClaims.forEach((claim, index) => {
    if (!opponent(claim.seat)) return
    // The half the claim was made in: a claim always follows a won trick.
    const claimHalf = phase.tricks[claim.trick - 1]?.half ?? 1
    const ranks: Card['rank'][] = claim.withJack ? ['K', 'Q', 'J'] : ['K', 'Q']
    // The suit is not said: 40 or more is trump, less is any other suit. The claim is false only if no suit it could be fits.
    const suits = claim.suit !== null ? [claim.suit] : SUITS.filter((s) => (claim.points >= 40) === (s === phase.trump))
    const disproofs = suits.map((suit) => {
      let best: { id: string; gap: number; salience: number } | null = null
      for (const rank of ranks) {
        const card: Card = { suit, rank }
        const id = `jodhi:${index}:${cardId(card)}`
        if (phase.hand.some((c) => sameCard(c, card))) return { id, gap: 0, salience: 1.5 }
        const elsewhere = (t: TrickRecord) =>
          t.plays.some((p) => sameCard(p.card, card) && (p.seat !== claim.seat || (t.index < claim.trick && (view.rules.jodhiCards === 'inHand' || t.half < claimHalf))))
        const shown = tricks.find(elsewhere)
        const gap = shown ? Math.max(0, shown.index - claim.trick) : null
        if (gap !== null && (best === null || gap < best.gap)) best = { id, gap, salience: 1 }
      }
      return best
    })
    if (suits.length === 0 || disproofs.some((d) => d === null)) return
    // Proven once the last possible suit is ruled out.
    const last = disproofs.reduce((a, b) => (b!.gap > a!.gap ? b : a))!
    out.push({ id: last.id, accused: claim.seat, rule: null, claim: index, gap: last.gap, salience: last.salience })
  })

  const thunee = sixOfASuitThunee(view, phase, tricks)
  if (thunee) out.push({ id: `thunee:${thunee.caller}:${thunee.suit}`, accused: thunee.caller, rule: null, claim: null, gap: 0, salience: 1.5 })
  return out
}

/**
 * A Thunee called with six cards of one suit, as the cards prove it: the caller has played all six. A suit
 * the others seem to lack proves nothing, since a partner may hide a card by not following.
 */
function sixOfASuitThunee(view: View, phase: ViewPlaying, tricks: TrickRecord[]): { caller: Seat; suit: Suit } | null {
  const me = view.seat!
  const caller = phase.thunee?.caller
  if (caller === undefined || teamOf(caller) === teamOf(me)) return null
  const own = tricks.filter((t) => t.half === phase.half).flatMap((t) => t.plays.filter((p) => p.seat === caller).map((p) => p.card))
  return own.length === 6 && own.every((c) => c.suit === own[0].suit) ? { caller, suit: own[0].suit } : null
}

/** A cheat stands out more when it won the trick, won a rich one, was shown up by a high card, or robbed the observer's side. */
function playSalience(cheat: TrickRecord, accused: Seat, reveal: Card, me: Seat): number {
  let salience = 1
  if (cheat.winner === accused) salience *= 1.3
  if (cheat.winner !== null && pointsOf(cheat.plays.map((p) => p.card)) >= 30) salience *= 1.3
  if (reveal.rank === 'J' || reveal.rank === '9') salience *= 1.2
  if (teamOf(cheat.plays[0].seat) === teamOf(me)) salience *= 1.2
  return salience
}

/** Something that looks like cheating but proves nothing. */
export interface Signal {
  id: string
  accused: Seat
  claim: number | null
  /** When it happened, in tricks; a claim sits between the tricks around it. */
  at: number
}

export function findSignals(view: View): Signal[] {
  const phase = inPlay(view)
  const me = view.seat
  if (phase === null || me === null) return []
  const opponent = (s: Seat) => teamOf(s) !== teamOf(me)
  const tricks = history(phase)
  const out: Signal[] = []
  for (const t of tricks) {
    const led = t.plays[0].card.suit
    t.plays.forEach((p, i) => {
      if (i === 0 || p.card.suit === led || !opponent(p.seat)) return
      if (t.winner === p.seat && pointsOf(t.plays.map((q) => q.card)) >= 30) out.push({ id: `cut:${t.index}`, accused: p.seat, claim: null, at: t.index })
      // Dated during its trick (claim t-0.5 < void t-0.25 < cut t), so its mood never counts the trick's own points,
      // whether or not the trick has finished.
      if (voidOdds(phase, tricks, me, t, i) < VOID_DOUBT) out.push({ id: `void:${t.index}:${p.seat}`, accused: p.seat, claim: null, at: t.index - 0.25 })
    })
  }
  phase.jodhiClaims.forEach((c, index) => {
    if (opponent(c.seat) && c.points >= 40) out.push({ id: `claim:${index}`, accused: c.seat, claim: index, at: c.trick - 0.5 })
  })
  return out
}

/** Just above the chance of a genuine void at the first trick with four unseen cards (0.208), so early tricks flag as the old 4-unplaced rule did. */
export const VOID_DOUBT = 0.21

/**
 * The chance, as the observer saw it just after play `i` of trick `t`, that its player truly held none of the led suit.
 * Uses only what was known then: the observer's own cards for that half, earlier tricks, and trick `t` up to play `i`.
 */
function voidOdds(phase: ViewPlaying, tricks: TrickRecord[], me: Seat, t: TrickRecord, i: number): number {
  const known = new Set<number>()
  if (phase.half === t.half) for (const c of phase.hand) known.add(place(c))
  for (const r of tricks) {
    r.plays.forEach((p, j) => {
      if ((p.seat === me && r.half === t.half) || r.index < t.index || (r.index === t.index && j <= i)) known.add(place(p.card))
    })
  }
  const led = t.plays[0].card.suit
  const unseen = RANKS.filter((rank) => !known.has(place({ suit: led, rank }))).length
  const done = tricks.filter((r) => r.half === t.half && r.index < t.index).length
  return chanceOfVoid(24 - known.size, unseen, 6 - done - 1)
}

/** A hunch gets one look per new signal, once a seat has drawn enough of them. */
function hunch(view: View, mind: Mind, accuse: (accused: Seat, claim: number | null) => Action | null): Action | null {
  const traits = TRAITS[mind.persona]
  if (traits.hunchAt === null || view.seat === null) return null
  const bySeat = new Map<Seat, Signal[]>()
  for (const s of findSignals(view)) bySeat.set(s.accused, [...(bySeat.get(s.accused) ?? []), s])
  for (const [seat, signals] of bySeat) {
    if (signals.length < traits.hunchAt) continue
    const latest = signals.reduce((a, b) => (b.at > a.at ? b : a))
    // Judged in the mood of the moment, so a signal gets the same one look whenever it is weighed.
    const chance = traits.hunchChance * (traits.moody ? mood(view, latest.at) : 1)
    if (roll(mind.salt, view.seat, `hunch:${latest.id}`) >= chance) continue
    const action = accuse(seat, latest.claim)
    if (action) return action
  }
  return null
}

/**
 * The challenge this computer makes now, if any. Each proof gets one look:
 * the roll for it never changes, so a proof missed once stays missed.
 */
export function chooseChallenge(view: View, mind: Mind): Action | null {
  const me = view.seat
  if (me === null || inPlay(view) === null) return null
  const can = availableActions(view)
  // With nobody to accuse, as when cheating is off, nothing it finds can come to anything.
  if (can.challengePlay.length === 0 && can.challengeJodhi.length === 0 && !can.challengeThunee) return null
  const accuse = (accused: Seat, claim: number | null, id = ''): Action | null => {
    if (id.startsWith('thunee:')) return can.challengeThunee ? { type: 'challengeThunee' } : null
    if (claim !== null) return can.challengeJodhi.includes(claim) ? { type: 'challengeJodhi', claim } : null
    return can.challengePlay.includes(accused) ? { type: 'challengePlay', seat: accused } : null
  }
  // Only proofs it may act on: one it notices but cannot accuse over does not hide a later one.
  const proof = noticed(findProofs(view).filter((p) => accuse(p.accused, p.claim, p.id) !== null), mind, me)
  return proof !== null ? accuse(proof.accused, proof.claim, proof.id) : hunch(view, mind, accuse)
}
