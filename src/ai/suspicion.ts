/** What a computer player can prove about its opponents' play, from its own full view. */
import {
  type Action,
  type Card,
  type Seat,
  type View,
  type ViewPlaying,
  availableActions,
  cardId,
  pointsOf,
  rankStrength,
  sameCard,
  teamOf,
} from '../engine'
import { type Mind, TRAITS, roll } from './mind'
import { type TrickRecord, history } from './read'

/** A certain sign of cheating: a renege or undercut shown up by a later card, or an impossible Jodhi. */
export interface Proof {
  id: string
  accused: Seat
  /** The Jodhi claim it disproves, or null for a play. */
  claim: number | null
  /** Tricks between the cheat and the moment it was shown up. */
  gap: number
  /** How much the moment stands out; multiplies the chance of noticing. */
  salience: number
}

interface Reveal {
  trick: TrickRecord
  card: Card
}

export const inPlay = (view: View): ViewPlaying | null =>
  view.phase.kind === 'playing' || view.phase.kind === 'trickPause' ? view.phase : null

/** The chance of noticing: attention, fading with the tricks in between, raised by salience. */
export function noticeOdds(attention: number, gap: number, salience: number): number {
  return Math.min(1, attention * 0.5 ** (gap / 2) * salience)
}

export function findProofs(view: View): Proof[] {
  const phase = inPlay(view)
  const me = view.seat
  if (phase === null || me === null) return []
  const opponent = (s: Seat) => teamOf(s) !== teamOf(me)
  const tricks = history(phase)
  const out: Proof[] = []

  for (const t of tricks) {
    const led = t.plays[0].card.suit
    t.plays.forEach((p, i) => {
      if (i === 0 || !opponent(p.seat) || p.card.suit === led) return
      // A void shown in `led`: any later card of that suit this half proves a renege.
      for (const r of laterPlays(tricks, t, p.seat, (c) => c.suit === led)) {
        out.push(playProof(`renege:${p.seat}:${t.index}:${r.trick.index}`, p.seat, t, r, me))
      }
      const trump = phase.trump
      if (!view.rules.undercutRestriction || trump === null || led === trump || p.card.suit !== trump) return
      const topTrump = Math.max(0, ...t.plays.slice(0, i).filter((q) => q.card.suit === trump).map((q) => rankStrength(q.card.rank)))
      if (topTrump <= rankStrength(p.card.rank)) return
      // An undercut is only allowed with nothing but trumps: a later plain card proves otherwise.
      for (const r of laterPlays(tricks, t, p.seat, (c) => c.suit !== trump)) {
        out.push(playProof(`undercut:${p.seat}:${t.index}:${r.trick.index}`, p.seat, t, r, me))
      }
    })
  }

  phase.jodhiClaims.forEach((claim, index) => {
    if (!opponent(claim.seat)) return
    const ranks: Card['rank'][] = claim.withJack ? ['K', 'Q', 'J'] : ['K', 'Q']
    for (const rank of ranks) {
      const card: Card = { suit: claim.suit, rank }
      const id = `jodhi:${index}:${cardId(card)}`
      if (phase.hand.some((c) => sameCard(c, card))) {
        out.push({ id, accused: claim.seat, claim: index, gap: 0, salience: 1.5 })
        continue
      }
      const elsewhere = (t: TrickRecord) =>
        t.plays.some((p) => sameCard(p.card, card) && (p.seat !== claim.seat || (view.rules.jodhiCards === 'inHand' && t.index < claim.trick)))
      const shown = tricks.find(elsewhere)
      if (shown) out.push({ id, accused: claim.seat, claim: index, gap: Math.max(0, shown.index - claim.trick), salience: 1 })
    }
  })
  return out
}

function laterPlays(tricks: TrickRecord[], after: TrickRecord, seat: Seat, matches: (c: Card) => boolean): Reveal[] {
  return tricks
    .filter((t) => t.index > after.index && t.half === after.half)
    .flatMap((t) => t.plays.filter((p) => p.seat === seat && matches(p.card)).map((p) => ({ trick: t, card: p.card })))
}

function playProof(id: string, accused: Seat, cheat: TrickRecord, reveal: Reveal, me: Seat): Proof {
  let salience = 1
  if (cheat.winner === accused) salience *= 1.3
  if (cheat.winner !== null && pointsOf(cheat.plays.map((p) => p.card)) >= 30) salience *= 1.3
  if (reveal.card.rank === 'J' || reveal.card.rank === '9') salience *= 1.2
  if (teamOf(cheat.plays[0].seat) === teamOf(me)) salience *= 1.2
  return { id, accused, claim: null, gap: reveal.trick.index - cheat.index - 1, salience }
}

/**
 * The challenge this computer makes now, if any. Each proof gets one look:
 * the roll for it never changes, so a proof missed once stays missed.
 */
export function chooseChallenge(view: View, mind: Mind): Action | null {
  const me = view.seat
  if (me === null || inPlay(view) === null) return null
  const can = availableActions(view)
  const accuse = (accused: Seat, claim: number | null): Action | null => {
    if (claim !== null) return can.challengeJodhi.includes(claim) ? { type: 'challengeJodhi', claim } : null
    return can.challengePlay.includes(accused) ? { type: 'challengePlay', seat: accused } : null
  }
  const { attention } = TRAITS[mind.persona]
  for (const proof of findProofs(view)) {
    if (roll(mind.salt, me, proof.id) >= noticeOdds(attention, proof.gap, proof.salience)) continue
    const action = accuse(proof.accused, proof.claim)
    if (action) return action
  }
  return null
}
