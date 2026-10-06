/** Thunee's side of the module contract: its random legal player, its mischief, and what each seat may not see. For tests. */
import { chooseJodhi } from '../../ai/choose'
import {
  type Action,
  type Game,
  type GameEvent,
  type Persona,
  type RoundSummary,
  type RuleOverrides,
  type View,
  SUITS,
  availableActions,
  seatsToAct,
  seenPlays,
  viewFor,
} from '../../engine'
import type { Contract } from '../../kit/contract'
import { brokenRules } from '../../kit/integrity'
import { HONEST } from '../../kit/mind'
import { type Seat, allSeats } from '../../kit/table'
import { thunee } from '.'

/** What a run saw, to show the mischief reached the corners it should. */
export interface ThuneeTally {
  reasons: Set<string>
  /** Rule-breaking cards accepted. */
  cheats: number
  accusations: number
}

const pick = <T>(items: readonly T[], rng: () => number): T => items[Math.floor(rng() * items.length)]

/**
 * Whether a trump has been chosen, is not yet revealed, and this seat (or a spectator) may not
 * know it. Only the trumper knows it, and in a Thunee round not even the trumper. That is in the
 * Thunee window, in play until the first card (or the Thunee caller's), and in a trick's pause
 * should one ever come before then; the engine reveals it within the first trick.
 */
export function trumpHiddenFrom(game: Game, seat: Seat | null): boolean {
  const phase = game.phase
  if (phase.kind === 'thuneeWindow') return seat !== phase.trumper
  if (phase.kind !== 'playing' && phase.kind !== 'trickPause') return false
  const play = phase.play
  if (play.trump === null || play.trumpRevealed) return false
  return seat !== play.trumper || play.thunee !== null
}

const PERSONAS: (Persona | 'surprise')[] = ['surprise', 'sharp', 'wild']

export function thuneeContract(overrides: RuleOverrides, playerCount: 2 | 4): { contract: Contract<Game, Action, GameEvent, View>; tally: ThuneeTally } {
  const tally: ThuneeTally = { reasons: new Set(), cheats: 0, accusations: 0 }
  const fail = (message: string): never => {
    throw new Error(message)
  }

  const contract: Contract<Game, Action, GameEvent, View> = {
    module: thunee,

    start(ctx) {
      let game = thunee.createGame()
      const run = (actor: Seat | null, action: Action) => {
        const result = thunee.apply(game, actor, action, ctx)
        if ('rejected' in result) fail(`setup ${action.type} refused: ${result.rejected}`)
        else game = result.game
      }
      run(null, { type: 'sit', seat: 0, name: 'You' })
      if (playerCount === 2) run(0, { type: 'setPlayerCount', playerCount: 2 })
      for (const seat of allSeats(playerCount).slice(1)) run(0, { type: 'addAi', seat, persona: PERSONAS[seat - 1] })
      run(0, { type: 'setRules', overrides })
      run(0, { type: 'start' })
      return game
    },

    legal(game, seat, rng) {
      const can = availableActions(viewFor(game, seat))
      const phase = game.phase
      if (can.nextRound) return { type: 'nextRound' }
      // An honest Jodhi, when the computer's own judgement would claim one.
      if (phase.kind === 'playing' || phase.kind === 'trickPause') {
        const claim = chooseJodhi(viewFor(game, seat, 'full'), HONEST)
        if (claim) return claim
      }
      if (!seatsToAct(game).includes(seat)) return null
      if (can.calls.length > 0 && (rng() < 0.3 || !can.pass)) return { type: 'call', amount: can.calls[0] }
      if (can.chooseTrump.length > 0) return { type: 'chooseTrump', choice: pick(can.chooseTrump, rng) }
      if (can.callThunee && rng() < 0.03) return { type: 'callThunee' }
      if (can.callKhanaak && rng() < 0.05) return { type: 'callKhanaak' }
      if (can.callDouble && rng() < 0.3) return { type: 'callDouble' }
      if (phase.kind === 'playing' && can.legal.length > 0) return { type: 'playCard', card: pick(can.legal, rng) }
      return can.pass ? { type: 'pass' } : null
    },

    mischief(game, rng) {
      const phase = game.phase
      if (phase.kind !== 'playing' && phase.kind !== 'trickPause') return null
      const r = rng()
      if (phase.kind === 'playing' && r < 0.02) {
        // Any card from the hand, whatever the rules say: refused while cheating is off.
        return { actor: phase.turn, action: { type: 'playCard', card: pick(phase.play.hands[phase.turn], rng) } }
      }
      if (r < 0.03) {
        // A Jodhi bluffed, or not: refused with cheating off unless it is true.
        const seat = Math.floor(rng() * game.playerCount)
        const suits = availableActions(viewFor(game, seat)).claimJodhi
        if (suits.length > 0) return { actor: seat, action: { type: 'claimJodhi', suit: pick(SUITS, rng), withJack: rng() < 0.5 } }
      }
      if (r > 0.995) {
        const seat = Math.floor(rng() * game.playerCount)
        const can = availableActions(viewFor(game, seat))
        if (can.challengeJodhi.length > 0 && rng() < 0.5) return { actor: seat, action: { type: 'challengeJodhi', claim: pick(can.challengeJodhi, rng) } }
        const targets = can.challengePlay.length > 0 ? can.challengePlay : allSeats(game.playerCount).filter((s) => s !== seat)
        return { actor: seat, action: { type: 'challengePlay', seat: pick(targets, rng) } }
      }
      return null
    },

    hidden(game, seat) {
      const phase = game.phase
      const hands = 'hands' in phase ? phase.hands : 'play' in phase ? phase.play.hands : null
      if (hands === null) return []
      const stock = 'stock' in phase ? phase.stock : 'play' in phase ? phase.play.stock : []
      // Cards of tricks before the last one have been turned down and must be gone from the view too.
      const forgotten = 'play' in phase ? phase.play.tricks.slice(0, -1).flatMap((t) => t.plays.map((p) => p.card)) : []
      return [...hands.filter((_, s) => s !== seat).flat(), ...stock, ...forgotten]
    },

    secrets: ['handBefore', 'broke', 'valid', 'stock', 'dealt', 'aiSalt'],

    checkView(game, seat, view) {
      return trumpHiddenFrom(game, seat) && JSON.stringify(view).includes('"trump":"') ? 'shows trump before it is revealed' : null
    },

    check(game, events) {
      for (const e of events) {
        if (e.type === 'challengeResolved') {
          tally.accusations++
          if (!game.rules.allowCheating) fail('an accusation with cheating off')
        }
        if (e.type === 'roundScored') checkSummary(game, e.summary)
      }

      const phase = game.phase
      if (phase.kind !== 'playing' && phase.kind !== 'trickPause') return
      const play = phase.play
      if (events.some((e) => e.type === 'cardPlayed')) {
        const records = [...play.tricks.flatMap((t) => t.plays), ...play.current]
        if (records[records.length - 1].broke.length > 0) tally.cheats++
        // One description: the record agrees with the excuses an observer derives from public cards.
        const seen = seenPlays(viewFor(game, records.length % game.playerCount, 'full'))
        if (seen.length !== records.length) fail(`an observer sees ${seen.length} plays of ${records.length}`)
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
      }
    },
  }

  function checkSummary(game: Game, summary: RoundSummary) {
    tally.reasons.add(summary.reason)
    if (summary.reason === 'normal' && summary.cardPoints[0] + summary.cardPoints[1] !== 304) fail(`a normal round counted ${summary.cardPoints}`)
    if (summary.ballsAfter.join() !== game.balls.join()) fail(`balls ${game.balls} after a summary of ${summary.ballsAfter}`)
  }

  return { contract, tally }
}
