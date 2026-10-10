import { cardId, hasCard } from '../../../kit/cards'
import { partnerOf } from '../../../kit/partners'
import { type Seat, isAiControlled, nextSeat } from '../../../kit/table'
import { trickWinner } from '../../../kit/tricks'
import { seatsToAct } from './apply'
import { type Card, PLACE_COUNT, TRUMP, createDeck, place, strength, suitOf } from './cards'
import { breaksSpades, forcedOpening, lowestClub } from './excuses'
import { EXCHANGE_SIZE, handSize, sideCount } from './rules'
import { firstLeader } from './round'
import { gameWinner } from './scoring'
import type { Call, Game, Out, PlayRecord, RoundPlay } from './types'

/** Throws if the game is in a state the engine should never produce. */
export function checkInvariants(game: Game): void {
  const fail = (message: string): never => {
    throw new Error(`Invariant broken in ${game.phase.kind}: ${message}`)
  }
  const phase = game.phase
  const count = game.playerCount
  const size = handSize(count)
  const order = { trump: TRUMP, strength: strength(game.rules.jokers), suitOf: suitOf(game.rules.jokers) }

  if (game.seats.length !== count) fail(`${game.seats.length} seats for ${count} players`)
  if (phase.kind !== 'lobby') {
    if (game.roundNumber < 1) fail(`round ${game.roundNumber}`)
    if (game.scores.length !== sideCount(count) || game.scores.some((s) => !Number.isInteger(s))) fail(`scores ${game.scores}`)
    if (game.bags.length !== sideCount(count) || game.bags.some((b) => !Number.isInteger(b) || b < 0)) fail(`bags ${game.bags}`)
    if (!Number.isInteger(game.dealer) || game.dealer < 0 || game.dealer >= count) fail(`dealer ${game.dealer}`)
  }

  /** Every card of the rules' deck exactly once among `groups`. */
  const allCards = (groups: readonly (readonly Card[])[]) => {
    const deck = new Set(createDeck(game.rules.jokers).map(place))
    const seen: boolean[] = new Array(PLACE_COUNT).fill(false)
    let total = 0
    for (const cards of groups) {
      for (const c of cards) {
        const at = place(c)
        if (!deck.has(at)) fail(`${cardId(c)} is not in the deck`)
        if (seen[at]) fail(`${cardId(c)} twice`)
        seen[at] = true
        total++
      }
    }
    if (total !== 52) fail(`${total} cards`)
  }
  const outCards = (out: Out) => [...out.discards, out.setAside === null ? [] : [out.setAside]]
  const checkOut = (out: Out, drawn: boolean) => {
    if (out.discards.length !== count) fail(`discards for ${out.discards.length} seats`)
    if ((count === 3) !== (out.setAside !== null)) fail(`a card set aside with ${count} players`)
    if (count !== 2 && out.discards.some((d) => d.length > 0)) fail('discards without drawing')
    if (count === 2 && drawn && out.discards.some((d) => d.length !== size)) fail(`discards of ${out.discards.map((d) => d.length)}`)
  }
  const checkCalls = (calls: readonly (Call | null)[]) => {
    if (calls.length !== count) fail(`${calls.length} calls`)
    calls.forEach((c, seat) => {
      if (c === null) return
      if (!Number.isInteger(c.tricks) || c.tricks < 0 || c.tricks > size) fail(`seat ${seat} called ${c.tricks}`)
      if (c.tricks === 0 && !game.rules.nil) fail('a Nil without the rule')
      if (c.blind && c.tricks !== 0) fail(`seat ${seat} called ${c.tricks} blind`)
    })
    const blind = calls.flatMap((c, seat) => (c?.blind ? [seat] : []))
    if (blind.length > 0 && (!game.rules.blindNil || count === 2)) fail('a Blind nil without the rule')
    for (const seat of blind) if (blind.includes(partnerOf(seat, count) ?? -1)) fail('both partners called Blind nil')
  }

  /** Whether each of `plays` was made in turn, from `leader` on. */
  const inTurn = (plays: readonly PlayRecord[], leader: Seat) => plays.every((p, j) => p.seat === (leader + j) % count)

  const checkPlay = (play: RoundPlay) => {
    const { hands, tricks, current } = play
    const records: PlayRecord[] = [...tricks.flatMap((t) => t.plays), ...current]
    allCards([...hands, ...outCards(play.out), records.map((p) => p.card)])
    checkOut(play.out, true)
    checkCalls(play.calls)
    hands.forEach((hand, seat) => {
      const played = current.some((p) => p.seat === seat) ? 1 : 0
      if (hand.length !== size - tricks.length - played) fail(`seat ${seat} holds ${hand.length} cards`)
    })
    const opener = firstLeader(game, [])
    tricks.forEach((t, i) => {
      if (t.plays.length !== count) fail(`trick ${i} has ${t.plays.length} cards`)
      if (t.winner !== trickWinner(t.plays, order)) fail(`trick ${i} went to the wrong seat`)
      const leader = i === 0 ? t.plays[0].seat : tricks[i - 1].winner
      if (!inTurn(t.plays, leader)) fail(`trick ${i} played out of turn`)
    })
    const first = records[0]
    if (first !== undefined) {
      if (!forcedOpening(game.rules, count) && first.seat !== opener) fail(`seat ${first.seat} led the round, not ${opener}`)
      if (forcedOpening(game.rules, count) && (first.card.suit !== 'clubs' || lowestClub(first.handBefore, game.rules)?.rank !== first.card.rank)) fail('the forced opening was not the lowest club')
    }
    for (const r of records) {
      if (!hasCard(r.handBefore, r.card)) fail(`seat ${r.seat} played ${cardId(r.card)} from a hand without it`)
      if (!game.rules.allowCheating && r.broke.length > 0) fail('a rule-breaking card was accepted with cheating off')
    }
    if (play.spadesBroken !== records.some((r) => breaksSpades(r.card, game.rules))) fail(`spadesBroken is ${play.spadesBroken}`)
    if (play.raised.length !== sideCount(count) || play.raised.some((n) => !Number.isInteger(n) || n < 0)) fail(`raised ${play.raised}`)
    if (play.settled.length !== count) fail(`settled ${play.settled}`)
    play.settled.forEach((n, seat) => {
      const plays = records.filter((r) => r.seat === seat).length
      if (!Number.isInteger(n) || n < 0 || n > plays) fail(`seat ${seat} has ${n} plays settled of ${plays}`)
    })
    if (game.rules.renege === 'set' && (play.raised.some((n) => n > 0) || play.settled.some((n) => n > 0) || play.nilFailed.some(Boolean))) fail('a penalty that goes on under "set"')
    play.nilFailed.forEach((failed, seat) => {
      if (failed && play.calls[seat].tricks !== 0) fail(`seat ${seat} failed a Nil it did not call`)
    })
    const blind = play.calls.findIndex((c) => c.blind)
    const partnered = blind !== -1 && partnerOf(blind, count) !== null
    if (partnered !== (play.exchange !== null)) fail('an exchange without a partnered Blind nil, or none with one')
    if (play.exchange !== null && (play.exchange.blind !== blind || play.exchange.gave?.length !== EXCHANGE_SIZE || play.exchange.returned?.length !== EXCHANGE_SIZE)) fail('the exchange is incomplete')
  }

  switch (phase.kind) {
    case 'drawing': {
      allCards([...phase.hands, ...outCards(phase.out), phase.stock])
      checkOut(phase.out, false)
      if (phase.stock.length === 0 || phase.stock.length % 2 !== 0) fail(`a stock of ${phase.stock.length}`)
      const turns = phase.hands.map((h) => h.length)
      if (turns.some((n, s) => n !== phase.out.discards[s].length)) fail('a hand and its discards differ')
      const drawn = turns.reduce((a, b) => a + b, 0)
      const first = nextSeat(game.dealer, count)
      if (phase.turn !== (first + drawn) % count) fail(`turn ${phase.turn} after ${drawn} draws`)
      break
    }
    case 'calling': {
      allCards([...phase.hands, ...outCards(phase.out)])
      checkOut(phase.out, true)
      if (phase.hands.some((h) => h.length !== size)) fail(`hands of ${phase.hands.map((h) => h.length)}`)
      checkCalls(phase.calls)
      const made = phase.calls.filter((c) => c !== null).length
      if (made === count) fail('everyone has called but play has not begun')
      if (phase.turn !== (nextSeat(game.dealer, count) + made) % count) fail(`turn ${phase.turn} after ${made} calls`)
      phase.calls.forEach((c, seat) => {
        if (c !== null && !phase.looked[seat]) fail(`seat ${seat} called without its hand turned up`)
      })
      break
    }
    case 'exchanging': {
      allCards([...phase.hands, ...outCards(phase.out)])
      checkCalls(phase.calls)
      const { blind, gave, returned } = phase.exchange
      if (!phase.calls[blind]?.blind || partnerOf(blind, count) === null) fail(`seat ${blind} exchanges without a partnered Blind nil`)
      if (returned !== null) fail('the exchange is over but play has not begun')
      const partner = partnerOf(blind, count) as Seat
      const expected = (seat: Seat) => size + (gave === null ? 0 : seat === partner ? EXCHANGE_SIZE : seat === blind ? -EXCHANGE_SIZE : 0)
      phase.hands.forEach((h, seat) => {
        if (h.length !== expected(seat)) fail(`seat ${seat} holds ${h.length}`)
      })
      if (gave !== null && !gave.every((c) => hasCard(phase.hands[partner], c))) fail('the cards given went astray')
      break
    }
    case 'playing': {
      checkPlay(phase.play)
      const { tricks, current } = phase.play
      const leader = current.length > 0 ? current[0].seat : tricks.length > 0 ? tricks[tricks.length - 1].winner : firstLeader(game, phase.play.hands)
      if (phase.turn !== (leader + current.length) % count) fail(`turn ${phase.turn} after leader ${leader}`)
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
