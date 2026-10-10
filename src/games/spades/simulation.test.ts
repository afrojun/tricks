import { describe, expect, test } from 'vitest'
import { runContract } from '../../kit/contract'
import type { Persona } from '../../kit/mind'
import { contractRules, spadesContract } from './contract'
import { JOKERS_OVERRIDES, type RuleOverrides } from './engine/rules'

/** Raise with SIM_GAMES=400 for a soak run. */
const GAMES = Number(process.env.SIM_GAMES ?? 6)
/** src/kit/search/step.test.ts plays each size's first three seeds, with cheating on and off, so these start after them. */
const FIRST_SEED = 4

describe('the module contract', () => {
  const configs: [string, 2 | 3 | 4, RuleOverrides, (Persona | 'surprise')[]?][] = [
    ['four, Standard', 4, {}],
    ['four, as the shared tests play it', 4, contractRules(4)],
    // A caught Wild raises its side's contract again and again, and with a random partner neither side may ever reach the end.
    ['four, "Bid plus three", no Wild, short game', 4, { renege: 'bidPlusThree', gameEndsAt: 300 }, ['sly', 'sharp', 'straight']],
    ['four, Jokers, lowest club leads, cheating off', 4, { ...JOKERS_OVERRIDES, firstLead: 'lowestClub', allowCheating: false }],
    ['three, as the shared tests play it', 3, contractRules(3)],
    ['three, Standard, short game', 3, { gameEndsAt: 200 }],
    ['two, Standard', 2, {}],
    ['two, Jokers, no bag penalty, cheating off', 2, { ...JOKERS_OVERRIDES, bagPenalty: false, allowCheating: false }],
  ]
  for (const [name, players, overrides, personas] of configs) {
    test(`${GAMES} seeded games keep the contract: ${name}`, () => {
      const { contract, tally } = spadesContract(overrides, players, personas)
      let actions = 0
      let refused = 0
      for (let seed = FIRST_SEED; seed < FIRST_SEED + GAMES; seed++) {
        const run = runContract(contract, seed)
        expect(run.game.phase.kind).toBe('gameOver')
        actions += run.actions
        refused += run.refused
      }
      console.log(
        `${name}: ${actions} actions, phases ${[...tally.phases].sort().join(', ')}, endings: ${[...tally.reasons].sort().join(', ')}; ` +
          `${tally.nils} nils, ${tally.blindNils} blind, ${tally.cheats} cheats, ${tally.accusations} accusations, ${tally.caught} guilty by computers, ${refused} refused`,
      )
      expect(tally.reasons).toContain('normal')
      if (players === 2) expect(tally.phases).toContain('drawing')
      if (overrides.blindNil) expect(tally.blindNils).toBeGreaterThan(0)
      if (overrides.blindNil && players === 4) expect(tally.phases).toContain('exchanging')
      if (overrides.allowCheating === false) {
        expect(tally.cheats).toBe(0)
        expect(tally.accusations).toBe(0)
        expect(refused).toBeGreaterThan(0)
      } else {
        expect(tally.cheats).toBeGreaterThan(GAMES)
        expect(tally.accusations).toBeGreaterThan(0)
      }
    }, Math.max(120_000, GAMES * 10_000))
  }
})
