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

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/**
 * Mean and 95% interval half-width of independent observations. Rounds of one
 * deal are related, so callers pass one observation per deal. `z` widens it
 * for several comparisons at once.
 */
function interval(xs: readonly number[], z = 1.96): { mean: number; half: number } {
  const m = mean(xs)
  const variance = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)
  return { mean: m, half: z * Math.sqrt(variance / xs.length) }
}

/** z for four two-sided comparisons at an overall 95%: 0.05 / 4 each (Bonferroni). */
const Z_FOUR = 2.498

const show = ({ mean, half }: { mean: number; half: number }) => `${mean.toFixed(3)} [${(mean - half).toFixed(3)}, ${(mean + half).toFixed(3)}]`

describe('strength on duplicate deals', () => {
  test(`${DEALS} deals: the hand-written player at each seat in turn against three random players`, () => {
    // One observation per deal for each figure: the mean of its rounds.
    const byDeal: number[] = []
    const written: number[] = []
    const random: number[] = []
    const byDirection = new Map<PassDirection, number[]>(DIRECTIONS.map((d) => [d, []]))
    for (let deal = 1; deal <= DEALS; deal++) {
      const hands = handsOf(deal)
      const differences: number[] = []
      const mine: number[] = []
      const theirs: number[] = []
      for (const direction of DIRECTIONS) {
        const start = dealt(hands, direction)
        const base = playRound(start, [RANDOM, RANDOM, RANDOM, RANDOM], deal)
        const here: number[] = []
        for (let seat = 0; seat < PLAYERS; seat++) {
          const players = [RANDOM, RANDOM, RANDOM, RANDOM]
          players[seat] = WRITTEN
          const points = playRound(start, players, deal)[seat]
          mine.push(points)
          theirs.push(base[seat])
          here.push(points - base[seat])
        }
        byDirection.get(direction)!.push(mean(here))
        differences.push(...here)
      }
      byDeal.push(mean(differences))
      written.push(mean(mine))
      random.push(mean(theirs))
    }
    const difference = interval(byDeal)
    console.log(
      `strength, ${DEALS} deals x ${DIRECTIONS.length} directions x ${PLAYERS} seats, intervals over deals: ` +
        `hand-written ${show(interval(written))}, random ${show(interval(random))} points per round; ` +
        `difference ${show(difference)}; by direction: ` +
        DIRECTIONS.map((d) => `${d} ${show(interval(byDirection.get(d)!))}`).join(', '),
    )
    expect(difference.mean + difference.half).toBeLessThan(-1)
  }, 600_000)

  test(`${DEALS} deals: four hand-written players take 6.5 points per round each, and no seat bias is detected`, () => {
    // By deal: the table's mean points per seat per round, and each seat's mean minus the table's.
    const table: number[] = []
    const bySeat: number[][] = Array.from({ length: PLAYERS }, () => [])
    let rounds = 0
    let moons = 0
    let total = 0
    for (let deal = 1; deal <= DEALS; deal++) {
      const hands = handsOf(deal)
      const sums = Array.from({ length: PLAYERS }, () => 0)
      for (const direction of DIRECTIONS) {
        const points = playRound(dealt(hands, direction), [WRITTEN, WRITTEN, WRITTEN, WRITTEN], deal)
        const sum = points.reduce((a, b) => a + b, 0)
        if (sum !== MOON_POINTS) moons++
        rounds++
        total += sum
        points.forEach((p, seat) => (sums[seat] += p))
      }
      const here = mean(sums) / DIRECTIONS.length
      table.push(here)
      sums.forEach((sum, seat) => bySeat[seat].push(sum / DIRECTIONS.length - here))
    }
    console.log(
      `self-play, ${rounds} rounds in ${DEALS} deals: ${show(interval(table))} points per seat per round over deals, ${moons} moons; ` +
        `each seat minus the table, over deals, intervals for four seats at once: ${bySeat.map((xs) => show(interval(xs, Z_FOUR))).join(', ')}`,
    )
    // 26 points a round, a quarter to each seat; a moon (others add) puts 78 on the table instead.
    expect(total / (PLAYERS * rounds)).toBeCloseTo((MOON_POINTS * rounds + 2 * MOON_POINTS * moons) / (PLAYERS * rounds), 9)
    expect(moons / rounds).toBeLessThan(0.05)
    // No seat bias detected: every seat's interval, taken four at once, includes zero. This does not prove there is none.
    for (const xs of bySeat) {
      const { mean, half } = interval(xs, Z_FOUR)
      expect(Math.abs(mean)).toBeLessThan(half)
    }
  }, 600_000)
})
