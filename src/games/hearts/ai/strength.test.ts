/**
 * How strong the hand-written player is, on duplicate deals: each deal is
 * played under every pass direction, once with four random legal players and
 * once with the hand-written player at each seat in turn, so luck in the deal
 * cancels. Points are bad, so the hand-written player should take fewer.
 *
 * Rerun the full measurement with SIM_DEALS=1000.
 */
import { describe, expect, test } from 'vitest'
import { shuffle } from '../../../kit/cards'
import type { Mind } from '../../../kit/mind'
import { seededRng } from '../../../kit/testing'
import { apply, seatsToAct } from '../engine/apply'
import { type Card, createDeck } from '../engine/cards'
import { beginRound } from '../engine/round'
import { HAND_SIZE, MOON_POINTS, PLAYERS, type PassDirection } from '../engine/rules'
import { Table } from '../engine/testing'
import type { Action, Game, View } from '../engine/types'
import { viewFor } from '../engine/view'
import { chooseAction } from './choose'
import { chooseAction as randomAction } from './random'

const DEALS = Number(process.env.SIM_DEALS ?? 20)
const DIRECTIONS: PassDirection[] = ['left', 'right', 'across', 'none']
/** The round of a rotating game that passes each way. */
const ROUND: Record<PassDirection, number> = { left: 1, right: 2, across: 3, none: 4 }

type Player = (view: View, mind: Mind) => Action | null
const RANDOM: Player = randomAction
const WRITTEN: Player = chooseAction

const text = (c: Card) => `${c.rank}${c.suit[0]}`

/** The hands of deal `seed`. */
function handsOf(seed: number): string[] {
  const deck = shuffle(createDeck(), seededRng(seed))
  return Array.from({ length: PLAYERS }, (_, s) => deck.slice(s * HAND_SIZE, (s + 1) * HAND_SIZE).map(text).join(' '))
}

/** A game at the start of the round that passes `direction`, with these hands. */
function dealt(hands: string[], direction: PassDirection): Game {
  const t = new Table({}, 1).do(0, { type: 'start' })
  const game = structuredClone(t.game)
  game.roundNumber = ROUND[direction]
  beginRound(game, t.ctx, [])
  t.game = game
  return t.deal(hands).game
}

/** Plays the round out with these players, every chance drawn from `salt`, and returns each seat's points. */
function playRound(start: Game, players: Player[], salt: number): number[] {
  let game = start
  let now = 0
  const ctx = () => ({ now, rng: () => 0.5 })
  for (let guard = 0; guard < 500; guard++) {
    const phase = game.phase
    if (phase.kind === 'roundResult' || phase.kind === 'gameOver') return phase.summary.points
    let seat: number | 'system' = 'system'
    let action: Action | null = { type: 'tick' }
    if (phase.kind === 'trickPause') now = phase.deadline
    else {
      seat = seatsToAct(game)[0]
      action = players[seat](viewFor(game, seat, 'full'), { persona: 'straight', salt })
    }
    if (action === null) throw new Error(`seat ${seat} has nothing to do in ${phase.kind}`)
    const result = apply(game, seat, action, ctx())
    if ('rejected' in result) throw new Error(`${JSON.stringify(action)} by ${seat} rejected: ${result.rejected}`)
    game = result.game
  }
  throw new Error('the round did not finish')
}

/** Mean and 95% interval half-width of a sample. */
function interval(xs: readonly number[]): { mean: number; half: number } {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1)
  return { mean, half: 1.96 * Math.sqrt(variance / xs.length) }
}

const show = ({ mean, half }: { mean: number; half: number }) => `${mean.toFixed(3)} [${(mean - half).toFixed(3)}, ${(mean + half).toFixed(3)}]`

describe('strength on duplicate deals', () => {
  test(`${DEALS} deals: the hand-written player at each seat in turn against three random players`, () => {
    const byDeal: number[] = []
    const byDirection = new Map<PassDirection, number[]>(DIRECTIONS.map((d) => [d, []]))
    const written: number[] = []
    const random: number[] = []
    for (let deal = 1; deal <= DEALS; deal++) {
      const hands = handsOf(deal)
      let sum = 0
      for (const direction of DIRECTIONS) {
        const start = dealt(hands, direction)
        const base = playRound(start, [RANDOM, RANDOM, RANDOM, RANDOM], deal)
        for (let seat = 0; seat < PLAYERS; seat++) {
          const players = [RANDOM, RANDOM, RANDOM, RANDOM]
          players[seat] = WRITTEN
          const points = playRound(start, players, deal)[seat]
          written.push(points)
          random.push(base[seat])
          byDirection.get(direction)!.push(points - base[seat])
          sum += points - base[seat]
        }
      }
      byDeal.push(sum / (DIRECTIONS.length * PLAYERS))
    }
    const difference = interval(byDeal)
    console.log(
      `strength, ${DEALS} deals x ${DIRECTIONS.length} directions x ${PLAYERS} seats: ` +
        `hand-written ${show(interval(written))}, random ${show(interval(random))} points per round; ` +
        `difference ${show(difference)} paired by deal; by direction: ` +
        DIRECTIONS.map((d) => `${d} ${interval(byDirection.get(d)!).mean.toFixed(2)}`).join(', '),
    )
    expect(difference.mean + difference.half).toBeLessThan(-1)
  }, 600_000)

  test(`${DEALS} deals: four hand-written players take 6.5 points per round each`, () => {
    const bySeat: number[][] = Array.from({ length: PLAYERS }, () => [])
    let moons = 0
    for (let deal = 1; deal <= DEALS; deal++) {
      const hands = handsOf(deal)
      for (const direction of DIRECTIONS) {
        const points = playRound(dealt(hands, direction), [WRITTEN, WRITTEN, WRITTEN, WRITTEN], deal)
        if (points.reduce((a, b) => a + b, 0) !== MOON_POINTS) moons++
        points.forEach((p, seat) => bySeat[seat].push(p))
      }
    }
    const rounds = bySeat[0].length
    const all = interval(bySeat.flat())
    console.log(
      `self-play, ${rounds} rounds: ${show(all)} points per seat per round, ${moons} moons; ` +
        `by seat: ${bySeat.map((xs) => show(interval(xs))).join(', ')}`,
    )
    // 26 points a round, a quarter to each seat; a moon (others add) puts 78 on the table instead.
    expect(all.mean).toBeCloseTo((MOON_POINTS * rounds + 2 * MOON_POINTS * moons) / (PLAYERS * rounds), 9)
    expect(moons / rounds).toBeLessThan(0.05)
    for (const xs of bySeat) expect(Math.abs(interval(xs).mean - 6.5)).toBeLessThan(interval(xs).half + 1)
  }, 600_000)
})
