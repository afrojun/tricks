/** The hand-written Spades player. It sees only a seat's view; whether it cheats depends on its persona. */
import { SUITS, type Suit } from '../../../kit/cards'
import { type Mind, TRAITS, roll } from '../../../kit/mind'
import type { Seat } from '../../../kit/table'
import { availableActions } from '../engine/available'
import { type Card, TRUMP, createDeck } from '../engine/cards'
import { forcedCard } from '../engine/excuses'
import { EXCHANGE_SIZE, handSize, sideOf } from '../engine/rules'
import type { Action, View, ViewCalling, ViewPlaying } from '../engine/types'
import { chooseCheat, holdBack } from './cheat'
import { inPlay, isBoss, opponentNeeds, order, partner, standing, standingNil, unseen, winningPlay, wouldWin } from './read'
import type { Count, Decision, Reason } from './reasons'

/** Blind nil only this far behind, and then not always. */
const BLIND_NIL_BEHIND = 200
const BLIND_NIL_CHANCE = 0.3
/** A partnership trims its second call when the two would reach this many. */
const TOO_MANY = 11
/** A side suit this long rarely wins its ace. */
const LONG_SUIT = 6

type Order = ReturnType<typeof order>

/** A full order of cards, low to high, so a choice never depends on the order of the hand. */
function byStrength(o: Order) {
  return (a: Card, b: Card) => o.strength(a) - o.strength(b) || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit)
}
const first = (cards: readonly Card[], compare: (a: Card, b: Card) => number) => cards.reduce((a, b) => (compare(b, a) < 0 ? b : a))
const lowest = (o: Order, cards: readonly Card[]) => first(cards, byStrength(o))
const highest = (o: Order, cards: readonly Card[]) => first(cards, (a, b) => byStrength(o)(b, a))

// ── Drawing ──────────────────────────────────────────────────────────────

/** Keep a spade, an ace, or a king with another card of its suit; otherwise take the next card blind. */
function chooseDraw(view: View, top: Card, hand: readonly Card[]): Decision {
  const o = order(view)
  const suit = o.suitOf(top)
  const keep = suit === TRUMP || top.rank === 'A' || (top.rank === 'K' && hand.some((c) => o.suitOf(c) === suit))
  return { action: { type: 'draw', keep }, reason: keep ? { code: 'keep', card: top } : { code: 'pass', card: top } }
}

// ── Calling ──────────────────────────────────────────────────────────────

/** What a hand is worth in tricks, by the spec's count. */
export function countTricks(view: Pick<View, 'rules' | 'playerCount'>, hand: readonly Card[]): Count {
  const o = order(view)
  const deckTrumps = createDeck(view.rules.jokers)
    .filter((c) => o.suitOf(c) === TRUMP)
    .sort((a, b) => o.strength(b) - o.strength(a))
  const spades = hand.filter((c) => o.suitOf(c) === TRUMP)
  // A high spade counts when held with enough others to guard it: the top one alone, the next with one more.
  let honours = 0
  let topThree = 0
  for (const c of spades) {
    const rank = deckTrumps.findIndex((t) => t.suit === c.suit && t.rank === c.rank)
    if (spades.length > rank) {
      honours++
      if (rank < 3) topThree++
    }
  }
  const spadeTricks = Math.max(honours, topThree + Math.max(0, spades.length - 3))
  // With fewer players, fewer cards fall to each trick, and a king or a queen wins more often.
  const few = view.playerCount < 4
  let sides = 0
  let ruffs = 0
  let spare = spades.length - spadeTricks
  for (const suit of SUITS) {
    if (suit === TRUMP) continue
    const cards = hand.filter((c) => o.suitOf(c) === suit)
    if (cards.some((c) => c.rank === 'A')) sides += cards.length >= LONG_SUIT ? 0.5 : 1
    if (cards.some((c) => c.rank === 'K') && cards.length >= 2) sides += few ? 1 : 0.5
    if (few && cards.some((c) => c.rank === 'Q') && cards.length >= 3) sides += 0.5
    if (cards.length <= 1 && spare > 0) {
      ruffs++
      spare--
    }
  }
  return { spades: spadeTricks, sides, ruffs, total: spadeTricks + sides + ruffs }
}

/** A hand for Nil: no ace or king of spades, at most three spades none above the nine, and a low card in every side suit. */
export function nilHand(view: Pick<View, 'rules' | 'playerCount'>, hand: readonly Card[]): boolean {
  const o = order(view)
  const nine = o.strength({ suit: 'spades', rank: '9' })
  const six = o.strength({ suit: 'clubs', rank: '6' })
  const spades = hand.filter((c) => o.suitOf(c) === TRUMP)
  // Seventeen cards with three hold too many to slip under every trick.
  if (view.playerCount === 3) return false
  if (spades.length > 3 || spades.some((c) => o.strength(c) > nine)) return false
  if (countTricks(view, hand).total >= 1) return false
  return SUITS.filter((s) => s !== TRUMP).every((suit) => {
    const cards = hand.filter((c) => o.suitOf(c) === suit)
    return cards.length === 0 || cards.some((c) => o.strength(c) < six)
  })
}

function chooseCall(view: View, phase: ViewCalling, me: Seat, calls: readonly number[]): Decision {
  const mate = partner(view, me)
  const mateCall = mate === null ? null : phase.calls[mate]
  if (calls.includes(0) && nilHand(view, phase.hand) && mateCall?.tricks !== 0) return { action: { type: 'call', tricks: 0 }, reason: { code: 'nil' } }
  const count = countTricks(view, phase.hand)
  // Rounded down, but to the nearest with three, whose long hands the count undervalues.
  let tricks = Math.max(1, view.playerCount === 3 ? Math.round(count.total) : Math.floor(count.total))
  let trimmed = false
  if (mateCall !== null && mateCall !== undefined && mateCall.tricks + tricks >= TOO_MANY) {
    tricks = Math.max(1, tricks - 1)
    trimmed = true
  }
  tricks = Math.min(tricks, handSize(view.playerCount))
  return { action: { type: 'call', tricks }, reason: { code: 'call', tricks, count, trimmed } }
}

/** How far the viewer's side trails the side nearest it, or 0. */
function behind(view: View, me: Seat): number {
  const mine = view.scores[sideOf(me, view.playerCount)]
  const others = view.scores.filter((_, side) => side !== sideOf(me, view.playerCount))
  return Math.max(0, Math.min(...others) - mine)
}

// ── The exchange ─────────────────────────────────────────────────────────

function chooseGive(view: View, me: Seat, hand: readonly Card[]): Decision {
  const o = order(view)
  const phase = view.phase
  const blind = phase.kind === 'exchanging' && phase.exchange.blind === me
  // The Blind nil player gives its most dangerous cards; its partner gives back low ones.
  const sorted = [...hand].sort(byStrength(o))
  const cards = blind ? sorted.slice(-EXCHANGE_SIZE).reverse() : sorted.filter((c) => o.suitOf(c) !== TRUMP).slice(0, EXCHANGE_SIZE)
  const picked = cards.length === EXCHANGE_SIZE ? cards : sorted.slice(0, EXCHANGE_SIZE)
  return { action: { type: 'giveCards', cards: picked }, reason: blind ? { code: 'giveHigh', cards: picked } : { code: 'giveLow', cards: picked } }
}

// ── Play ─────────────────────────────────────────────────────────────────

type CardChoice = { card: Card; reason: Reason }
type Plain = Exclude<Reason, { code: 'keep' | 'pass' | 'look' | 'call' | 'nil' | 'blindNil' | 'giveHigh' | 'giveLow' | 'leadAtNil' | 'underNil' | 'renege' }>
const as = (code: Plain['code'], card: Card): CardChoice => ({ card, reason: { code, card } as Reason })

/** The honest card from among `legal`, and why. */
export function chooseCard(view: View, phase: ViewPlaying, legal: readonly Card[]): CardChoice {
  const me = view.seat!
  if (forcedCard(phase.hand, phase, view.rules, view.playerCount) !== null) return as('openingLead', legal[0])
  if (legal.length === 1) return as('onlyCard', legal[0])
  if (standingNil(phase, me)) return phase.current.length === 0 ? nilLead(view, legal) : nilFollow(view, phase, legal)
  return phase.current.length === 0 ? chooseLead(view, phase, legal) : chooseFollow(view, phase, legal)
}

/** Whether the viewer's side should take tricks now: its contract is not made, or an opponent can still be set. */
function wantsTricks(view: View, phase: ViewPlaying, me: Seat): boolean {
  const { needs, left } = standing(view, phase, me)
  if (needs > 0) return true
  // Set an opponent that needs nearly every trick left.
  return opponentNeeds(view, phase, me).some((n) => n > 0 && n >= left - 1)
}

function chooseLead(view: View, phase: ViewPlaying, legal: readonly Card[]): CardChoice {
  const me = view.seat!
  const o = order(view)
  const mate = partner(view, me)
  const sides = legal.filter((c) => o.suitOf(c) !== TRUMP)
  if (mate !== null && standingNil(phase, mate)) {
    const bosses = legal.filter((c) => isBoss(view, phase, c))
    return as('leadForNil', highest(o, bosses.length > 0 ? bosses : legal))
  }
  const nil = opponentsOf(view, me).find((s) => standingNil(phase, s))
  if (nil !== undefined) {
    const low = lowest(o, sides.length > 0 ? sides : legal)
    return { card: low, reason: { code: 'leadAtNil', card: low, nil } }
  }
  if (!wantsTricks(view, phase, me)) {
    // Least likely to win: the lowest card of the suit with the most still out above it.
    const out = unseen(view, phase)
    const above = (c: Card) => out.filter((x) => o.suitOf(x) === o.suitOf(c) && o.strength(x) > o.strength(c)).length
    return as('leadLow', first(legal, (a, b) => above(b) - above(a) || byStrength(o)(a, b)))
  }
  const bosses = sides.filter((c) => isBoss(view, phase, c))
  if (bosses.length > 0) return as('leadBoss', highest(o, bosses))
  const spades = legal.filter((c) => o.suitOf(c) === TRUMP)
  const spadesOut = unseen(view, phase).filter((c) => o.suitOf(c) === TRUMP).length
  if (spades.length > 0 && spades.length >= spadesOut && spadesOut > 0) return as('drawTrumps', highest(o, spades))
  if (sides.length > 0) {
    const length = (suit: Suit) => phase.hand.filter((c) => o.suitOf(c) === suit).length
    const longest = first(sides, (a, b) => length(o.suitOf(b)) - length(o.suitOf(a)) || byStrength(o)(a, b))
    return as('leadLong', lowest(o, sides.filter((c) => o.suitOf(c) === o.suitOf(longest))))
  }
  return as('leadLong', lowest(o, legal))
}

function chooseFollow(view: View, phase: ViewPlaying, legal: readonly Card[]): CardChoice {
  const me = view.seat!
  const o = order(view)
  const led = o.suitOf(phase.current[0].card)
  const following = legal.filter((c) => o.suitOf(c) === led)
  const wins = (c: Card) => wouldWin(view, phase.current, me, c)
  const winners = legal.filter(wins)
  const losers = legal.filter((c) => !wins(c))
  const winner = winningPlay(view, phase.current)
  const mate = partner(view, me)
  const last = phase.current.length === view.playerCount - 1

  // The partner's Nil: take the trick over it, or play high so it can play under.
  if (mate !== null && standingNil(phase, mate)) {
    const mateIn = phase.current.some((p) => p.seat === mate)
    if (mateIn && winner.seat === mate && winners.length > 0) return as('coverNil', lowest(o, winners))
    if (!mateIn && winners.length > 0) return as('coverNil', highest(o, winners))
  }
  // An opponent's Nil winning the trick: leave it there.
  if (standingNil(phase, winner.seat) && !sameSide(view, winner.seat, me) && losers.length > 0) {
    const card = highest(o, losers)
    return { card, reason: { code: 'underNil', card, nil: winner.seat } }
  }
  const wanted = wantsTricks(view, phase, me)
  if (mate !== null && winner.seat === mate && (last || isBoss(view, phase, winner.card))) return discardOrLow(view, phase, legal, following, 'partnerWinning')
  if (wanted && winners.length > 0) {
    const card = lowest(o, winners)
    return as(o.suitOf(card) === TRUMP && led !== TRUMP ? 'trump' : 'winCheap', card)
  }
  if (!wanted && losers.length > 0) {
    if (following.length === 0) return discardOrLow(view, phase, losers, [], 'throwLow')
    return as('duck', highest(o, losers))
  }
  return discardOrLow(view, phase, legal, following, 'playLow')
}

/** The lowest card of the suit led, or void, the lowest of the shortest side suit. */
function discardOrLow(view: View, phase: ViewPlaying, legal: readonly Card[], following: readonly Card[], code: 'partnerWinning' | 'playLow' | 'throwLow'): CardChoice {
  const o = order(view)
  if (following.length > 0) return as(code, lowest(o, following))
  const sides = legal.filter((c) => o.suitOf(c) !== TRUMP)
  if (sides.length === 0) return as(code, lowest(o, legal))
  const length = (suit: Suit) => phase.hand.filter((c) => o.suitOf(c) === suit).length
  const card = first(sides, (a, b) => length(o.suitOf(a)) - length(o.suitOf(b)) || byStrength(o)(a, b))
  return as(code === 'playLow' ? 'throwLow' : code, card)
}

function nilLead(view: View, legal: readonly Card[]): CardChoice {
  const o = order(view)
  const sides = legal.filter((c) => o.suitOf(c) !== TRUMP)
  return as('nilLead', lowest(o, sides.length > 0 ? sides : legal))
}

function nilFollow(view: View, phase: ViewPlaying, legal: readonly Card[]): CardChoice {
  const me = view.seat!
  const o = order(view)
  const led = o.suitOf(phase.current[0].card)
  const losers = legal.filter((c) => !wouldWin(view, phase.current, me, c))
  // Every card wins: the Nil is broken whatever is played, so the lowest.
  if (losers.length === 0) return as('playLow', lowest(o, legal))
  if (losers.some((c) => o.suitOf(c) === led)) return as('nilDuck', highest(o, losers.filter((c) => o.suitOf(c) === led)))
  // Void: rid the hand of what could win later, spades first.
  const spades = losers.filter((c) => o.suitOf(c) === TRUMP)
  return as('nilDump', highest(o, spades.length > 0 ? spades : losers))
}

const sameSide = (view: View, a: Seat, b: Seat) => sideOf(a, view.playerCount) === sideOf(b, view.playerCount)
const opponentsOf = (view: View, me: Seat) => view.seats.map((_, s) => s).filter((s) => !sameSide(view, s, me))

// ── The decision ─────────────────────────────────────────────────────────

/**
 * What this seat does now, and why; null when it has nothing to decide. The honest choice comes first, from
 * cards a careful cheat can play without showing itself up; a cheating persona may then renege instead. Needs
 * a `full` view.
 */
export function decide(view: View, mind: Mind): Decision | null {
  const me = view.seat
  if (me === null) return null
  const can = availableActions(view)
  const phase = view.phase
  if (phase.kind === 'drawing') return can.draw && phase.top !== null ? chooseDraw(view, phase.top, phase.hand) : null
  if (phase.kind === 'calling') {
    if (can.blindNil) {
      const down = behind(view, me)
      if (down >= BLIND_NIL_BEHIND && roll(mind.salt, me, 'blindNil') < BLIND_NIL_CHANCE) return { action: { type: 'callBlindNil' }, reason: { code: 'blindNil', behind: down } }
    }
    if (can.look && phase.turn === me) return { action: { type: 'lookAtHand' }, reason: { code: 'look' } }
    return can.calls.length > 0 ? chooseCall(view, phase, me, can.calls) : null
  }
  if (phase.kind === 'exchanging') return can.give.length > 0 ? chooseGive(view, me, can.give) : null
  const playing = inPlay(view)
  if (playing === null || playing.kind !== 'playing' || can.legal.length === 0) return null
  const careful = TRAITS[mind.persona].cheats === 'careful'
  const honest = chooseCard(view, playing, careful ? holdBack(view, can.legal) : can.legal)
  const cheat = chooseCheat(view, playing, honest.card, mind, can.play)
  const choice: CardChoice = cheat ? { card: cheat.card, reason: { code: 'renege', card: cheat.card, honest: honest.card, saves: cheat.saves } } : honest
  return { action: { type: 'playCard', card: choice.card }, reason: choice.reason }
}

/** What this seat does now, or null when it has nothing to decide. */
export function chooseAction(view: View, mind: Mind): Action | null {
  return decide(view, mind)?.action ?? null
}

/** The plainest legal action, tried if the chosen one is refused. */
export function fallbackAction(view: View): Action | null {
  const can = availableActions(view)
  if (can.draw) return { type: 'draw', keep: true }
  if (can.look) return { type: 'lookAtHand' }
  if (can.calls.length > 0) return { type: 'call', tricks: can.calls.includes(1) ? 1 : can.calls[0] }
  if (can.give.length > 0) return { type: 'giveCards', cards: can.give.slice(0, EXCHANGE_SIZE) }
  if (can.legal.length > 0) return { type: 'playCard', card: can.legal[0] }
  return null
}
