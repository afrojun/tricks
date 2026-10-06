/**
 * Hearts' imagined games, for the search player: a game rebuilt from a seat's `full` view and one dealing of
 * the cards it cannot see, a random legal action in it, and its value once the round is over. The only file
 * of the computer players besides the driver that holds a `Game`, and none of it decides for a real seat:
 * `search.ts` decides, from the view.
 */
import { brokenRules } from '../../../kit/integrity'
import type { SearchGame, World } from '../../../kit/search/types'
import { type Seat, allSeats, isAiControlled } from '../../../kit/table'
import { nextDeadline, seatsToAct, step } from '../engine/apply'
import type { Card } from '../engine/cards'
import { legalPlays, seenPlays } from '../engine/excuses'
import { PASS_SIZE, PLAYERS, type PassDirection, passTarget } from '../engine/rules'
import { type Action, FORMAT_VERSION, type Game, type PlayRecord, type View, type ViewPlaying } from '../engine/types'

/** The seats other than the viewer, in order: the sampler's places. */
export const othersThan = (me: Seat) => allSeats(PLAYERS).filter((s) => s !== me)

/** The round in play as a `full` view shows it; anything else cannot be searched. */
export function fullPlay(view: View): ViewPlaying {
  const phase = view.phase
  if (phase.kind !== 'playing' && phase.kind !== 'trickPause') throw new Error(`search: nothing to search in ${phase.kind}`)
  if (phase.tricks.some((t) => t.plays.length === 0)) throw new Error('search: needs a full view')
  return phase
}

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
    const play = fullPlay(view)
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
  const phase = fullPlay(view)
  const gave = empty()
  const received = empty()
  for (const from of allSeats(PLAYERS)) {
    const to = passTarget(from, direction)
    gave[from] = from === me ? [...phase.gave] : to === me ? [...phase.received] : dealt[to].slice(0, PASS_SIZE)
    received[to] = [...gave[from]]
  }
  return { received, gave }
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

/** The parts of Hearts' `SearchGame` that work on an imagined game. */
export const imagined: Pick<SearchGame<Game, Action, View, Card>, 'step' | 'rebuild' | 'rollout' | 'value' | 'trickWinner' | 'seatsToAct' | 'nextDeadline'> = {
  step,
  rebuild,
  rollout,
  value,
  trickWinner(game, index) {
    const phase = game.phase
    return phase.kind === 'playing' || phase.kind === 'trickPause' ? (phase.play.tricks[index]?.winner ?? null) : null
  },
  seatsToAct,
  nextDeadline,
}
