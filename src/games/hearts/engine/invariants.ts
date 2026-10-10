import { SUITS, cardId, hasCard, sameCard } from '../../../kit/cards'
import { isAiControlled } from '../../../kit/table'
import { trickWinner } from '../../../kit/tricks'
import { seatsToAct } from './apply'
import { type Card, RANKS, TWO_OF_CLUBS, strength } from './cards'
import { breaksHearts } from './excuses'
import { HAND_SIZE, PASS_SIZE, PLAYERS, passDirection, passTarget } from './rules'
import { gameWinner } from './scoring'
import type { Game, PlayRecord, RoundPlay } from './types'

/** Each card's place in the deck, by suit and rank: cards are counted by it rather than by a string each. */
const PLACES = new Map(SUITS.map((suit, s) => [suit as string, new Map(RANKS.map((rank, r) => [rank as string, s * RANKS.length + r]))]))

/** Throws if the game is in a state the engine should never produce. */
export function checkInvariants(game: Game): void {
  const fail = (message: string): never => {
    throw new Error(`Invariant broken in ${game.phase.kind}: ${message}`)
  }
  const phase = game.phase
  const direction = passDirection(game.rules, game.roundNumber)

  if (game.playerCount !== PLAYERS || game.seats.length !== PLAYERS) fail(`${game.seats.length} seats for ${game.playerCount} players`)
  if (game.scores.length !== PLAYERS || game.scores.some((s) => !Number.isInteger(s))) fail(`scores ${game.scores}`)
  if (phase.kind !== 'lobby' && game.roundNumber < 1) fail(`round ${game.roundNumber}`)

  /** Every card of the deck exactly once among `groups`; a card Hearts does not have is never one of them. */
  const allCards = (groups: readonly (readonly Card[])[]) => {
    const seen: boolean[] = []
    let count = 0
    let unique = 0
    for (const cards of groups) {
      for (const c of cards) {
        const place = PLACES.get(c.suit)?.get(c.rank)
        if (place !== undefined && !seen[place]) {
          seen[place] = true
          unique++
        }
        count++
      }
    }
    if (count !== 52 || unique !== 52) fail(`${count} cards, ${unique} unique`)
  }

  const checkPlay = (play: RoundPlay) => {
    const records: PlayRecord[] = []
    for (const t of play.tricks) records.push(...t.plays)
    records.push(...play.current)
    allCards([...play.hands, records.map((p) => p.card)])
    play.hands.forEach((hand, seat) => {
      const played = play.current.some((p) => p.seat === seat) ? 1 : 0
      if (hand.length !== HAND_SIZE - play.tricks.length - played) fail(`seat ${seat} holds ${hand.length} cards`)
    })
    if (records.length > 0 && !sameCard(records[0].card, TWO_OF_CLUBS)) fail('the round did not open with the two of clubs')
    play.tricks.forEach((t, i) => {
      if (t.plays.length !== PLAYERS) fail(`trick ${i} has ${t.plays.length} cards`)
      if (t.winner !== trickWinner(t.plays, { trump: null, strength })) fail(`trick ${i} went to the wrong seat`)
      const leader = i === 0 ? t.plays[0].seat : play.tricks[i - 1].winner
      if (t.plays.some((p, j) => p.seat !== (leader + j) % PLAYERS)) fail(`trick ${i} played out of turn`)
    })
    for (const r of records) {
      if (!hasCard(r.handBefore, r.card)) fail(`seat ${r.seat} played ${cardId(r.card)} from a hand without it`)
      if (!game.rules.allowCheating && r.broke.length > 0) fail(`a rule-breaking card was accepted with cheating off`)
    }
    if (play.heartsBroken !== records.some((r) => breaksHearts(r.card, game.rules))) fail(`heartsBroken is ${play.heartsBroken}`)
    if (direction === 'none') {
      if ([...play.received, ...play.gave].some((c) => c.length !== 0)) fail('cards passed in a round without passing')
    } else {
      play.gave.forEach((gave, seat) => {
        if (gave.length !== PASS_SIZE) fail(`seat ${seat} gave ${gave.length} cards`)
        const received = play.received[passTarget(seat, direction)]
        if (received.length !== PASS_SIZE || !gave.every((c) => hasCard(received, c))) fail(`seat ${seat}'s cards went astray`)
      })
    }
  }

  switch (phase.kind) {
    case 'passing':
      allCards(phase.hands)
      if (phase.hands.some((h) => h.length !== HAND_SIZE)) fail('hands are not thirteen cards')
      if (phase.direction !== direction) fail(`passing ${phase.direction} in a round that passes ${direction}`)
      phase.chosen.forEach((chosen, seat) => {
        if (chosen === null) return
        const distinct = new Set(chosen.map(cardId)).size === PASS_SIZE
        if (chosen.length !== PASS_SIZE || !distinct || !chosen.every((c) => hasCard(phase.hands[seat], c))) fail(`seat ${seat} chose cards it does not hold`)
      })
      if (phase.chosen.every((c) => c !== null)) fail('everyone has chosen but nothing was exchanged')
      break
    case 'playing': {
      checkPlay(phase.play)
      const { tricks, current, hands } = phase.play
      const leader = current.length > 0 ? current[0].seat : tricks.length > 0 ? tricks[tricks.length - 1].winner : hands.findIndex((h) => hasCard(h, TWO_OF_CLUBS))
      if (phase.turn !== (leader + current.length) % PLAYERS) fail(`turn ${phase.turn} after leader ${leader}`)
      if (current.some((p, j) => p.seat !== (leader + j) % PLAYERS)) fail('the current trick is out of turn')
      break
    }
    case 'trickPause':
      checkPlay(phase.play)
      if (phase.play.current.length !== 0) fail('trick pause with cards on the table')
      if (phase.play.tricks.length === 0) fail('trick pause before any trick')
      break
    case 'gameOver':
      if (gameWinner(game.scores, game.rules) !== phase.winner) fail(`winner ${phase.winner} with scores ${game.scores}`)
      break
    case 'roundResult':
      if (gameWinner(game.scores, game.rules) !== null) fail('the game should be over')
      break
    case 'lobby':
      break
  }

  const toAct = seatsToAct(game)
  const idle = phase.kind === 'lobby' || phase.kind === 'roundResult' || phase.kind === 'gameOver'
  if (!idle && toAct.length === 0 && !('deadline' in phase)) fail('nobody to act and no deadline')
  const aiNeeded = toAct.some((s) => isAiControlled(game, s))
  if (aiNeeded !== (game.aiActAt !== null)) fail(`aiActAt ${game.aiActAt} but aiNeeded ${aiNeeded}`)
  if (game.waiting.map((w) => w.seat).join() !== toAct.join()) fail(`waiting on ${game.waiting.map((w) => w.seat)} but ${toAct} to act`)
}
