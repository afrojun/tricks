/**
 * What a seat knows about the cards it cannot see, and dealing them at random
 * in a way that respects it. Shown voids and Jodhi claims are soft: a later
 * play that contradicts one drops it, and so does a set that cannot all hold.
 */
import { type Card, type Seat, type Suit, type View, type ViewPlay, SUITS, cardId, createDeck, teamOf } from '../../engine'
import type { World } from './rebuild'
import { seenCards } from './rebuild'

export interface Dropped {
  seat: Seat
  kind: 'void' | 'claim' | 'infeasible'
  suit: Suit
}

export interface Knowledge {
  me: Seat
  playerCount: number
  /** Cards whose place is unknown. */
  unknown: Card[]
  /** Places for them: seats 0..n-1, then the stock at index n. */
  capacity: number[]
  voids: Set<Suit>[]
  /** Cards a place must hold (from Jodhi claims). */
  forced: Card[][]
  trumpHidden: boolean
  trumper: Seat
  /** Whether a deal with no trump in the counting team would have been redealt. */
  countingHoldsTrump: boolean
  myHand: Card[]
  dropped: Dropped[]
}

interface Shown {
  seat: Seat
  suit: Suit
  /** The trick it was shown in; later shows are dropped first. */
  at: number
}

export function knowledge(view: View): Knowledge {
  const phase = view.phase
  if ((phase.kind !== 'playing' && phase.kind !== 'trickPause') || view.seat === null) throw new Error('knowledge: card play only')
  const me = view.seat
  const n = view.playerCount
  const seen = seenCards(view)
  const unknown = createDeck().filter((c) => !seen.has(cardId(c)))
  const capacity = Array.from({ length: n + 1 }, (_, s) => (s < n && s !== me ? phase.handCounts[s] : 0))
  capacity[n] = unknown.length - capacity.reduce((a, b) => a + b, 0)
  const dropped: Dropped[] = []

  // Tricks of this half with their index; the current trick last.
  const tricks: { index: number; plays: ViewPlay[] }[] = [
    ...phase.tricks.flatMap((t, index) => (t.half === phase.half ? [{ index, plays: t.plays }] : [])),
    ...(phase.current.length > 0 ? [{ index: phase.tricks.length, plays: phase.current }] : []),
  ]
  const playedLater = (seat: Seat, after: number, suit: Suit) =>
    tricks.some((t) => t.index > after && t.plays.some((p) => p.seat === seat && p.card.suit === suit))

  // Shown voids.
  let shown: Shown[] = []
  for (const t of tricks) {
    const led = t.plays[0].card.suit
    for (const p of t.plays.slice(1)) {
      if (p.seat === me || p.card.suit === led || shown.some((s) => s.seat === p.seat && s.suit === led)) continue
      if (playedLater(p.seat, t.index, led)) dropped.push({ seat: p.seat, kind: 'void', suit: led })
      else shown.push({ seat: p.seat, suit: led, at: t.index })
    }
  }

  // Jodhi claims made this half: the claimed cards not yet played must still be in the claimant's hand.
  const forced: Card[][] = capacity.map(() => [])
  const placeOf = new Map<string, Seat | 'mine'>()
  for (const c of phase.hand) placeOf.set(cardId(c), 'mine')
  phase.tricks.forEach((t, index) => t.plays.forEach((p) => placeOf.set(cardId(p.card), index * 10 + p.seat)))
  phase.current.forEach((p) => placeOf.set(cardId(p.card), phase.tricks.length * 10 + p.seat))
  const claimedBy = new Map<string, Seat>()
  for (const j of phase.jodhiClaims) {
    const half = phase.tricks[j.trick - 1]?.half ?? 1
    if (j.seat === me || half !== phase.half) continue
    const ranks: Card['rank'][] = j.withJack ? ['K', 'Q', 'J'] : ['K', 'Q']
    const cards = ranks.map((rank): Card => ({ suit: j.suit, rank }))
    const contradicted = cards.some((c) => {
      const at = placeOf.get(cardId(c))
      if (at === 'mine' || claimedBy.has(cardId(c))) return true
      if (at === undefined) return shown.some((s) => s.seat === j.seat && s.suit === j.suit)
      const [trick, seat] = [Math.floor(at / 10), at % 10]
      return seat !== j.seat || (view.rules.jodhiCards === 'inHand' && trick < j.trick)
    })
    const unplayed = cards.filter((c) => placeOf.get(cardId(c)) === undefined)
    if (contradicted || forced[j.seat].length + unplayed.length > capacity[j.seat]) {
      dropped.push({ seat: j.seat, kind: 'claim', suit: j.suit })
      continue
    }
    for (const c of unplayed) {
      forced[j.seat].push(c)
      claimedBy.set(cardId(c), j.seat)
    }
  }

  // Shown voids that cannot all hold together: drop the most recent until a deal exists.
  const voids = () => capacity.map((_, s) => new Set(shown.filter((v) => v.seat === s).map((v) => v.suit)))
  const free = unknown.filter((c) => !claimedBy.has(cardId(c)))
  const room = capacity.map((c, s) => c - forced[s].length)
  for (;;) {
    const bad = hallViolation(free, room, voids())
    if (bad === null) break
    const blocked = (s: Seat) => [...bad].every((suit) => shown.some((v) => v.seat === s && v.suit === suit))
    const culprit = shown.filter((v) => bad.has(v.suit) && room[v.seat] > 0 && blocked(v.seat)).sort((a, b) => b.at - a.at)[0]
    // Cannot happen: a violated set always leaves a seat with room that is void in all of it.
    if (culprit === undefined) throw new Error('knowledge: no deal and no void to drop')
    dropped.push({ seat: culprit.seat, kind: 'infeasible', suit: culprit.suit })
    shown = shown.filter((v) => v !== culprit)
  }

  return {
    me,
    playerCount: n,
    unknown,
    capacity,
    voids: voids(),
    forced,
    trumpHidden: !phase.trumpRevealed && phase.thunee === null && me !== phase.trumper,
    trumper: phase.trumper,
    countingHoldsTrump: view.rules.redealIfNoTrumps && n === 4,
    myHand: phase.hand,
    dropped,
  }
}

/** A set of suits whose cards cannot fit in the places allowed to hold them, or null if a deal exists (Hall's condition). */
function hallViolation(cards: readonly Card[], room: readonly number[], voids: readonly Set<Suit>[]): Set<Suit> | null {
  const count = SUITS.map((s) => cards.filter((c) => c.suit === s).length)
  for (let mask = 1; mask < 16; mask++) {
    const suits = SUITS.filter((_, i) => mask & (1 << i))
    const need = suits.reduce((a, s) => a + count[SUITS.indexOf(s)], 0)
    if (need === 0) continue
    const have = room.reduce((a, r, p) => a + (suits.some((s) => !voids[p].has(s)) ? r : 0), 0)
    if (need > have) return new Set(suits)
  }
  return null
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

export const sampleStats = { worlds: 0, fallbacks: 0 }

const REJECTION_TRIES = 30

/** A random deal of the unknown cards that respects `k`. Never fails: `knowledge` keeps the constraints satisfiable. */
export function sampleWorld(k: Knowledge, rng: () => number): World {
  sampleStats.worlds++
  const n = k.playerCount
  const free = k.unknown.filter((c) => !k.forced.some((f) => f.some((x) => cardId(x) === cardId(c))))
  const room = k.capacity.map((c, p) => c - k.forced[p].length)
  let places: Card[][] | null = null

  // Uniform among deals that respect the voids: deal at random and reject.
  for (let attempt = 0; attempt < REJECTION_TRIES && places === null; attempt++) {
    const deck = shuffle([...free], rng)
    const out = room.map((r) => deck.splice(0, r))
    if (out.every((cards, p) => cards.every((c) => !k.voids[p].has(c.suit)))) places = out
  }
  // Card by card, never into a place that would leave the rest without a deal.
  if (places === null) {
    sampleStats.fallbacks++
    places = room.map(() => [])
    const left = [...room]
    const rest = shuffle([...free], rng)
    while (rest.length > 0) {
      const card = rest.pop()!
      const options = left.flatMap((r, p) => (r > 0 && !k.voids[p].has(card.suit) ? [p] : []))
      for (;;) {
        const total = options.reduce((a, p) => a + left[p], 0)
        let pick = rng() * total
        const p = options.find((q) => (pick -= left[q]) < 0) ?? options[options.length - 1]
        left[p]--
        if (hallViolation(rest, left, k.voids) === null) {
          places[p].push(card)
          break
        }
        left[p]++
        options.splice(options.indexOf(p), 1)
        if (options.length === 0) throw new Error('sampleWorld: no deal')
      }
    }
  }

  const hands = Array.from({ length: n }, (_, s) => (s === k.me ? [...k.myHand] : shuffle([...k.forced[s], ...places![s]], rng)))
  const stock = shuffle([...k.forced[n], ...places[n]], rng)
  let trump: Suit | null = null
  if (k.trumpHidden) {
    const held = (s: Seat, suit: Suit) => hands[s].some((c) => c.suit === suit)
    const counting = hands.map((_, s) => s).filter((s) => teamOf(s) !== teamOf(k.trumper))
    const fits = SUITS.filter((suit) => held(k.trumper, suit) && (!k.countingHoldsTrump || counting.some((s) => held(s, suit))))
    const choices = fits.length > 0 ? fits : SUITS.filter((suit) => held(k.trumper, suit))
    trump = choices[Math.floor(rng() * choices.length)]
  }
  return { hands, stock, trump }
}
