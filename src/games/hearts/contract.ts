/** Hearts' side of the module contract: its random legal player, its mischief, and what each seat may not see. For tests. */
import { cardId, sameCard } from '../../kit/cards'
import type { Contract } from '../../kit/contract'
import { brokenRules } from '../../kit/integrity'
import type { Persona } from '../../kit/mind'
import { type Seat, allSeats } from '../../kit/table'
import { hearts } from '.'
import { availableActions } from './engine/available'
import { seenPlays } from './engine/excuses'
import { MOON_POINTS, PASS_SIZE, PLAYERS, type RuleOverrides } from './engine/rules'
import type { Action, Game, GameEvent, View } from './engine/types'
import { viewFor } from './engine/view'

/** What a run saw, to show the mischief reached the corners it should. */
export interface HeartsTally {
  reasons: Set<string>
  /** Rule-breaking cards accepted. */
  cheats: number
  /** Accusations by computers, every one of them guilty. */
  caught: number
  accusations: number
}

const pick = <T>(items: readonly T[], rng: () => number): T => items[Math.floor(rng() * items.length)]

const PERSONAS: (Persona | 'surprise')[] = ['surprise', 'sharp', 'wild']

export function heartsContract(overrides: RuleOverrides): { contract: Contract<Game, Action, GameEvent, View>; tally: HeartsTally } {
  const tally: HeartsTally = { reasons: new Set(), cheats: 0, caught: 0, accusations: 0 }
  const fail = (message: string): never => {
    throw new Error(message)
  }

  const contract: Contract<Game, Action, GameEvent, View> = {
    module: hearts,

    start(ctx) {
      let game = hearts.createGame()
      const run = (actor: Seat | null, action: Action) => {
        const result = hearts.apply(game, actor, action, ctx)
        if ('rejected' in result) fail(`setup ${action.type} refused: ${result.rejected}`)
        else game = result.game
      }
      run(null, { type: 'sit', seat: 0, name: 'You' })
      for (const seat of [1, 2, 3]) run(0, { type: 'addAi', seat, persona: PERSONAS[seat - 1] })
      run(0, { type: 'setRules', overrides })
      run(0, { type: 'start' })
      return game
    },

    legal(game, seat, rng) {
      const can = availableActions(viewFor(game, seat))
      if (can.pass.length > 0) {
        const cards = [...can.pass].sort(() => rng() - 0.5).slice(0, PASS_SIZE)
        return { type: 'choosePass', cards }
      }
      if (can.legal.length > 0) return { type: 'playCard', card: pick(can.legal, rng) }
      if (can.nextRound) return { type: 'nextRound' }
      return null
    },

    mischief(game, rng) {
      const phase = game.phase
      if (phase.kind !== 'playing' && phase.kind !== 'trickPause') return null
      const r = rng()
      if (phase.kind === 'playing' && r < 0.025) {
        // Any card from the hand, whatever the rules say: refused at the opening lead, and whenever cheating is off.
        return { actor: phase.turn, action: { type: 'playCard', card: pick(phase.play.hands[phase.turn], rng) } }
      }
      if (r > 0.996) {
        const seat = Math.floor(rng() * PLAYERS)
        const can = availableActions(viewFor(game, seat))
        const targets = can.challengePlay.length > 0 ? can.challengePlay : allSeats(PLAYERS).filter((s) => s !== seat)
        return { actor: seat, action: { type: 'challengePlay', seat: pick(targets, rng) } }
      }
      return null
    },

    hidden(game, seat) {
      const phase = game.phase
      if (phase.kind === 'passing') return phase.hands.filter((_, s) => s !== seat).flat()
      if (phase.kind !== 'playing' && phase.kind !== 'trickPause') return []
      const play = phase.play
      // What a seat gave and received it knows, wherever those cards are now.
      const known = new Set(seat === null ? [] : [...play.gave[seat], ...play.received[seat]].map(cardId))
      const forgotten = play.tricks.slice(0, -1).flatMap((t) => t.plays.map((p) => p.card))
      return [...play.hands.filter((_, s) => s !== seat).flat(), ...forgotten].filter((c) => !known.has(cardId(c)))
    },

    secrets: ['handBefore', 'broke', 'aiSalt'],

    check(game, events, step) {
      const phase = game.phase
      for (const e of events) {
        if (e.type === 'challengeResolved') {
          tally.accusations++
          if (!game.rules.allowCheating) fail('an accusation with cheating off')
          if (step.source === 'computer') {
            if (!e.guilty) fail(`seat ${e.challenger} accused ${e.accused} without a proof`)
            tally.caught++
          }
        }
        if (e.type === 'roundScored') checkSummary(game, e.summary)
      }

      if (phase.kind !== 'playing' && phase.kind !== 'trickPause') return
      const records = [...phase.play.tricks.flatMap((t) => t.plays), ...phase.play.current]
      if (events.some((e) => e.type === 'cardPlayed')) {
        const latest = records[records.length - 1]
        if (latest.broke.length > 0) tally.cheats++
        // One description: the record agrees with the excuses an observer derives from public cards.
        const seen = seenPlays(viewFor(game, (records.length + 1) % PLAYERS, 'full'))
        if (seen.map((p) => `${p.seat}:${cardId(p.card)}`).join() !== records.map((r) => `${r.seat}:${cardId(r.card)}`).join()) fail('seen plays differ')
        records.forEach((r, i) => {
          const observed = brokenRules(r.handBefore, seen[i].excuses)
          if (observed.join() !== r.broke.join()) fail(`play ${i} broke ${r.broke} but an observer finds ${observed}`)
        })
      }
      if (phase.kind === 'playing') {
        const table = availableActions(viewFor(game, phase.turn))
        const full = availableActions(viewFor(game, phase.turn, 'full'))
        if (JSON.stringify(table) !== JSON.stringify(full)) fail('what a player may do depends on memory')
        if (table.legal.length === 0) fail('no legal card')
        if (!table.legal.every((c) => table.play.some((p) => sameCard(p, c)))) fail('a legal card is refused')
        if (!game.rules.allowCheating && table.play.length !== table.legal.length) fail('a rule-breaking card is offered with cheating off')
      }
    },
  }

  function checkSummary(game: Game, summary: Extract<GameEvent, { type: 'roundScored' }>['summary']) {
    tally.reasons.add(summary.reason)
    const total = summary.points.reduce((a, b) => a + b, 0)
    const jack = game.rules.jackOfDiamonds ? -10 : 0
    const expected =
      summary.reason === 'challenge'
        ? 26
        : summary.reason === 'normal'
          ? MOON_POINTS + jack
          : game.rules.moon === 'othersAdd'
            ? 3 * MOON_POINTS + jack
            : -MOON_POINTS + jack
    if (total !== expected) fail(`a ${summary.reason} round scored ${summary.points}`)
    if (summary.reason === 'challenge' && summary.points.filter((p) => p !== 0).length !== 1) fail(`a challenge scored ${summary.points}`)
    if (summary.scoresAfter.join() !== game.scores.join()) fail(`scores ${game.scores} after a summary of ${summary.scoresAfter}`)
  }

  return { contract, tally }
}
