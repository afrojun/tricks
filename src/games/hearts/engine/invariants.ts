import { cardId, hasCard, sameCard } from '../../../kit/cards'
import { type Seat, isAiControlled } from '../../../kit/table'
import { trickWinner } from '../../../kit/tricks'
import { seatsToAct } from './apply'
import { type Card, TWO_OF_CLUBS, place, strength } from './cards'
import { breaksHearts } from './excuses'
import { HAND_SIZE, PASS_SIZE, PLAYERS, passDirection, passTarget } from './rules'
import { gameWinner } from './scoring'
import type { Game, PlayRecord, RoundPlay } from './types'

/** How a trick of Hearts is won: there is no trump. */
const ORDER = { trump: null, strength }

/** Whether each of `plays` was made in turn, from `leader` on. */
function inTurn(plays: readonly PlayRecord[], leader: Seat): boolean {
  for (let j = 0; j < plays.length; j++) if (plays[j].seat !== (leader + j) % PLAYERS) return false
  return true
}

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
        const at = place(c)
        if (at !== -1 && !seen[at]) {
          seen[at] = true
          unique++
        }
        count++
      }
    }
    if (count !== 52 || unique !== 52) fail(`${count} cards, ${unique} unique`)
  }

  const checkPlay = (play: RoundPlay) => {
    const { hands, tricks, current } = play
    const records: PlayRecord[] = []
    for (const t of tricks) for (const p of t.plays) records.push(p)
    for (const p of current) records.push(p)
    allCards([...hands, records.map((p) => p.card)])
    for (let seat = 0; seat < hands.length; seat++) {
      let played = 0
      for (const p of current) if (p.seat === seat) played = 1
      if (hands[seat].length !== HAND_SIZE - tricks.length - played) fail(`seat ${seat} holds ${hands[seat].length} cards`)
    }
    if (records.length > 0 && !sameCard(records[0].card, TWO_OF_CLUBS)) fail('the round did not open with the two of clubs')
    for (let i = 0; i < tricks.length; i++) {
      const plays = tricks[i].plays
      if (plays.length !== PLAYERS) fail(`trick ${i} has ${plays.length} cards`)
      if (tricks[i].winner !== trickWinner(plays, ORDER)) fail(`trick ${i} went to the wrong seat`)
      if (!inTurn(plays, i === 0 ? plays[0].seat : tricks[i - 1].winner)) fail(`trick ${i} played out of turn`)
    }
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
      if (!inTurn(current, leader)) fail('the current trick is out of turn')
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
