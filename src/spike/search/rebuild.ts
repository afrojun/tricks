/**
 * The inverse of `viewFor` for card play: a seat's full-memory view plus a
 * guess at what it cannot see becomes a whole `Game` the engine accepts.
 * This is the part each game would have to supply to a shared search player.
 */
import {
  type Card,
  type Game,
  type JodhiClaim,
  type PlayRecord,
  type Seat,
  type Suit,
  type View,
  type ViewPlay,
  FORMAT_VERSION,
  cardId,
  holdsJodhi,
  isAiControlled,
  isLegalPlay,
} from '../../engine'

/** What the view hides, as one guess. */
export interface World {
  /** Every seat's hand now; the viewer's own must be its view's hand, in order. */
  hands: Card[][]
  /** Undealt cards in dealing order (two-player first half only). */
  stock: Card[]
  /** Trump, used only when the view hides it. */
  trump: Suit | null
}

export function rebuild(view: View, world: World): Game {
  const phase = view.phase
  if (phase.kind !== 'playing' && phase.kind !== 'trickPause') throw new Error(`rebuild: ${phase.kind}`)
  if (phase.tricks.some((t) => t.plays.length === 0)) throw new Error('rebuild: needs a full-memory view')
  const trumpHidden = !phase.trumpRevealed && phase.thunee === null && view.seat !== phase.trumper
  const trump = trumpHidden ? world.trump : phase.trump

  /** The cards `seat` held after `done` tricks of `half`: what it holds now plus what it has played since. */
  const heldAfter = (seat: Seat, done: number, half: 1 | 2): Card[] => {
    const later = phase.tricks.flatMap((t, i) => (i >= done && t.half === half ? t.plays : []))
    if (half === phase.half) later.push(...phase.current)
    const now = half === phase.half ? world.hands[seat] : []
    return [...now, ...later.filter((p) => p.seat === seat).map((p) => p.card)]
  }
  const record = (plays: ViewPlay[], trickIndex: number, half: 1 | 2): PlayRecord[] =>
    plays.map((p, i) => {
      const handBefore = heldAfter(p.seat, trickIndex, half)
      const legal = isLegalPlay(p.card, handBefore, plays.slice(0, i).map((q) => q.card), trump, view.rules)
      return { seat: p.seat, card: { ...p.card }, handBefore, legal }
    })
  const firstOfHalf = (half: 1 | 2) => {
    const i = phase.tricks.findIndex((t) => t.half === half)
    return i === -1 ? phase.tricks.length : i
  }
  const jodhiClaims: JodhiClaim[] = phase.jodhiClaims.map((j) => {
    const half = phase.tricks[j.trick - 1]?.half ?? 1
    const cards = view.rules.jodhiCards === 'inHand' ? heldAfter(j.seat, j.trick, half) : heldAfter(j.seat, firstOfHalf(half), half)
    return { ...j, valid: holdsJodhi(cards, j.suit, j.withJack) }
  })

  const play = {
    hands: world.hands.map((h) => [...h]),
    dealt: world.hands.map((_, seat) => heldAfter(seat, firstOfHalf(phase.half), phase.half)),
    trumper: phase.trumper,
    callAmount: phase.callAmount,
    trump,
    trumpRevealed: phase.trumpRevealed,
    thunee: phase.thunee && { ...phase.thunee },
    half: phase.half,
    stock: [...world.stock],
    tricks: phase.tricks.map((t, i) => ({ plays: record(t.plays, i, t.half), winner: t.winner, half: t.half })),
    current: record(phase.current, phase.tricks.length, phase.half),
    jodhiClaims,
    jodhiOpenFor: phase.jodhiOpenFor,
    double: phase.double && { ...phase.double },
    khanaak: phase.khanaak && { ...phase.khanaak },
  }
  const game: Game = {
    formatVersion: FORMAT_VERSION,
    rules: view.rules,
    playerCount: view.playerCount,
    seats: view.seats.map((s) => ({ ...s, persona: s.persona ?? 'straight' })),
    host: view.owner,
    balls: [view.balls[0], view.balls[1]],
    dealer: view.dealer,
    // Only visible through the target it raises; without that rule it changes nothing this round.
    khanaakCalled: view.ballsTarget > view.rules.ballsToWin || phase.khanaak !== null,
    lastRoundWinner: null,
    roundNumber: view.roundNumber,
    aiActAt: null,
    aiSalt: 0,
    acting: view.acting && { ...view.acting },
    phase:
      phase.kind === 'playing'
        ? { kind: 'playing', play, turn: phase.turn! }
        : { kind: 'trickPause', play, deadline: phase.deadline! },
  }
  if (phase.kind === 'playing' && isAiControlled(game, phase.turn!)) game.aiActAt = view.acting?.since ?? 0
  return game
}

/** Cards a seat can see: its own hand and every card played. */
export function seenCards(view: View): Set<string> {
  const phase = view.phase
  if (phase.kind !== 'playing' && phase.kind !== 'trickPause') return new Set()
  return new Set([...phase.hand, ...phase.tricks.flatMap((t) => t.plays.map((p) => p.card)), ...phase.current.map((p) => p.card)].map(cardId))
}
