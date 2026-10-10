/**
 * Dealing the cards a seat cannot see (rule 3): hard constraints first, never broken; then soft evidence, kept
 * while it can hold. Every deal that keeps the constraints is equally likely: cards that may go to the same places
 * are grouped, deals are counted exactly, and each group's share of every place is drawn by those counts.
 */
import { type Card, sameCard, shuffle } from '../cards'
import type { Constraint, Knowledge, World } from './types'

export interface Sampler<C extends Card> {
  /** Soft evidence the deals keep. */
  kept: Constraint<C>[]
  /** Soft evidence dropped because it could not hold with the hard constraints and the rest. */
  dropped: Constraint<C>[]
  /** One deal of the hidden cards. */
  sample(rng: () => number): World<C>
}

/**
 * A sampler for what a seat knows. Drops soft evidence newest first, preferring a piece whose loss lets the
 * rest hold, until a deal exists. Throws only when the hard constraints cannot hold, which no real view gives.
 */
export function prepare<C extends Card>(knowledge: Knowledge<C>): Sampler<C> {
  const { hidden, sizes, hard } = knowledge
  if (sizes.reduce((a, b) => a + b, 0) !== hidden.length) throw new Error(`sample: ${hidden.length} hidden cards for places of ${sizes}`)
  const kept = [...knowledge.soft]
  const dropped: Constraint<C>[] = []
  let deals = new Deals(hidden, sizes, [...hard, ...kept])
  if (!deals.possible()) {
    if (!new Deals(hidden, sizes, hard).possible()) throw new Error('sample: the hard constraints cannot all hold')
    while (!deals.possible()) {
      let drop = kept.length - 1
      for (let i = kept.length - 1; i >= 0; i--) {
        if (new Deals(hidden, sizes, [...hard, ...kept.filter((_, j) => j !== i)]).possible()) {
          drop = i
          break
        }
      }
      dropped.push(...kept.splice(drop, 1))
      deals = new Deals(hidden, sizes, [...hard, ...kept])
    }
  }
  const sampler = deals
  return { kept, dropped, sample: (rng) => sampler.sample(rng) }
}

/** Cards that may go to the same places and count towards the same "at least one" constraints. */
interface Group {
  /** Bit p: the cards may lie in place p. */
  places: number
  /** Bit j: the cards match the j-th "at least one" constraint. */
  counts: number
  cards: number[]
}

/** The ways a group may be split, each with the number of deals that follow it. */
interface Share {
  total: number
  options: { split: number[]; ways: number }[]
}

/** Every deal of the hidden cards that keeps a set of constraints, counted exactly by groups. */
class Deals<C extends Card> {
  private groups: Group[] = []
  /** For each "at least one" constraint, the places it names. */
  private some: number[] = []
  private memo = new Map<number | string, Share>()
  private factorial: number[] = [1]
  /** One more than any place can hold: the base the memo's keys write the room left in. */
  private radix: number
  /** Whether every memo key fits in a number exactly; if not, as with many "at least one" constraints, keys are strings. */
  private exact = false

  constructor(
    private hidden: readonly C[],
    private sizes: readonly number[],
    constraints: readonly Constraint<C>[],
  ) {
    this.radix = hidden.length + 1
    const all = (1 << sizes.length) - 1
    const allowed = hidden.map(() => all)
    const counts = hidden.map(() => 0)
    for (const c of constraints) {
      if (c.kind === 'holds') {
        const i = hidden.findIndex((h) => sameCard(h, c.card))
        if (i === -1) throw new Error(`sample: ${c.why} names a card that is not hidden`)
        allowed[i] &= 1 << c.place
      } else if (c.kind === 'none') {
        hidden.forEach((card, i) => {
          if (c.of(card)) allowed[i] &= ~(1 << c.place)
        })
      } else {
        const bit = 1 << this.some.length
        this.some.push(c.places.reduce((m, p) => m | (1 << p), 0))
        hidden.forEach((card, i) => {
          if (c.of(card)) counts[i] |= bit
        })
      }
    }
    const byKey = new Map<number, Group>()
    hidden.forEach((_, i) => {
      const key = counts[i] * (all + 1) + allowed[i]
      const group = byKey.get(key) ?? { places: allowed[i], counts: counts[i], cards: [] }
      group.cards.push(i)
      byKey.set(key, group)
    })
    this.groups = [...byKey.values()]
    this.exact = 2 ** this.some.length * this.groups.length * this.radix ** sizes.length <= Number.MAX_SAFE_INTEGER
    for (let n = 1; n <= hidden.length; n++) this.factorial[n] = this.factorial[n - 1] * n
  }

  possible(): boolean {
    return this.count(0, [...this.sizes], 0) > 0
  }

  sample(rng: () => number): World<C> {
    const places: C[][] = this.sizes.map(() => [])
    let room = [...this.sizes]
    let met = 0
    this.groups.forEach((group, g) => {
      const { total, options } = this.share(g, room, met)
      let pick = rng() * total
      const { split } = options.find((o) => (pick -= o.ways) < 0) ?? options[options.length - 1]
      const cards = shuffle(group.cards, rng)
      split.forEach((n, p) => places[p].push(...cards.splice(0, n).map((i) => this.hidden[i])))
      met = this.after(group, split, met)
      room = room.map((r, p) => r - split[p])
    })
    return places.map((cards) => shuffle(cards, rng))
  }

  /** Deals of groups `g` onwards into `room`, given the "at least one" constraints already met. */
  private count(g: number, room: number[], met: number): number {
    if (g === this.groups.length) return room.every((r) => r === 0) && met === (1 << this.some.length) - 1 ? 1 : 0
    return this.share(g, room, met).total
  }

  /** How group `g` may be split, with the deals that follow each split; worked out once and kept for every world. */
  private share(g: number, room: number[], met: number): Share {
    const key = this.key(g, room, met)
    const known = this.memo.get(key)
    if (known !== undefined) return known
    const group = this.groups[g]
    const options = this.splits(group, room)
      .map((split) => ({ split, ways: this.ways(group, split, g, room, met) }))
      .filter((o) => o.ways > 0)
    const share = { total: options.reduce((sum, o) => sum + o.ways, 0), options }
    this.memo.set(key, share)
    return share
  }

  /** The memo's key for a share: a number, written in base `radix`, while that is exact. */
  private key(g: number, room: readonly number[], met: number): number | string {
    if (!this.exact) return `${met} ${g} ${room.join(' ')}`
    let key = met * this.groups.length + g
    for (const r of room) key = key * this.radix + r
    return key
  }

  /** Deals in which group `g` is split as `split`, with the groups after it dealt every way they can be. */
  private ways(group: Group, split: number[], g: number, room: number[], met: number): number {
    const rest = this.count(
      g + 1,
      room.map((r, p) => r - split[p]),
      this.after(group, split, met),
    )
    return rest === 0 ? 0 : (this.factorial[group.cards.length] / split.reduce((d, n) => d * this.factorial[n], 1)) * rest
  }

  /** The "at least one" constraints met once a group is split as `split`. */
  private after(group: Group, split: number[], met: number): number {
    let out = met
    this.some.forEach((places, j) => {
      if (group.counts & (1 << j) && split.some((n, p) => n > 0 && places & (1 << p))) out |= 1 << j
    })
    return out
  }

  /** Every way to share a group's cards among the places it may go to, within the room left. */
  private splits(group: Group, room: readonly number[]): number[][] {
    const out: number[][] = []
    const split = room.map(() => 0)
    const fill = (p: number, left: number) => {
      if (p >= room.length - 1) {
        // The last place takes whatever is left, if it may.
        if (left === 0 || (p === room.length - 1 && group.places & (1 << p) && left <= room[p])) {
          if (p === room.length - 1) split[p] = left
          out.push([...split])
        }
        return
      }
      const most = group.places & (1 << p) ? Math.min(left, room[p]) : 0
      for (let n = 0; n <= most; n++) {
        split[p] = n
        fill(p + 1, left - n)
      }
      split[p] = 0
    }
    fill(0, group.cards.length)
    return out
  }
}
