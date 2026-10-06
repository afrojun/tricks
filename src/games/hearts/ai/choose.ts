/** The hand-written Hearts player. It sees only a seat's view; whether it cheats depends on its persona. */
import { SUITS, type Suit, sameCard } from '../../../kit/cards'
import { type Mind, TRAITS } from '../../../kit/mind'
import { availableActions } from '../engine/available'
import { type Card, JACK_OF_DIAMONDS, QUEEN_OF_SPADES, type Rank, penaltyPoints, strength } from '../engine/cards'
import { isOpeningLead } from '../engine/excuses'
import { PASS_SIZE, PLAYERS } from '../engine/rules'
import type { Action, View, ViewPlaying } from '../engine/types'
import { chooseCheat, holdBack } from './cheat'
import { moonThreat, queenOut, unseen, winningPlay, wouldWin } from './read'
import type { Decision, PassWhy, Reason } from './reasons'

/** With this many spades the queen can hide among them, so she is kept. */
const SPADES_TO_HIDE_QUEEN = 5
/** The most points worth taking to stop a moon. */
const MOON_CHEAP = 4
/** The order in which equal cards are passed. */
const PASS_SUITS: readonly Suit[] = ['hearts', 'spades', 'diamonds', 'clubs']

const isQueen = (c: Card) => sameCard(c, QUEEN_OF_SPADES)
const isTopSpade = (c: Card) => c.suit === 'spades' && strength(c) > strength(QUEEN_OF_SPADES)
const isLowSpade = (c: Card) => c.suit === 'spades' && strength(c) < strength(QUEEN_OF_SPADES)

/** Low to high. A full order, so a choice never depends on the order of the hand. */
const byStrength = (a: Card, b: Card) => strength(a) - strength(b) || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit)
const lowest = (cards: readonly Card[]) => [...cards].sort(byStrength)[0]
const highest = (cards: readonly Card[]) => [...cards].sort(byStrength)[cards.length - 1]

/** The highest card; between equals, the one from the shorter suit in `hand`, towards a void. */
function highestTowardsVoid(cards: readonly Card[], hand: readonly Card[]): Card {
  const length = (suit: Suit) => hand.filter((c) => c.suit === suit).length
  return [...cards].sort((a, b) => strength(b) - strength(a) || length(a.suit) - length(b.suit) || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit))[0]
}

// ── Passing ──────────────────────────────────────────────────────────────

function choosePass(view: View, hand: readonly Card[]): Decision {
  const picks: { card: Card; why: PassWhy }[] = []
  const take = (card: Card | undefined, why: PassWhy) => {
    if (card && picks.length < PASS_SIZE && !picks.some((p) => sameCard(p.card, card))) picks.push({ card, why })
  }
  const find = (suit: Suit, rank: Rank) => hand.find((c) => c.suit === suit && c.rank === rank)
  const keep = (c: Card) => view.rules.jackOfDiamonds && sameCard(c, JACK_OF_DIAMONDS)
  const spades = hand.filter((c) => c.suit === 'spades').length

  if (spades < SPADES_TO_HIDE_QUEEN) {
    take(find('spades', 'Q'), 'queenOfSpades')
    take(find('spades', 'K'), 'highSpade')
    take(find('spades', 'A'), 'highSpade')
  }
  for (const rank of ['A', 'K', 'Q'] as const) take(find('hearts', rank), 'highHeart')
  // A suit of two or fewer clubs or diamonds is emptied when it fits, the shortest first.
  const short = (['clubs', 'diamonds'] as const)
    .map((suit) => hand.filter((c) => c.suit === suit).sort((a, b) => byStrength(b, a)))
    .filter((cards) => cards.length > 0 && cards.length <= 2 && !cards.some(keep))
    .sort((a, b) => a.length - b.length || byStrength(b[0], a[0]))
  for (const cards of short) if (cards.length <= PASS_SIZE - picks.length) cards.forEach((c) => take(c, 'shortSuit'))
  for (const c of highestLeft(view, hand)) take(c, 'highCard')

  return { action: { type: 'choosePass', cards: picks.map((p) => p.card) }, reason: { code: 'pass', picks } }
}

/** The cards this player would pass once its other rules are spent, first to last; never the cards it keeps. */
function highestLeft(view: View, hand: readonly Card[]): Card[] {
  const keep = (c: Card) => view.rules.jackOfDiamonds && sameCard(c, JACK_OF_DIAMONDS)
  const spades = hand.filter((c) => c.suit === 'spades').length
  // Spades below the queen go last: they are what hides her, or what ducks under her.
  const left = hand.filter((c) => !keep(c) && !(isQueen(c) && spades >= SPADES_TO_HIDE_QUEEN))
  const order = (a: Card, b: Card) =>
    Number(isLowSpade(a)) - Number(isLowSpade(b)) || strength(b) - strength(a) || PASS_SUITS.indexOf(a.suit) - PASS_SUITS.indexOf(b.suit)
  return left.sort(order)
}

/**
 * Every card of the hand in the order this player would pass it: its three picks, then the highest cards
 * left, then the cards it keeps, highest first. The search player's pass candidates are built on this order.
 */
export function passOrder(view: View, hand: readonly Card[]): Card[] {
  const action = choosePass(view, hand).action as Extract<Action, { type: 'choosePass' }>
  const rest = hand.filter((c) => !action.cards.some((p) => sameCard(p, c)))
  const left = highestLeft(view, rest)
  const kept = rest.filter((c) => !left.includes(c)).sort((a, b) => byStrength(b, a))
  return [...action.cards, ...left, ...kept]
}

// ── Play ─────────────────────────────────────────────────────────────────

type CardChoice = { card: Card; reason: Reason }
type Plain = Extract<
  Reason,
  {
    code:
      | 'openingLead'
      | 'onlyCard'
      | 'firstTrickHigh'
      | 'fishForQueen'
      | 'leadLeastBad'
      | 'winClean'
      | 'playLow'
      | 'takeJack'
      | 'dumpQueen'
      | 'dumpHighSpade'
      | 'dumpHeart'
      | 'dumpHigh'
  }
>
const as = (code: Plain['code'], card: Card): CardChoice => ({ card, reason: { code, card } })

/** The honest card from among `legal`, and why. */
export function chooseCard(view: View, phase: ViewPlaying, legal: readonly Card[]): CardChoice {
  if (legal.length === 1) return as(isOpeningLead(phase) ? 'openingLead' : 'onlyCard', legal[0])
  return phase.current.length === 0 ? chooseLead(phase, legal) : chooseFollow(view, phase, legal)
}

function chooseLead(phase: ViewPlaying, legal: readonly Card[]): CardChoice {
  const out = unseen(phase)
  const above = (c: Card) => out.filter((o) => o.suit === c.suit && strength(o) > strength(c)).length
  const below = (c: Card) => out.filter((o) => o.suit === c.suit && strength(o) < strength(c)).length
  const queen = queenOut(phase)
  // Draw the queen out with spades that cannot win against her.
  if (queen) {
    const fish = legal.filter(isLowSpade)
    if (fish.length > 0) return as('fishForQueen', lowest(fish))
  }
  // Never the queen, a heart nothing can beat, or a spade that could catch the queen, while anything else is left.
  const risky = (c: Card) => isQueen(c) || (c.suit === 'hearts' && above(c) === 0) || (queen && isTopSpade(c))
  const safe = legal.filter((c) => !risky(c))
  if (safe.length === 0) {
    const order = (c: Card) => (c.suit === 'hearts' ? 0 : isQueen(c) ? 2 : 1)
    return as('leadLeastBad', [...legal].sort((a, b) => order(a) - order(b) || byStrength(a, b))[0])
  }
  // The card least likely to win: the largest share of its suit still out is above it.
  const share = (c: Card) => {
    const total = above(c) + below(c)
    return total === 0 ? 0 : above(c) / total
  }
  const card = [...safe].sort((a, b) => share(b) - share(a) || byStrength(a, b))[0]
  return { card, reason: { code: 'leadLow', card, higher: above(card) } }
}

function chooseFollow(view: View, phase: ViewPlaying, legal: readonly Card[]): CardChoice {
  const me = view.seat!
  const following = legal.filter((c) => c.suit === phase.current[0].card.suit)
  if (following.length === 0) return chooseDiscard(view, phase, legal)
  const onTable = phase.current.map((p) => p.card)
  const points = penaltyPoints(onTable)
  // Safe only while the trick holds no points: a cheat, or a hand of nothing but points, can put one there.
  if (phase.tricks.length === 0 && !view.rules.pointsOnFirstTrick && points === 0) return as('firstTrickHigh', highest(following))

  const last = phase.current.length === PLAYERS - 1
  const winner = winningPlay(phase.current)
  const wins = (c: Card) => wouldWin(phase.current, me, c)

  const shooter = moonThreat(view, phase)
  if (shooter !== null && points > 0 && (winner.seat === shooter || !phase.current.some((p) => p.seat === shooter))) {
    const cheap = following.filter((c) => wins(c) && penaltyPoints([...onTable, c]) <= MOON_CHEAP)
    if (cheap.length > 0) {
      const card = lowest(cheap)
      return { card, reason: { code: 'stopMoon', card, shooter } }
    }
  }

  if (view.rules.jackOfDiamonds && points === 0) {
    const isJack = (c: Card) => sameCard(c, JACK_OF_DIAMONDS)
    const clean = following.filter((c) => wins(c) && penaltyPoints([c]) === 0)
    // Win the jack on the table, as surely as possible while others are still to play.
    if (onTable.some(isJack) && clean.length > 0) return as('takeJack', last ? lowest(clean) : highest(clean))
    const jack = following.find(isJack)
    const beaten = unseen(phase).some((o) => o.suit === JACK_OF_DIAMONDS.suit && strength(o) > strength(JACK_OF_DIAMONDS))
    if (jack && wins(jack) && (last || !beaten)) return as('takeJack', jack)
  }

  const under = following.filter((c) => !wins(c))
  if (under.length > 0) {
    const card = highest(under)
    return { card, reason: { code: 'duck', card, under: winner.card } }
  }
  if (last && points === 0) {
    const clean = following.filter((c) => penaltyPoints([c]) === 0)
    if (clean.length > 0) return as('winClean', highest(clean))
  }
  const kept = following.filter((c) => !isQueen(c))
  return as('playLow', lowest(kept.length > 0 ? kept : following))
}

function chooseDiscard(view: View, phase: ViewPlaying, legal: readonly Card[]): CardChoice {
  const keep = (c: Card) => view.rules.jackOfDiamonds && sameCard(c, JACK_OF_DIAMONDS)
  const queen = legal.find(isQueen)
  if (queen) return as('dumpQueen', queen)
  const top = legal.filter(isTopSpade)
  if (top.length > 0 && queenOut(phase)) return as('dumpHighSpade', highest(top))
  const hearts = legal.filter((c) => c.suit === 'hearts')
  if (hearts.length > 0) return as('dumpHeart', highest(hearts))
  // The jack of diamonds would give whoever takes the trick -10.
  const rest = legal.filter((c) => !keep(c))
  return as('dumpHigh', highestTowardsVoid(rest.length > 0 ? rest : legal, phase.hand))
}

// ── The decision ─────────────────────────────────────────────────────────

/**
 * What this seat does now, and why; null when it has nothing to decide. The
 * honest choice comes first, from cards a careful cheat can play without
 * showing itself up; a cheating persona may then renege instead. Needs a
 * `full` view.
 */
export function decide(view: View, mind: Mind): Decision | null {
  if (view.seat === null) return null
  const can = availableActions(view)
  const phase = view.phase
  if (phase.kind === 'passing') return can.pass.length > 0 ? choosePass(view, can.pass) : null
  if (phase.kind !== 'playing' || can.legal.length === 0) return null
  const careful = TRAITS[mind.persona].cheats === 'careful'
  const honest = chooseCard(view, phase, careful ? holdBack(view, can.legal) : can.legal)
  const cheat = chooseCheat(view, phase, honest.card, mind, can.play, (cards) => chooseDiscard(view, phase, cards).card)
  const choice: CardChoice = cheat ? { card: cheat.card, reason: { code: 'renege', card: cheat.card, honest: honest.card, dodges: cheat.dodges } } : honest
  return { action: { type: 'playCard', card: choice.card }, reason: choice.reason }
}

/** What this seat does now, or null when it has nothing to decide. */
export function chooseAction(view: View, mind: Mind): Action | null {
  return decide(view, mind)?.action ?? null
}

/** The plainest legal action, tried if the chosen one is refused. */
export function fallbackAction(view: View): Action | null {
  const can = availableActions(view)
  if (can.pass.length > 0) return { type: 'choosePass', cards: can.pass.slice(0, PASS_SIZE) }
  if (can.legal.length > 0) return { type: 'playCard', card: can.legal[0] }
  return null
}
