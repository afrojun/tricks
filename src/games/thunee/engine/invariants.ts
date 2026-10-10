import { isAiControlled } from '../../../kit/table'
import { seatsToAct, untimedSeats } from './apply'
import { type Card, RANKS, SUITS, place } from './cards'
import type { Game, RoundPlay } from './types'

const DECK_SIZE = SUITS.length * RANKS.length
/**
 * Every card of the deck once, as a number: each card sets the bit of its place. A card the deck lacks, of a
 * rank or a suit it does not have, is at place -1 and sets the sign bit, which the whole deck has not.
 */
const WHOLE_DECK = 2 ** DECK_SIZE - 1

/**
 * Throws if the game is in a state the engine should never produce. The room asks after every action, so it
 * walks the round with plain loops.
 */
export function checkInvariants(game: Game): void {
  const fail = (message: string): never => {
    throw new Error(`Invariant broken in ${game.phase.kind}: ${message}`)
  }
  const phase = game.phase
  const n = game.playerCount

  if (game.seats.length !== n) fail(`${game.seats.length} seats for ${n} players`)
  if (game.dealer < 0 || game.dealer >= n) fail(`dealer ${game.dealer}`)
  if (game.balls.some((b) => b < 0 || !Number.isInteger(b))) fail(`balls ${game.balls}`)

  switch (phase.kind) {
    case 'calling':
    case 'trumpSelection':
      allCards(phase.hands, phase.stock, [], [], fail)
      for (const hand of phase.hands) if (hand.length !== 4) fail('hands are not four cards')
      break
    case 'thuneeWindow':
      allCards(phase.hands, phase.stock, [], [], fail)
      for (const hand of phase.hands) if (hand.length !== 6) fail('hands are not six cards')
      break
    case 'playing':
      checkPlay(game, phase.play, fail)
      for (const p of phase.play.current) if (p.seat === phase.turn) fail('seat to play has already played')
      break
    case 'trickPause':
      checkPlay(game, phase.play, fail)
      if (phase.play.current.length !== 0) fail('trick pause with cards on the table')
      break
    case 'lobby':
    case 'roundResult':
    case 'gameOver':
      break
  }

  const waiting = seatsToAct(game)
  const idle = phase.kind === 'lobby' || phase.kind === 'roundResult' || phase.kind === 'gameOver'
  if (!idle && waiting.length === 0 && !('deadline' in phase && phase.deadline !== null)) fail('nobody to act and no deadline')
  const aiNeeded = waiting.some((s) => isAiControlled(game, s))
  if (aiNeeded !== (game.aiActAt !== null)) fail(`aiActAt ${game.aiActAt} but aiNeeded ${aiNeeded}`)
  const untimed = untimedSeats(game)
  if (game.waiting.length !== untimed.length || game.waiting.some((w, i) => w.seat !== untimed[i])) {
    fail(`waiting on ${game.waiting.map((w) => w.seat)} but ${untimed} untimed`)
  }
}

/** Every card of the deck once, among the hands, the stock, the tricks and the trick being played. */
function allCards(
  hands: readonly (readonly Card[])[],
  stock: readonly Card[],
  tricks: readonly { plays: readonly { card: Card }[] }[],
  current: readonly { card: Card }[],
  fail: (message: string) => never,
): void {
  let count = 0
  let seen = 0
  for (const hand of hands) {
    for (const c of hand) {
      count++
      seen |= 1 << place(c)
    }
  }
  for (const c of stock) {
    count++
    seen |= 1 << place(c)
  }
  for (const t of tricks) {
    for (const p of t.plays) {
      count++
      seen |= 1 << place(p.card)
    }
  }
  for (const p of current) {
    count++
    seen |= 1 << place(p.card)
  }
  if (count !== DECK_SIZE || seen !== WHOLE_DECK) fail(`${count} cards, not each of the deck once`)
}

/** The round being played: its cards, how many each hand holds, its tricks, and with cheating off nothing that broke a rule. */
function checkPlay(game: Game, play: RoundPlay, fail: (message: string) => never): void {
  allCards(play.hands, play.stock, play.tricks, play.current, fail)
  let tricksThisHalf = 0
  for (const t of play.tricks) if (t.half === play.half) tricksThisHalf++
  for (const [seat, hand] of play.hands.entries()) {
    let played = 0
    for (const p of play.current) if (p.seat === seat) played = 1
    if (hand.length !== 6 - tricksThisHalf - played) fail(`seat ${seat} holds ${hand.length} cards`)
  }
  for (const t of play.tricks) if (t.plays.length !== game.playerCount) fail('incomplete trick recorded')
  if (!game.rules.allowCheating) {
    for (const t of play.tricks) for (const r of t.plays) if (r.broke.length > 0) fail('a rule-breaking card was accepted with cheating off')
    for (const r of play.current) if (r.broke.length > 0) fail('a rule-breaking card was accepted with cheating off')
    for (const j of play.jodhiClaims) if (!j.valid) fail('a false Jodhi was accepted with cheating off')
    if (play.thunee?.sixOfASuit) fail('a Thunee with six of one suit was accepted with cheating off')
  }
}
