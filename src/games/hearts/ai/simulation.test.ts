import { describe, expect, test } from 'vitest'
import { hasCard } from '../../../kit/cards'
import { type Persona, mindFor } from '../../../kit/mind'
import { seatsToAct } from '../engine/apply'
import { availableActions } from '../engine/available'
import { PASS_SIZE, type RuleOverrides } from '../engine/rules'
import { Table, playOf } from '../engine/testing'
import { viewFor } from '../engine/view'
import { chooseChallenge } from './catch'
import { decide } from './choose'

/** Raise with SIM_GAMES=100 for a soak run. A game of Hearts is several hundred actions, so the default is small. */
const GAMES = Number(process.env.SIM_GAMES ?? 3)

interface Tally {
  rounds: number
  honest: number
  reasons: Map<string, number>
  endings: Set<string>
}

/**
 * A whole game of computers with these personas, every seat watching after
 * every card. Every action a Straight seat chooses must be legal, accepted at
 * once (so the fallback is never needed), break no rule, and come out the same
 * when asked again.
 */
function playGame(overrides: RuleOverrides, personas: Persona[], seed: number, tally: Tally) {
  const t = new Table(overrides, seed).do(0, { type: 'start' })
  const seats = personas.map((persona) => ({ persona, standIn: false }))
  const mind = (seat: number) => mindFor({ seats, aiSalt: t.game.aiSalt, rules: t.game.rules }, seat)
  const inPlay = () => t.game.phase.kind === 'playing' || t.game.phase.kind === 'trickPause'

  for (let guard = 0; guard < 20_000 && t.game.phase.kind !== 'gameOver'; guard++) {
    const phase = t.game.phase
    if (phase.kind === 'roundResult') {
      tally.rounds++
      tally.endings.add(phase.summary.reason)
      t.do(0, { type: 'nextRound' })
      continue
    }
    if (phase.kind === 'trickPause') {
      t.endPause()
      continue
    }
    const seat = seatsToAct(t.game)[0]
    const view = viewFor(t.game, seat, 'full')
    const decision = decide(view, mind(seat))
    if (decision === null) throw new Error(`seed ${seed}: seat ${seat} has nothing to do in ${phase.kind}`)
    expect(decide(viewFor(t.game, seat, 'full'), mind(seat))).toEqual(decision)
    const { action, reason } = decision
    if (mind(seat).persona === 'straight') {
      tally.honest++
      tally.reasons.set(reason.code, (tally.reasons.get(reason.code) ?? 0) + 1)
      const can = availableActions(view)
      if (action.type === 'choosePass') {
        expect(action.cards).toHaveLength(PASS_SIZE)
        expect(new Set(action.cards.map((c) => `${c.rank}${c.suit}`)).size).toBe(PASS_SIZE)
        expect(action.cards.every((c) => hasCard(can.pass, c))).toBe(true)
      } else if (action.type === 'playCard') {
        expect(hasCard(can.legal, action.card)).toBe(true)
      } else throw new Error(`seed ${seed}: seat ${seat} chose ${action.type}`)
    }
    const rejected = t.try(seat, action)
    if (rejected !== null) throw new Error(`seed ${seed}: ${JSON.stringify(action)} by seat ${seat} (${mind(seat).persona}) rejected: ${rejected}`)
    if (action.type === 'playCard' && mind(seat).persona === 'straight' && inPlay()) {
      const play = playOf(t.game)
      const record = play.current.at(-1) ?? play.tricks.at(-1)!.plays.at(-1)!
      expect(record.broke).toEqual([])
    }
    for (let s = 0; s < personas.length && inPlay(); s++) {
      const challenge = chooseChallenge(viewFor(t.game, s, 'full'), mind(s))
      if (challenge) t.do(s, challenge)
    }
  }
  expect(t.game.phase.kind).toBe('gameOver')
}

const RULES: [string, RuleOverrides][] = [
  ['Standard', {}],
  ['always pass left', { passing: 'left' }],
  ['no passing', { passing: 'none' }],
  ['points on the first trick', { pointsOnFirstTrick: true }],
  ['queen breaks hearts', { queenBreaksHearts: true }],
  ['the jack of diamonds', { jackOfDiamonds: true }],
  ['shooter subtracts', { moon: 'shooterSubtracts' }],
]

describe('the honest player in whole games', () => {
  const cases: [string, RuleOverrides, Persona[]][] = RULES.flatMap(([name, overrides]): [string, RuleOverrides, Persona[]][] => [
    [`${name}, cheats at the table`, overrides, ['straight', 'sly', 'straight', 'wild']],
    [`${name}, cheating off`, { ...overrides, allowCheating: false }, ['sly', 'wild', 'sharp', 'straight']],
  ])
  test.each(cases)(`${GAMES} games: %s`, (name, overrides, personas) => {
    const tally: Tally = { rounds: 0, honest: 0, reasons: new Map(), endings: new Set() }
    for (let seed = 1; seed <= GAMES; seed++) playGame(overrides, personas, seed, tally)
    const reasons = [...tally.reasons].sort((a, b) => b[1] - a[1]).map(([code, n]) => `${code} ${n}`)
    console.log(`${name}: ${tally.rounds} rounds, ${tally.honest} honest actions, endings ${[...tally.endings].sort().join(', ')}; ${reasons.join(', ')}`)
    expect(tally.honest).toBeGreaterThan(GAMES * 100)
  }, Math.max(60_000, GAMES * 20_000))
})
