/**
 * Hearts for the kit's search player (section 5 of the search-player spec): what a seat knows of the cards it
 * cannot see, the candidates, and the decision's name, all from a `full` view and a mind. The imagined games it
 * plays out, rebuilt from that view and one dealing of the hidden cards, are `imagine.ts`'s.
 */
import { SUITS, cardId, hasCard } from '../../../kit/cards'
import type { Mind } from '../../../kit/mind'
import { type SearchResult, search } from '../../../kit/search/search'
import type { Constraint, Knowledge } from '../../../kit/search/types'
import type { Seat } from '../../../kit/table'
import { availableActions } from '../engine/available'
import { type Card, TWO_OF_CLUBS, createDeck, strength, trickPoints } from '../engine/cards'
import { seenPlays } from '../engine/excuses'
import { PASS_SIZE, passTarget } from '../engine/rules'
import type { Action, View } from '../engine/types'
import { chooseCard, passOrder } from './choose'
import { fullPlay, imagined, othersThan } from './imagine'
import { unseen } from './read'

/** Worlds per decision, as the gate measured it. */
export const WORLDS = 30
/** The most passes searched: the hand-written player's and its nearest neighbours. */
export const PASSES = 8

/** Low to high in a fixed order of suits, so a list of cards never depends on the order of the hand. */
const canonical = (a: Card, b: Card) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || strength(a) - strength(b)

// ── What a seat knows ────────────────────────────────────────────────────

/**
 * Known: the viewer's hand, every card played, and the cards it passed, which the receiver holds until it
 * plays them. Hidden: the other hands, of the sizes the view shows. Each other seat's plays say what its hand
 * held none of (a card off the suit led: none of that suit), which is hard with cheating off and soft with it
 * on; a seat whose own later card, or a card passed to it, shows one of those to be false is a cheat, and none
 * of its evidence is kept.
 */
export function knowledge(view: View): Knowledge<Card> {
  const me = view.seat
  if (me === null) throw new Error('search: a spectator decides nothing')
  const places = othersThan(me)
  const phase = view.phase
  if (phase.kind === 'passing') {
    return { hidden: createDeck().filter((c) => !hasCard(phase.hand, c)), sizes: places.map((s) => phase.handCounts[s]), hard: [], soft: [] }
  }
  const play = fullPlay(view)
  const seen = seenPlays(view)
  const hidden = unseen(play)
  const hard: Constraint<Card>[] = []
  // Before the first card, the seat to lead is the one holding the two of clubs.
  if (hasCard(hidden, TWO_OF_CLUBS) && play.turn !== null) hard.push({ kind: 'holds', place: places.indexOf(play.turn), card: TWO_OF_CLUBS, why: 'leads 2-clubs' })
  if (view.direction !== 'none') {
    const to = passTarget(me, view.direction)
    for (const card of play.gave) if (hasCard(hidden, card)) hard.push({ kind: 'holds', place: places.indexOf(to), card, why: `gave ${cardId(card)}` })
  }
  const evidence: Extract<Constraint<Card>, { kind: 'none' }>[] = []
  const cheats = new Set<Seat>()
  seen.forEach((p, i) => {
    if (p.seat === me) return
    for (const excuse of p.excuses) {
      const later = seen.slice(i + 1).some((q) => q.seat === p.seat && excuse.without(q.card))
      const given = hard.some((k) => k.kind === 'holds' && places[k.place] === p.seat && excuse.without(k.card))
      if (later || given) cheats.add(p.seat)
      evidence.push({ kind: 'none', place: places.indexOf(p.seat), of: excuse.without, why: `${excuse.rule}:${p.seat}:${p.trick}` })
    }
  })
  if (!view.rules.allowCheating) return { hidden, sizes: places.map((s) => play.handCounts[s]), hard: [...hard, ...evidence], soft: [] }
  const soft = evidence.filter((k) => !cheats.has(places[k.place]))
  return { hidden, sizes: places.map((s) => play.handCounts[s]), hard, soft }
}

// ── Candidates ───────────────────────────────────────────────────────────

/**
 * The passes searched: the hand-written player's, then each that swaps one of its three for the next card in
 * its order, its least wanted pick first, up to eight in all.
 */
export function passCandidates(view: View, hand: readonly Card[]): Card[][] {
  const order = passOrder(view, hand)
  const picks = order.slice(0, PASS_SIZE)
  const swaps = order.slice(PASS_SIZE).flatMap((extra) => [2, 1, 0].map((i) => picks.map((c, j) => (j === i ? extra : c))))
  return [picks, ...swaps].slice(0, PASSES)
}

/**
 * In play, the legal cards, one of each set that play alike: cards of one suit with no card between them that
 * they could still meet, neither one still out nor one on the table now, and worth the same to whoever takes
 * them (each heart one point, any other card none, the queen of spades and a counting jack of diamonds alone).
 * They win and lose against the same cards, now and later, so either gives the same deals. The hand-written
 * player's choice comes first, standing for its set, so that it wins a tie; the rest are the lowest of their
 * sets, in a fixed order. `among` narrows the cards, as a careful cheat holds back one that would show it up.
 */
export function candidates(view: View, among?: readonly Card[]): Action[] {
  if (view.seat === null) return []
  const can = availableActions(view)
  if (can.pass.length > 0) return passCandidates(view, can.pass).map((cards) => ({ type: 'choosePass', cards }))
  const phase = view.phase
  if (phase.kind !== 'playing' || can.legal.length === 0) return []
  const legal = among ?? can.legal
  const first = chooseCard(view, phase, legal).card
  // The cards a card played now could still meet: those still out, and those on the table.
  const meets = [...unseen(phase), ...phase.current.map((p) => p.card)]
  const worth = (c: Card) => trickPoints([c], view.rules)
  const between = (o: Card, a: Card, b: Card) =>
    o.suit === a.suit && strength(o) > Math.min(strength(a), strength(b)) && strength(o) < Math.max(strength(a), strength(b))
  const alike = (a: Card, b: Card) => a.suit === b.suit && worth(a) === worth(b) && !meets.some((o) => between(o, a, b))
  const kept: Card[] = [first]
  for (const card of [...legal].sort(canonical)) if (!kept.some((k) => alike(k, card))) kept.push(card)
  return kept.map((card) => ({ type: 'playCard', card }))
}

/** The round, then the pass or the trick and the cards on the table. */
export function decisionId(view: View): string {
  const phase = view.phase
  if (phase.kind === 'passing') return `${view.roundNumber}:pass`
  const play = fullPlay(view)
  return `${view.roundNumber}:${play.tricks.length}:${play.current.map((p) => cardId(p.card)).join(',')}`
}

/** Hearts' `SearchGame`: the decision's side from the view, the imagined games' from `imagine.ts`. */
export const heartsSearch = {
  ...imagined,
  knowledge,
  candidates: (view: View) => candidates(view),
  decisionId,
  worlds: WORLDS,
  trick: (view: View) => (view.phase.kind === 'playing' ? view.phase.tricks.length : null),
}

/**
 * The search's honest choice for the seat whose `full` view this is, with its results; null when the seat
 * has nothing to decide. `among` narrows the cards it may play; `worlds` replaces the default.
 */
export function searchHearts(view: View, mind: Mind, options: { among?: readonly Card[]; worlds?: number } = {}): SearchResult<Action, Card> | null {
  const game = { ...heartsSearch, worlds: options.worlds ?? WORLDS, candidates: (v: View) => candidates(v, options.among) }
  return search(game, view, mind)
}
