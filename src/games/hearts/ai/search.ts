/**
 * Hearts for the kit's search player (section 5 of the search-player spec): what a seat knows of the cards it
 * cannot see, a game rebuilt from its view and one dealing of them, the candidates, and a round's value. Decides
 * from a `full` view and a mind; `rebuild` is the one place a game is made, an imagined one.
 */
import { SUITS, cardId, hasCard } from '../../../kit/cards'
import { brokenRules } from '../../../kit/integrity'
import type { Mind } from '../../../kit/mind'
import { type SearchResult, search } from '../../../kit/search/search'
import type { Constraint, Knowledge, SearchGame, World } from '../../../kit/search/types'
import { type Seat, allSeats, isAiControlled } from '../../../kit/table'
import { nextDeadline, seatsToAct, step } from '../engine/apply'
import { availableActions } from '../engine/available'
import { type Card, TWO_OF_CLUBS, createDeck, strength, trickPoints } from '../engine/cards'
import { legalPlays, seenPlays } from '../engine/excuses'
import { PASS_SIZE, PLAYERS, type PassDirection, passTarget } from '../engine/rules'
import { type Action, FORMAT_VERSION, type Game, type PlayRecord, type View, type ViewPlaying } from '../engine/types'
import { chooseCard, passOrder } from './choose'
import { unseen } from './read'

/** Worlds per decision, as the gate measured it. */
export const WORLDS = 30
/** The most passes searched: the hand-written player's and its nearest neighbours. */
export const PASSES = 8

/** The seats other than the viewer, in order: the sampler's places. */
const othersThan = (me: Seat) => allSeats(PLAYERS).filter((s) => s !== me)

/** Low to high in a fixed order of suits, so a list of cards never depends on the order of the hand. */
const canonical = (a: Card, b: Card) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || strength(a) - strength(b)

const playing = (view: View): ViewPlaying => {
  const phase = view.phase
  if (phase.kind !== 'playing' && phase.kind !== 'trickPause') throw new Error(`search: nothing to search in ${phase.kind}`)
  if (phase.tricks.some((t) => t.plays.length === 0)) throw new Error('search: needs a full view')
  return phase
}

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
  const play = playing(view)
  const seen = seenPlays(view)
  const played = seen.map((p) => p.card)
  const hidden = createDeck().filter((c) => !hasCard(play.hand, c) && !hasCard(played, c))
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

// ── An imagined game ─────────────────────────────────────────────────────

/**
 * The game as it would be if the hidden cards lay as `world` deals them: the inverse of `viewFor` with full
 * memory. Seats, scores and rules as the view shows them; other seats' locked passes are the first cards of
 * their sampled hands; what other seats gave each other, which no rule reads in play, is drawn from what the
 * receiver held; `aiSalt` is zero.
 */
export function rebuild(view: View, world: World<Card>): Game {
  const me = view.seat!
  const places = othersThan(me)
  const own = view.phase.kind === 'passing' || view.phase.kind === 'playing' || view.phase.kind === 'trickPause' ? view.phase.hand : []
  const hands = allSeats(PLAYERS).map((s) => (s === me ? [...own] : [...world[places.indexOf(s)]]))
  const game: Game = {
    formatVersion: FORMAT_VERSION,
    playerCount: view.playerCount,
    seats: view.seats.map((s) => ({ ...s, persona: s.persona ?? 'straight' })),
    host: view.owner,
    waiting: view.waiting.map((w) => ({ ...w })),
    aiActAt: null,
    aiSalt: 0,
    rules: view.rules,
    scores: [...view.scores],
    roundNumber: view.roundNumber,
    phase: { kind: 'lobby' },
  }
  const phase = view.phase
  if (phase.kind === 'passing') {
    const chosen = allSeats(PLAYERS).map((s) => {
      if (s === me) return phase.choice && [...phase.choice]
      return phase.chosen.includes(s) ? hands[s].slice(0, PASS_SIZE) : null
    })
    game.phase = { kind: 'passing', hands, direction: view.direction as Exclude<PassDirection, 'none'>, chosen }
  } else {
    const play = playing(view)
    const seen = seenPlays(view)
    // Each play's hand: what the seat holds now, and every card it played from then on.
    const held = hands.map((h) => [...h])
    const records: PlayRecord[] = []
    for (let i = seen.length - 1; i >= 0; i--) {
      const { seat, card, excuses } = seen[i]
      held[seat] = [card, ...held[seat]]
      records[i] = { seat, card, handBefore: [...held[seat]], broke: brokenRules(held[seat], excuses) }
    }
    const tricks = play.tricks.map((t, i) => ({ plays: records.slice(i * PLAYERS, (i + 1) * PLAYERS), winner: t.winner }))
    const current = records.slice(play.tricks.length * PLAYERS)
    const { received, gave } = exchange(view, me, held)
    const round = { hands, tricks, current, heartsBroken: play.heartsBroken, received, gave }
    game.phase = play.kind === 'playing' ? { kind: 'playing', play: round, turn: play.turn! } : { kind: 'trickPause', play: round, deadline: play.deadline! }
  }
  game.aiActAt = seatsToAct(game).some((s) => isAiControlled(game, s)) ? 0 : null
  return game
}

/** The cards each seat gave and received: the viewer's own from its view, the rest from what receivers held. */
function exchange(view: View, me: Seat, dealt: readonly Card[][]): { received: Card[][]; gave: Card[][] } {
  const empty = () => allSeats(PLAYERS).map((): Card[] => [])
  if (view.direction === 'none' || view.phase.kind === 'passing') return { received: empty(), gave: empty() }
  const direction = view.direction
  const phase = playing(view)
  const gave = empty()
  const received = empty()
  for (const from of allSeats(PLAYERS)) {
    const to = passTarget(from, direction)
    gave[from] = from === me ? [...phase.gave] : to === me ? [...phase.received] : dealt[to].slice(0, PASS_SIZE)
    received[to] = [...gave[from]]
  }
  return { received, gave }
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

/** A random legal action for a seat to act in an imagined game: three cards to pass, or a card. */
export function rollout(game: Game, seat: Seat, rng: () => number): Action {
  const phase = game.phase
  if (phase.kind === 'passing') {
    const cards = [...phase.hands[seat]]
    for (let i = 0; i < PASS_SIZE; i++) {
      const j = i + Math.floor(rng() * (cards.length - i))
      ;[cards[i], cards[j]] = [cards[j], cards[i]]
    }
    return { type: 'choosePass', cards: cards.slice(0, PASS_SIZE) }
  }
  if (phase.kind !== 'playing') throw new Error(`search: seat ${seat} has nothing to do in ${phase.kind}`)
  const legal = legalPlays(phase.play.hands[seat], phase.play, game.rules)
  return { type: 'playCard', card: legal[Math.floor(rng() * legal.length)] }
}

/** Points are bad: the negative of the seat's points for the round, a moon scored as the rules say. */
export function value(game: Game, seat: Seat): number {
  const phase = game.phase
  if (phase.kind !== 'roundResult' && phase.kind !== 'gameOver') throw new Error(`search: the round is not over in ${phase.kind}`)
  return -phase.summary.points[seat]
}

/** The round, then the pass or the trick and the cards on the table. */
export function decisionId(view: View): string {
  const phase = view.phase
  if (phase.kind === 'passing') return `${view.roundNumber}:pass`
  const play = playing(view)
  return `${view.roundNumber}:${play.tricks.length}:${play.current.map((p) => cardId(p.card)).join(',')}`
}

export const heartsSearch: SearchGame<Game, Action, View, Card> = {
  step,
  knowledge,
  rebuild,
  candidates: (view) => candidates(view),
  rollout,
  value,
  decisionId,
  worlds: WORLDS,
  trick: (view) => (view.phase.kind === 'playing' ? view.phase.tricks.length : null),
  trickWinner(game, index) {
    const phase = game.phase
    return phase.kind === 'playing' || phase.kind === 'trickPause' ? (phase.play.tricks[index]?.winner ?? null) : null
  },
  seatsToAct,
  nextDeadline,
}

/**
 * The search's honest choice for the seat whose `full` view this is, with its results; null when the seat
 * has nothing to decide. `among` narrows the cards it may play; `worlds` replaces the default.
 */
export function searchHearts(view: View, mind: Mind, options: { among?: readonly Card[]; worlds?: number } = {}): SearchResult<Action, Card> | null {
  const game = { ...heartsSearch, worlds: options.worlds ?? WORLDS, candidates: (v: View) => candidates(v, options.among) }
  return search(game, view, mind)
}
