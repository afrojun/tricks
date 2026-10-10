import { isAiControlled } from '../../../kit/table'
import { seatsToAct, untimedSeats } from './apply'
import { type Card, RANKS, SUITS } from './cards'
import type { Game, RoundPlay } from './types'

/** A card's own bit, so that cards make a number: every card of the deck once is `WHOLE_DECK`. */
const bit = (c: Card) => 1 << (SUITS.indexOf(c.suit) * RANKS.length + RANKS.indexOf(c.rank))
const WHOLE_DECK = 2 ** 24 - 1

/** Throws if the game is in a state the engine should never produce. */
export function checkInvariants(game: Game): void {
  const fail = (message: string): never => {
    throw new Error(`Invariant broken in ${game.phase.kind}: ${message}`)
  }
  const phase = game.phase
  const n = game.playerCount

  if (game.seats.length !== n) fail(`${game.seats.length} seats for ${n} players`)
  if (game.dealer < 0 || game.dealer >= n) fail(`dealer ${game.dealer}`)
  if (game.balls.some((b) => b < 0 || !Number.isInteger(b))) fail(`balls ${game.balls}`)

  /** Every card of the deck once, among `piles` and the cards played to `tricks`. */
  const allCards = (piles: readonly (readonly Card[])[], tricks: readonly (readonly { card: Card }[])[] = []) => {
    let count = 0
    let seen = 0
    for (const pile of piles) {
      for (const c of pile) {
        count++
        seen |= bit(c)
      }
    }
    for (const plays of tricks) {
      for (const p of plays) {
        count++
        seen |= bit(p.card)
      }
    }
    if (count !== 24 || seen !== WHOLE_DECK) fail(`${count} cards, not each of the deck once`)
  }
  const checkPlay = (play: RoundPlay) => {
    allCards([...play.hands, play.stock], [...play.tricks.map((t) => t.plays), play.current])
    const tricksThisHalf = play.tricks.filter((t) => t.half === play.half).length
    play.hands.forEach((hand, seat) => {
      const played = play.current.some((p) => p.seat === seat) ? 1 : 0
      if (hand.length !== 6 - tricksThisHalf - played) fail(`seat ${seat} holds ${hand.length} cards`)
    })
    if (play.tricks.some((t) => t.plays.length !== n)) fail('incomplete trick recorded')
    if (!game.rules.allowCheating) {
      const records = [...play.tricks.flatMap((t) => t.plays), ...play.current]
      if (records.some((r) => r.broke.length > 0)) fail('a rule-breaking card was accepted with cheating off')
      if (play.jodhiClaims.some((j) => !j.valid)) fail('a false Jodhi was accepted with cheating off')
      if (play.thunee?.sixOfASuit) fail('a Thunee with six of one suit was accepted with cheating off')
    }
  }

  switch (phase.kind) {
    case 'calling':
    case 'trumpSelection':
      allCards([...phase.hands, phase.stock])
      if (phase.hands.some((h) => h.length !== 4)) fail('hands are not four cards')
      break
    case 'thuneeWindow':
      allCards([...phase.hands, phase.stock])
      if (phase.hands.some((h) => h.length !== 6)) fail('hands are not six cards')
      break
    case 'playing':
      checkPlay(phase.play)
      if (phase.play.current.some((p) => p.seat === phase.turn)) fail('seat to play has already played')
      break
    case 'trickPause':
      checkPlay(phase.play)
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
  if (game.waiting.map((w) => w.seat).join() !== untimed.join()) fail(`waiting on ${game.waiting.map((w) => w.seat)} but ${untimed} untimed`)
}
