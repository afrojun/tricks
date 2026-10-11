import { describe, expect, test } from 'vitest'
import { type Action, type Actor, type Persona, type RuleOverrides, SUITS, availableActions, createGame, nextDeadline, sameCard, seatsToAct, viewFor } from '../engine'
import { ALTERNATIVES, Table, seededRng } from '../engine/testing'
import { chooseAction } from './choose'
import { dueStep, reactions } from './drive'
import { HONEST } from '../../../kit/mind'

/**
 * Pins what computers decide. Seeded whole games: computers of every persona driven only
 * through `dueStep` and `reactions`, as a host drives them, and one human at seat 0 who takes
 * the honest choice and now and then breaks a rule, bluffs a Jodhi or accuses someone. Every
 * accepted action, with its actor, is folded into one hash: a change to which actions are taken,
 * or in what order, fails here. Times are not hashed, so a change of computer delay that keeps
 * the order passes. A refused computer decision would let a fallback stand in for it, so the
 * test also requires that none is refused. A deliberate change to how computers play changes
 * the hash too: make sure the change was meant, then update it.
 */
function playGame(playerCount: 2 | 4, personas: (Persona | 'surprise')[], overrides: RuleOverrides, seed: number) {
  const t = new Table(4, { ...overrides, ballsToWin: 6 }, seed)
  t.game = { ...createGame(), rules: t.game.rules, settings: t.game.settings }
  t.do(null, { type: 'sit', seat: 0, name: 'You' })
  if (playerCount === 2) t.do(0, { type: 'setPlayerCount', playerCount: 2 })
  personas.forEach((persona, i) => t.do(0, { type: 'addAi', seat: i + 1, persona }))
  const chaos = seededRng(seed * 7919 + 1)
  const pick = <T,>(items: readonly T[]) => items[Math.floor(chaos() * items.length)]
  const log: string[] = []
  /** Computer decisions the engine refused: a primary choice from `dueStep`, or a reaction. */
  let refused = 0

  /** Applies an action and then every computer reaction to it, as a host does. */
  const act = (actor: Actor, action: Action): boolean => {
    const before = t.events.length
    if (t.try(actor, action) !== null) return false
    log.push(`${actor}:${JSON.stringify(action)}`)
    for (const ask of reactions(t.game, t.events.slice(before))) {
      const step = ask(t.game)
      if (step && !act(step.actor, step.action)) refused++
    }
    return true
  }

  act(0, { type: 'start' })
  for (let guard = 0; guard < 20_000 && t.game.phase.kind !== 'gameOver'; guard++) {
    const step = dueStep(t.game, t.now)
    if (step) {
      if (act(step.actor, step.action)) continue
      if (step.actor !== 'system') refused++
      if (step.fallback) act(step.actor, step.fallback)
      continue
    }
    const phase = t.game.phase
    if (phase.kind === 'roundResult') {
      act(0, { type: 'nextRound' })
      continue
    }
    const can = availableActions(viewFor(t.game, 0))
    if ((phase.kind === 'playing' || phase.kind === 'trickPause') && chaos() < 0.01) {
      if (can.claimJodhi.length > 0) act(0, { type: 'claimJodhi', suit: pick(SUITS), withJack: chaos() < 0.3 })
      else if (can.challengePlay.length > 0 && chaos() < 0.3) act(0, { type: 'challengePlay', seat: pick(can.challengePlay) })
      continue
    }
    if (seatsToAct(t.game).includes(0)) {
      // Now and then a card that breaks a rule, if there is one.
      const cheats = can.play.filter((c) => !can.legal.some((l) => sameCard(l, c)))
      const careless = cheats.length > 0 && chaos() < 0.25
      act(0, careless ? { type: 'playCard', card: pick(cheats) } : chooseAction(viewFor(t.game, 0, 'full'), HONEST))
      continue
    }
    const next = nextDeadline(t.game)
    if (next === null) throw new Error(`seed ${seed}: stuck in ${phase.kind}`)
    t.now = Math.max(t.now, next)
  }
  expect(t.game.phase.kind).toBe('gameOver')
  return { log, refused }
}

/** FNV-1a over every line, as an unsigned hex string. */
function hash(lines: readonly string[]): string {
  let h = 2166136261
  for (const line of lines) {
    for (const ch of `${line}\n`) {
      h ^= ch.charCodeAt(0)
      h = Math.imul(h, 16777619) >>> 0
    }
  }
  return h.toString(16).padStart(8, '0')
}

describe('what computers decide', () => {
  const configs: [string, 2 | 4, (Persona | 'surprise')[], RuleOverrides, number][] = [
    ['4P traditional, every persona', 4, ['sly', 'sharp', 'wild'], {}, 8],
    ['4P traditional, sly computers', 4, ['sly', 'sly', 'sly'], {}, 24],
    ['4P alternatives, cheats and a surprise', 4, ['wild', 'surprise', 'sly'], ALTERNATIVES, 6],
    ['4P traditional, straight computers', 4, ['straight', 'straight', 'straight'], {}, 3],
    ['2P traditional, sly', 2, ['sly'], {}, 6],
    ['2P alternatives, wild', 2, ['wild'], ALTERNATIVES, 6],
  ]

  test('are pinned, so any change to them is deliberate', () => {
    const lines: string[] = []
    const hashes: Record<string, string> = {}
    let refused = 0
    for (const [name, playerCount, personas, overrides, games] of configs) {
      const mine: string[] = []
      for (let seed = 1; seed <= games; seed++) {
        const game = playGame(playerCount, personas, overrides, seed)
        mine.push(...game.log)
        refused += game.refused
      }
      hashes[name] = hash(mine)
      lines.push(...mine)
    }
    // Every computer decision was accepted as made: no fallback ever stood in for one.
    expect(refused).toBe(0)
    // The games must reach the computers' accusations, or this pins little.
    expect(lines.filter((l) => l.includes('"challenge') && !l.startsWith('0:')).length).toBeGreaterThan(20)
    expect({ actions: lines.length, hashes }).toEqual({
      actions: 6423,
      hashes: {
        '4P traditional, every persona': 'd4217f11',
        '4P traditional, sly computers': 'faaf7e70',
        '4P alternatives, cheats and a surprise': '3321ffbb',
        '4P traditional, straight computers': 'b27a8c49',
        '2P traditional, sly': '83dc4a1c',
        '2P alternatives, wild': 'a77ec8d5',
      },
    })
  })
})
