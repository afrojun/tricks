import { isAiControlled } from '../../../kit/table'
import { seatsToAct, untimedSeats } from './apply'
import { type Card, cardId } from './cards'
import type { Game, RoundPlay } from './types'

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

  const allCards = (cards: Card[]) => {
    const ids = new Set(cards.map(cardId))
    if (cards.length !== 24 || ids.size !== 24) fail(`${cards.length} cards, ${ids.size} unique`)
  }
  const checkPlay = (play: RoundPlay) => {
    allCards([
      ...play.hands.flat(),
      ...play.stock,
      ...play.tricks.flatMap((t) => t.plays.map((p) => p.card)),
      ...play.current.map((p) => p.card),
    ])
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
    }
  }

  switch (phase.kind) {
    case 'calling':
    case 'trumpSelection':
      allCards([...phase.hands.flat(), ...phase.stock])
      if (phase.hands.some((h) => h.length !== 4)) fail('hands are not four cards')
      break
    case 'thuneeWindow':
      allCards([...phase.hands.flat(), ...phase.stock])
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
  if (!idle && waiting.length === 0 && !('deadline' in phase)) fail('nobody to act and no deadline')
  const aiNeeded = waiting.some((s) => isAiControlled(game, s))
  if (aiNeeded !== (game.aiActAt !== null)) fail(`aiActAt ${game.aiActAt} but aiNeeded ${aiNeeded}`)
  const untimed = untimedSeats(game)
  if (game.waiting.map((w) => w.seat).join() !== untimed.join()) fail(`waiting on ${game.waiting.map((w) => w.seat)} but ${untimed} untimed`)
}
