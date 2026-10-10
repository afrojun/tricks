/**
 * How strong the hand-written player is, on duplicate deals: each deal is played once with random legal players
 * at every seat, and once with the hand-written player for one side and random players for the rest, every side
 * taken in turn, so luck in the deal cancels. The side's round points should be clearly higher.
 *
 * Rerun the full measurement with SIM_DEALS=500.
 */
import { describe, expect, test } from 'vitest'
import { type Mind, roll } from '../../../kit/mind'
import { allSeats } from '../../../kit/table'
import { seatsToAct } from '../engine/apply'
import { availableActions } from '../engine/available'
import { EXCHANGE_SIZE, seatsOf, sideCount } from '../engine/rules'
import { Table } from '../engine/testing'
import type { Action, Game, View } from '../engine/types'
import { viewFor } from '../engine/view'
import { chooseAction } from './choose'

const DEALS = Number(process.env.SIM_DEALS ?? 30)

type Player = (view: View, mind: Mind) => Action | null

/** Legal at random, from the round's salt: calls, draws and cards alike. */
const RANDOM: Player = (view, mind) => {
  const me = view.seat!
  const can = availableActions(view)
  const pick = <T>(items: readonly T[], id: string) => items[Math.floor(roll(mind.salt, me, id) * items.length)]
  const phase = view.phase
  const at = phase.kind === 'playing' ? `${phase.tricks.length}:${phase.current.length}` : phase.kind
  if (can.draw) return { type: 'draw', keep: roll(mind.salt, me, `draw:${'stockCount' in phase ? phase.stockCount : 0}`) < 0.5 }
  if (can.look) return { type: 'lookAtHand' }
  if (can.calls.length > 0) return { type: 'call', tricks: pick(can.calls, 'call') }
  if (can.give.length > 0) return { type: 'giveCards', cards: can.give.slice(0, EXCHANGE_SIZE) }
  if (can.legal.length > 0) return { type: 'playCard', card: pick(can.legal, `play:${at}`) }
  return null
}
const WRITTEN: Player = chooseAction

/** A round from the start, as `seed` deals it, played out by `players`; each side's points. */
function playRound(count: 2 | 3 | 4, seed: number, players: Player[]): number[] {
  const t = new Table(count, {}, seed).begin()
  let game: Game = t.game
  for (let guard = 0; guard < 2000; guard++) {
    const phase = game.phase
    if (phase.kind === 'roundResult' || phase.kind === 'gameOver') return phase.summary.sides.map((s) => s.points)
    if (phase.kind === 'trickPause') {
      t.now = phase.deadline
      t.game = game
      t.do('system', { type: 'tick' })
      game = t.game
      continue
    }
    const [seat] = seatsToAct(game)
    const action = players[seat](viewFor(game, seat, 'full'), { persona: 'straight', salt: game.aiSalt })
    if (action === null) throw new Error(`seat ${seat} has nothing to do in ${phase.kind}`)
    t.game = game
    t.do(seat, action)
    game = t.game
  }
  throw new Error('the round did not finish')
}

describe('the hand-written player', () => {
  for (const count of [4, 3, 2] as const) {
    test(`clearly beats random legal play, with ${count} players, on ${DEALS} duplicate deals and every side in turn`, () => {
      const gains: number[] = []
      for (let deal = 1; deal <= DEALS; deal++) {
        const random = playRound(count, deal, allSeats(count).map(() => RANDOM))
        for (let side = 0; side < sideCount(count); side++) {
          const players = allSeats(count).map((s) => (seatsOf(side, count).includes(s) ? WRITTEN : RANDOM))
          gains.push(playRound(count, deal, players)[side] - random[side])
        }
      }
      const mean = gains.reduce((a, b) => a + b, 0) / gains.length
      const sd = Math.sqrt(gains.reduce((a, b) => a + (b - mean) ** 2, 0) / (gains.length - 1))
      const low = mean - (1.96 * sd) / Math.sqrt(gains.length)
      console.log(`${count} players: the written player gains ${mean.toFixed(1)} points a round, 95% from ${low.toFixed(1)}`)
      expect(low).toBeGreaterThan(0)
    }, 120_000)
  }
})
