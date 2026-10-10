import { describe, expect, test } from 'vitest'
import { hasCard } from '../../../kit/cards'
import { type Persona, mindFor } from '../../../kit/mind'
import { search } from '../../../kit/search/search'
import { seatsToAct } from '../engine/apply'
import { availableActions } from '../engine/available'
import { PLAYERS, type RuleOverrides } from '../engine/rules'
import { Table } from '../engine/testing'
import type { Action, View } from '../engine/types'
import { chooseChallenge } from './catch'
import { chooseAction } from './choose'
import { candidates } from './search'
import { checking, full } from './testing'

/**
 * With cheating off the engine refuses any card the rules forbid, the imagined games' cards included, so each
 * rule is played on its own that way. A rollout's card goes wrong only in an imagined deal that calls for it
 * (a seat with no clubs on the first trick, say), and search at every seat imagines the most deals. A game
 * with search at every seat takes most of a second, so with cheating on the variants are played together, in
 * one game that changes every rule. Set SIM_GAMES to play each variant both ways, that many games each
 * (`SIM_GAMES=1 pnpm vitest run src/games/hearts/ai/search-games.test.ts`; `test:soak` leaves this file out).
 */
const SOAK = process.env.SIM_GAMES !== undefined
const GAMES = Number(process.env.SIM_GAMES ?? 1)
const SIM_WORLDS = 2

describe('whole games with the search player (rule 5): it never has an action refused', () => {
  const VARIANTS: [string, RuleOverrides][] = [
    ['Standard', {}],
    ['always pass left', { passing: 'left' }],
    ['no passing', { passing: 'none' }],
    ['points on the first trick', { pointsOnFirstTrick: true }],
    ['queen breaks hearts', { queenBreaksHearts: true }],
    ['the jack of diamonds', { jackOfDiamonds: true }],
    ['shooter subtracts', { moon: 'shooterSubtracts' }],
  ]
  const RULES = SOAK ? VARIANTS : VARIANTS.slice(0, 1)
  const cases: [string, RuleOverrides, (Persona | 'search')[]][] = RULES.flatMap(([name, overrides]): [string, RuleOverrides, (Persona | 'search')[]][] => [
    [`${name}, search at every seat`, overrides, ['search', 'search', 'search', 'search']],
    [`${name}, cheating off`, { ...overrides, allowCheating: false }, ['search', 'search', 'search', 'search']],
  ])
  if (!SOAK) {
    const every: RuleOverrides = { passing: 'left', pointsOnFirstTrick: true, queenBreaksHearts: true, jackOfDiamonds: true, moon: 'shooterSubtracts' }
    cases.push(['every rule changed but no passing, search at every seat', every, ['search', 'search', 'search', 'search']])
    for (const [name, overrides] of VARIANTS.slice(1)) {
      cases.push([`${name}, cheating off`, { ...overrides, allowCheating: false }, ['search', 'search', 'search', 'search']])
    }
  }
  cases.push(['Standard, Sly and Wild cheating and accusing beside two search players', {}, ['search', 'sly', 'search', 'wild']])

  test.each(cases)(`${GAMES} game: %s`, (_, overrides, players) => {
    const tally = { worlds: 0 }
    const game = { ...checking(tally, SIM_WORLDS), candidates: (v: View) => candidates(v) }
    let searched = 0
    for (let seed = 1; seed <= GAMES; seed++) {
      const t = new Table(overrides, seed).do(0, { type: 'start' })
      const seats = players.map((p) => ({ persona: p === 'search' ? ('straight' as const) : p, standIn: false }))
      const mindOf = (seat: number) => mindFor({ seats, aiSalt: t.game.aiSalt, rules: t.game.rules }, seat)
      for (let guard = 0; guard < 20_000 && t.game.phase.kind !== 'gameOver'; guard++) {
        const phase = t.game.phase
        if (phase.kind === 'roundResult') t.do(0, { type: 'nextRound' })
        else if (phase.kind === 'trickPause') t.endPause()
        else {
          const seat = seatsToAct(t.game)[0]
          const view = full(t, seat)
          let action: Action
          if (players[seat] === 'search') {
            const result = search(game, view, mindOf(seat))!
            action = result.action
            searched++
            const can = availableActions(view)
            const legal =
              action.type === 'choosePass'
                ? action.cards.every((c) => hasCard(can.pass, c)) && new Set(action.cards.map((c) => c.rank + c.suit)).size === 3
                : action.type !== 'playCard' || hasCard(can.legal, action.card)
            if (!legal) throw new Error(`seed ${seed}: the search chose ${JSON.stringify(action)} for seat ${seat}, which it may not`)
          } else action = chooseAction(view, mindOf(seat))!
          const rejected = t.try(seat, action)
          if (rejected !== null) throw new Error(`seed ${seed}: ${JSON.stringify(action)} by seat ${seat} (${players[seat]}) refused: ${rejected}`)
          for (let s = 0; s < PLAYERS && (t.game.phase.kind === 'playing' || t.game.phase.kind === 'trickPause'); s++) {
            if (players[s] === 'search') continue
            const accusation = chooseChallenge(full(t, s), mindOf(s))
            if (accusation) t.do(s, accusation)
          }
        }
      }
      expect(t.game.phase.kind).toBe('gameOver')
    }
    expect(searched).toBeGreaterThan(GAMES * 100)
    expect(tally.worlds).toBeGreaterThan(0)
  })
})
