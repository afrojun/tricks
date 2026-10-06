import { describe, expect, test } from 'vitest'
import { runContract } from '../../kit/contract'
import { heartsContract } from './contract'
import { OMNIBUS_OVERRIDES, type RuleOverrides } from './engine/rules'

/** Raise with SIM_GAMES=400 for a soak run. A game of Hearts is several hundred actions, so the default is small. */
const GAMES = Number(process.env.SIM_GAMES ?? 10)

describe('the module contract', () => {
  const configs: [string, RuleOverrides][] = [
    ['Standard', {}],
    ['Standard, cheating off', { allowCheating: false }],
    ['Omnibus, shooter subtracts, queen breaks hearts, short game', { ...OMNIBUS_OVERRIDES, moon: 'shooterSubtracts', queenBreaksHearts: true, gameEndsAt: 50 }],
    ['points on the first trick, always pass left, cheating off', { pointsOnFirstTrick: true, passing: 'left', allowCheating: false }],
    ['no passing, long game', { passing: 'none', gameEndsAt: 150 }],
  ]
  for (const [name, overrides] of configs) {
    test(`${GAMES} seeded games keep the contract: ${name}`, () => {
      const { contract, tally } = heartsContract(overrides)
      let actions = 0
      let refused = 0
      for (let seed = 1; seed <= GAMES; seed++) {
        const run = runContract(contract, seed)
        expect(run.game.phase.kind).toBe('gameOver')
        actions += run.actions
        refused += run.refused
      }
      console.log(
        `${name}: ${actions} actions, endings: ${[...tally.reasons].sort().join(', ')}; ` +
          `${tally.cheats} cheats, ${tally.accusations} accusations, ${tally.caught} guilty by computers, ${tally.hunches} computer hunches wrong, ${refused} refused`,
      )
      expect(actions).toBeGreaterThan(GAMES * 150)
      expect(tally.reasons).toContain('normal')
      // The mischief must reach the corners it is meant to, or this test proves little.
      if (overrides.allowCheating === false) {
        expect(tally.cheats).toBe(0)
        expect(tally.accusations).toBe(0)
        expect(refused).toBeGreaterThan(0)
      } else {
        expect(tally.cheats).toBeGreaterThan(GAMES)
        expect(tally.reasons).toContain('challenge')
        expect(tally.caught).toBeGreaterThan(0)
      }
    }, Math.max(120_000, GAMES * 10_000))
  }
})
