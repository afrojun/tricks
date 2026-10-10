/** Spades' side of the module contract: its random legal player, its mischief, and what each seat may not see. For tests. */
import { type Card, sameCard } from '../../kit/cards'
import type { Contract } from '../../kit/contract'
import { brokenRules } from '../../kit/integrity'
import { type Persona, TRAITS, mindFor } from '../../kit/mind'
import { partnerOf } from '../../kit/partners'
import { type Seat, allSeats } from '../../kit/table'
import { same } from '../../kit/testing'
import { spades } from '.'
import { availableActions } from './engine/available'
import { seenPlays } from './engine/excuses'
import { EXCHANGE_SIZE, type RuleOverrides, handSize } from './engine/rules'
import type { Action, Game, GameEvent, Out, View } from './engine/types'
import { viewFor } from './engine/view'

/** What a run saw, to show the mischief reached the corners it should. */
export interface SpadesTally {
  reasons: Set<string>
  phases: Set<string>
  /** Rule-breaking cards accepted. */
  cheats: number
  /** Guilty accusations by computers. */
  caught: number
  /** Wrong accusations by computers, every one of them on a hunch. */
  hunches: number
  accusations: number
  blindNils: number
  nils: number
}

const pick = <T>(items: readonly T[], rng: () => number): T => items[Math.floor(rng() * items.length)]

const PERSONAS: (Persona | 'surprise')[] = ['surprise', 'sharp', 'wild']

/**
 * The rules each table size plays in the shared contract tests, so between them every rule's other value is
 * reached: Blind nil and its exchange with four, "Bid plus three" and the jokers with three, and drawing with two.
 */
export function contractRules(playerCount: number): RuleOverrides {
  if (playerCount === 4) return { blindNil: true, firstLead: 'lowestClub' }
  if (playerCount === 3) return { blindNil: true, renege: 'bidPlusThree', jokers: true }
  return { renege: 'bidPlusThree', nil: false }
}

export function spadesContract(overrides: RuleOverrides, playerCount: 2 | 3 | 4): { contract: Contract<Game, Action, GameEvent, View>; tally: SpadesTally } {
  const tally: SpadesTally = { reasons: new Set(), phases: new Set(), cheats: 0, caught: 0, hunches: 0, accusations: 0, blindNils: 0, nils: 0 }
  const fail = (message: string): never => {
    throw new Error(message)
  }

  const contract: Contract<Game, Action, GameEvent, View> = {
    module: spades,

    start(ctx) {
      let game = spades.createGame()
      const run = (actor: Seat | null, action: Action) => {
        const result = spades.apply(game, actor, action, ctx)
        if ('rejected' in result) fail(`setup ${action.type} refused: ${result.rejected}`)
        else game = result.game
      }
      run(null, { type: 'sit', seat: 0, name: 'You' })
      if (playerCount !== 4) run(0, { type: 'setPlayerCount', playerCount })
      for (const seat of allSeats(playerCount).slice(1)) run(0, { type: 'addAi', seat, persona: PERSONAS[(seat - 1) % PERSONAS.length] })
      run(0, { type: 'setRules', overrides })
      run(0, { type: 'start' })
      return game
    },

    legal(game, seat, rng) {
      const can = availableActions(viewFor(game, seat))
      if (can.draw) return { type: 'draw', keep: rng() < 0.5 }
      if (can.blindNil && rng() < 0.5) return { type: 'callBlindNil' }
      if (can.look) return { type: 'lookAtHand' }
      if (can.calls.length > 0) {
        // Near what a hand takes on average, so games end; now and then Nil.
        const fair = Math.max(1, Math.floor(handSize(game.playerCount) / game.playerCount) - 1)
        if (can.calls.includes(0) && rng() < 0.15) return { type: 'call', tricks: 0 }
        return { type: 'call', tricks: Math.min(fair + Math.floor(rng() * 2), can.calls[can.calls.length - 1]) }
      }
      if (can.give.length > 0) return { type: 'giveCards', cards: [...can.give].sort(() => rng() - 0.5).slice(0, EXCHANGE_SIZE) }
      if (can.legal.length > 0) return { type: 'playCard', card: pick(can.legal, rng) }
      if (can.nextRound) return { type: 'nextRound' }
      return null
    },

    mischief(game, rng) {
      const phase = game.phase
      if (phase.kind !== 'playing' && phase.kind !== 'trickPause') return null
      const r = rng()
      if (phase.kind === 'playing' && r < 0.03) {
        // Any card from the hand, whatever the rules say: refused at a forced opening, and whenever cheating is off.
        return { actor: phase.turn, action: { type: 'playCard', card: pick(phase.play.hands[phase.turn], rng) } }
      }
      if (r > 0.995) {
        const seat = Math.floor(rng() * game.playerCount)
        const can = availableActions(viewFor(game, seat))
        const targets = can.challengePlay.length > 0 ? can.challengePlay : allSeats(game.playerCount).filter((s) => s !== seat)
        return { actor: seat, action: { type: 'challengePlay', seat: pick(targets, rng) } }
      }
      return null
    },

    hidden(game, seat) {
      const phase = game.phase
      if (phase.kind === 'lobby' || phase.kind === 'roundResult' || phase.kind === 'gameOver') return []
      const out: Out = phase.kind === 'playing' || phase.kind === 'trickPause' ? phase.play.out : phase.out
      const hands = phase.kind === 'playing' || phase.kind === 'trickPause' ? phase.play.hands : phase.hands
      const exchange = phase.kind === 'exchanging' ? phase.exchange : phase.kind === 'playing' || phase.kind === 'trickPause' ? phase.play.exchange : null
      // What a seat gave or was given in an exchange it knows, wherever those cards are now; and its own discards.
      const party = exchange !== null && seat !== null && (seat === exchange.blind || seat === partnerOf(exchange.blind, game.playerCount))
      const known: Card[] = [...(seat === null ? [] : out.discards[seat]), ...(party ? [...(exchange.gave ?? []), ...(exchange.returned ?? [])] : [])]
      const knows = (card: Card) => known.some((k) => sameCard(k, card))
      const hidden: Card[] = []
      const unlooked = phase.kind === 'calling' && seat !== null && !phase.looked[seat]
      hands.forEach((hand, s) => {
        if (s !== seat || unlooked) for (const card of hand) if (!knows(card)) hidden.push(card)
      })
      out.discards.forEach((discards, s) => {
        if (s !== seat) hidden.push(...discards)
      })
      if (out.setAside !== null) hidden.push(out.setAside)
      if (phase.kind === 'drawing') hidden.push(...phase.stock.slice(seat === phase.turn ? 1 : 0))
      if (phase.kind === 'playing' || phase.kind === 'trickPause') {
        const tricks = phase.play.tricks
        for (let t = 0; t < tricks.length - 1; t++) for (const p of tricks[t].plays) if (!knows(p.card)) hidden.push(p.card)
      }
      return hidden
    },

    secrets: ['handBefore', 'broke', 'aiSalt', 'stock', 'setAside'],

    check(game, events, step, views) {
      const phase = game.phase
      tally.phases.add(phase.kind)
      for (const e of events) {
        if (e.type === 'called') {
          if (e.call.blind) tally.blindNils++
          else if (e.call.tricks === 0) tally.nils++
        }
        if (e.type === 'challengeResolved') {
          tally.accusations++
          if (!game.rules.allowCheating) fail('an accusation with cheating off')
          if (step.source === 'computer') {
            // Only a persona that acts on hunches may be wrong; the rest accuse on a proof alone.
            if (e.guilty) tally.caught++
            else if (TRAITS[mindFor(game, e.challenger).persona].hunchAt !== null) tally.hunches++
            else fail(`seat ${e.challenger} accused ${e.accused} without a proof`)
          }
        }
        if (e.type === 'roundScored') checkSummary(game, e.summary)
      }

      if (phase.kind !== 'playing' && phase.kind !== 'trickPause') return
      if (events.some((e) => e.type === 'cardPlayed')) {
        const records = [...phase.play.tricks.flatMap((t) => t.plays), ...phase.play.current]
        const latest = records[records.length - 1]
        if (latest.broke.length > 0) tally.cheats++
        // One description: the record agrees with the excuses an observer derives from public cards.
        const seen = seenPlays(viewFor(game, (latest.seat + 1) % game.playerCount, 'full'))
        if (seen.length !== records.length || seen.some((p, i) => p.seat !== records[i].seat || !sameCard(p.card, records[i].card))) fail('seen plays differ')
        records.forEach((r, i) => {
          const observed = brokenRules(r.handBefore, seen[i].excuses)
          if (observed.join() !== r.broke.join()) fail(`play ${i} broke ${r.broke} but an observer finds ${observed}`)
        })
      }
      if (phase.kind === 'playing') {
        const table = availableActions(views[phase.turn])
        const full = availableActions(viewFor(game, phase.turn, 'full'))
        if (!same(table, full)) fail('what a player may do depends on memory')
        if (table.legal.length === 0) fail('no legal card')
        if (!table.legal.every((c) => table.play.some((p) => sameCard(p, c)))) fail('a legal card is refused')
        if (!game.rules.allowCheating && table.play.length !== table.legal.length) fail('a rule-breaking card is offered with cheating off')
      }
    },
  }

  function checkSummary(game: Game, summary: Extract<GameEvent, { type: 'roundScored' }>['summary']) {
    tally.reasons.add(summary.reason)
    if (summary.sides.length !== game.scores.length) fail(`a summary of ${summary.sides.length} sides`)
    if (summary.scoresAfter.join() !== game.scores.join()) fail(`scores ${game.scores} after a summary of ${summary.scoresAfter}`)
    if (summary.bagsAfter.join() !== game.bags.join()) fail(`bags ${game.bags} after a summary of ${summary.bagsAfter}`)
    for (const side of summary.sides) {
      const nils = side.nils.reduce((sum, n) => sum + n.points, 0)
      if (summary.reason === 'challenge') {
        if (side.bags !== 0 || side.bagPenalty !== 0) fail('bags in a round ended by an accusation')
        if (side.points !== (side.set ? -1 : 1) * 10 * side.contract + nils) fail(`a challenged side scored ${side.points}`)
        continue
      }
      const contractPoints = side.contract === 0 ? 0 : side.made ? 10 * side.contract : -10 * side.contract
      if (side.points !== contractPoints + side.bags + side.bagPenalty + nils) fail(`a side scored ${side.points}, not its parts`)
    }
    if (summary.reason === 'challenge' && summary.sides.filter((s) => s.set).length !== 1) fail('a challenge set more or less than one side')
    if (summary.reason === 'normal') {
      const tricks = summary.sides.reduce((sum, s) => sum + s.tricks + s.nils.reduce((n, x) => n + x.tricks, 0), 0)
      if (tricks !== handSize(game.playerCount)) fail(`${tricks} tricks in a round`)
    }
  }

  return { contract, tally }
}
