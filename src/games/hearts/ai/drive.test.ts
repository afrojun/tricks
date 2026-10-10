import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { hasCard } from '../../../kit/cards'
import { mindFor } from '../../../kit/mind'
import type { Step } from '../../../kit/module'
import { createGame } from '../engine/apply'
import { availableActions } from '../engine/available'
import { VOID } from '../engine/deals'
import type { RuleOverrides } from '../engine/rules'
import { Table, card, playOf } from '../engine/testing'
import type { Action, Game, GameEvent } from '../engine/types'
import { viewFor } from '../engine/view'
import { chooseChallenge } from './catch'
import { decide, fallbackAction } from './choose'
import { dueStep, reactions } from './drive'
import { chooseAction, fallbackAction as randomFallback } from './random'

/** One human at seat 0 and computers elsewhere, just dealt. */
function withComputers(overrides: RuleOverrides = {}, seed = 3): Table {
  const t = new Table(overrides, seed)
  t.game = { ...createGame(), rules: t.game.rules }
  t.do(null, { type: 'sit', seat: 0, name: 'You' })
  for (const seat of [1, 2, 3]) t.do(0, { type: 'addAi', seat })
  return t.do(0, { type: 'start' })
}

/** Runs every reaction the way a host does, returning what was applied. */
function runReactions(t: Table, events: readonly GameEvent[]): Step<Action>[] {
  const applied: Step<Action>[] = []
  for (const ask of reactions(t.game, events)) {
    const step = ask(t.game)
    if (step && t.try(step.actor, step.action) === null) applied.push(step)
  }
  return applied
}

describe('dueStep', () => {
  test('ticks once a phase deadline has passed', () => {
    const t = new Table({ passing: 'none' }).deal(VOID).play('2c 4d 9c Ac')
    const phase = t.game.phase
    if (phase.kind !== 'trickPause') throw new Error(phase.kind)
    expect(dueStep(t.game, phase.deadline - 1)).toBeNull()
    expect(dueStep(t.game, phase.deadline)).toEqual({ actor: 'system', action: { type: 'tick' } })
  })

  test('is null while nothing is due', () => {
    const t = withComputers()
    expect(t.game.aiActAt).not.toBeNull()
    expect(dueStep(t.game, t.game.aiActAt! - 1)).toBeNull()
    expect(dueStep({ ...t.game, aiActAt: null }, t.now + 60_000)).toBeNull()
  })

  test('starts the next game once everyone at the table has said Again, and not before', () => {
    const t = withComputers()
    const over = (again: number[]): Game => ({ ...t.game, phase: { kind: 'gameOver', again, winner: 0, summary: null as never }, aiActAt: null })
    expect(dueStep(over([]), t.now)).toBeNull()
    const step = dueStep(over([0]), t.now)
    expect(step).toEqual({ actor: 'system', action: { type: 'rematch', now: true } })
    t.game = over([0])
    t.do('system', step!.action)
    expect(t.game.phase.kind).toBe('passing')
  })

  test('is null when the computer time has come but only a human is to act', () => {
    const t = withComputers()
    const game: Game = { ...t.game, phase: { kind: 'roundResult', summary: null as never }, aiActAt: t.now }
    expect(dueStep(game, t.now)).toBeNull()
  })

  test('a computer passes three of its own cards, the same three whenever it is asked', () => {
    const t = withComputers()
    const step = dueStep(t.game, t.game.aiActAt!)!
    expect(step.actor).toBe(1)
    if (step.action.type !== 'choosePass') throw new Error(step.action.type)
    const hand = availableActions(viewFor(t.game, 1)).pass
    expect(step.action.cards).toHaveLength(3)
    expect(step.action.cards.every((c) => hasCard(hand, c))).toBe(true)
    expect(new Set(step.action.cards.map((c) => `${c.rank}${c.suit}`)).size).toBe(3)
    expect(dueStep(t.game, t.game.aiActAt!)).toEqual(step)
    expect(step.fallback).toEqual({ type: 'choosePass', cards: hand.slice(0, 3) })
    t.do(step.actor, step.action)
  })

  test('computers play whole rounds of legal cards beside a human', () => {
    const t = withComputers({}, 5)
    for (let guard = 0; guard < 400 && t.game.phase.kind !== 'roundResult'; guard++) {
      const toAct = t.game.phase.kind === 'passing' ? t.game.phase.chosen.map((c, s) => (c === null ? s : -1)) : []
      if (toAct.includes(0)) {
        const pass = availableActions(viewFor(t.game, 0)).pass
        t.do(0, { type: 'choosePass', cards: pass.slice(0, 3) })
      } else if (t.game.phase.kind === 'playing' && t.game.phase.turn === 0) {
        t.do(0, { type: 'playCard', card: availableActions(viewFor(t.game, 0)).legal[0] })
      } else {
        t.now = Math.max(t.now, Math.min(...[t.game.aiActAt, 'deadline' in t.game.phase ? t.game.phase.deadline : null].filter((x): x is number => x !== null)))
        const step = dueStep(t.game, t.now)!
        expect(step).not.toBeNull()
        t.do(step.actor, step.action)
      }
      const phase = t.game.phase
      if (phase.kind === 'playing' || phase.kind === 'trickPause') {
        expect([...phase.play.tricks.flatMap((x) => x.plays), ...phase.play.current].every((p) => p.broke.length === 0)).toBe(true)
      }
    }
    expect(t.game.phase.kind).toBe('roundResult')
  })

  test('a computer plays the hand-written player’s card for its persona, with the plainest legal card to fall back on', () => {
    const t = withComputers({ passing: 'none' }, 5)
    t.game = { ...t.game, seats: t.game.seats.map((s, seat) => (seat === 0 ? s : { ...s, persona: 'wild' })) }
    t.deal(VOID).play('2c')
    const step = dueStep(t.game, t.game.aiActAt!)!
    const view = viewFor(t.game, 1, 'full')
    expect(step).toEqual({ actor: 1, action: decide(view, { persona: 'wild', salt: t.game.aiSalt })!.action, fallback: fallbackAction(view) })
    expect(decide(view, mindFor(t.game, 1))?.reason).toEqual({ code: 'dumpHigh', card: card('7d') })
  })

  test('a stand-in plays for a human who has been replaced', () => {
    const t = new Table({ passing: 'none' }).deal(VOID)
    t.do('system', { type: 'setConnected', seat: 0, connected: false })
    t.do(1, { type: 'replaceWithAi', seat: 0 })
    const step = dueStep(t.game, t.game.aiActAt!)
    expect(step).toMatchObject({ actor: 0, action: { type: 'playCard', card: { suit: 'clubs', rank: '2' } } })
  })
})

describe('the random player', () => {
  test('its choices come from the round’s salt, so a decision never changes when asked again', () => {
    const t = new Table({ passing: 'none' }).deal(VOID).play('2c')
    const view = viewFor(t.game, 1, 'full')
    const picks = new Set<string>()
    for (let salt = 1; salt <= 40; salt++) {
      const action = chooseAction(view, { persona: 'straight', salt })
      expect(chooseAction(view, { persona: 'straight', salt })).toEqual(action)
      if (action?.type !== 'playCard') throw new Error('expected a card')
      expect(hasCard(availableActions(view).legal, action.card)).toBe(true)
      picks.add(`${action.card.rank}${action.card.suit}`)
    }
    expect(picks.size).toBeGreaterThan(3)
  })

  test('nothing to do is nothing chosen', () => {
    const t = new Table({ passing: 'none' }).deal(VOID)
    expect(chooseAction(viewFor(t.game, 1, 'full'), mindFor(t.game, 1))).toBeNull()
    expect(randomFallback(viewFor(t.game, 1, 'full'))).toBeNull()
    expect(randomFallback(viewFor(t.game, 0, 'full'))).toEqual({ type: 'playCard', card: { suit: 'clubs', rank: '2' } })
  })
})

describe('reactions', () => {
  // Seat 0 throws a diamond on seat 3's club lead while holding clubs, then follows clubs on the next trick.
  const shownUp = (overrides: RuleOverrides = {}) => {
    const t = withComputers({ passing: 'none', ...overrides })
    t.deal(VOID).play('2c 4d 9c Ac  Qc 2d 5d 10c').endPause().play('Kc 3c')
    return t
  }
  const cardPlayed: GameEvent[] = [{ type: 'cardPlayed', seat: 0, card: { suit: 'clubs', rank: '3' } }]

  test('nothing to react to without a card played', () => {
    expect(reactions(withComputers().game, [{ type: 'seatChanged' }])).toEqual([])
    expect(reactions(withComputers().game, [{ type: 'passChosen', seat: 1 }])).toEqual([])
  })

  test('after a card, a computer accuses a cheat it can prove, about as often as its attention allows', () => {
    const t = shownUp()
    expect(reactions(t.game, cardPlayed)).toHaveLength(4)
    let caught = 0
    for (let salt = 1; salt <= 300; salt++) {
      const game = { ...t.game, aiSalt: salt }
      const action = chooseChallenge(viewFor(game, 2, 'full'), mindFor(game, 2))
      if (action) {
        expect(action).toEqual({ type: 'challengePlay', seat: 0 })
        caught++
      }
    }
    // Straight's attention is 0.6, and the renege was shown up on the very next trick.
    expect(caught / 300).toBeGreaterThan(0.5)
    expect(caught / 300).toBeLessThan(0.7)
  })

  test('a host that runs the reactions sees the round end on a guilty verdict', () => {
    for (let salt = 1; salt <= 20; salt++) {
      const t = shownUp()
      t.game = { ...t.game, aiSalt: salt }
      const applied = runReactions(t, cardPlayed)
      expect(applied.length).toBeLessThanOrEqual(1)
      if (applied.length === 1) {
        expect(applied[0].action).toEqual({ type: 'challengePlay', seat: 0 })
        expect(t.events).toContainEqual(expect.objectContaining({ type: 'challengeResolved', accused: 0, guilty: true }))
        expect(t.game.phase.kind).toBe('roundResult')
      }
    }
  })

  test('computers never accuse an honest table, and never with cheating off', () => {
    const honest = withComputers({ passing: 'none' })
    honest.deal(VOID).play('2c 4d 9c Ac  Qc 3c 5d 10c')
    const off = withComputers({ passing: 'none', allowCheating: false })
    off.deal(VOID).play('2c 4d 9c Ac  Qc 3c 5d 10c')
    for (let salt = 1; salt <= 50; salt++) {
      for (const t of [honest, off]) {
        const game = { ...t.game, aiSalt: salt }
        for (const seat of [1, 2, 3]) expect(chooseChallenge(viewFor(game, seat, 'full'), mindFor(game, seat))).toBeNull()
      }
    }
    expect(playOf(honest.game).tricks.flatMap((x) => x.plays).every((p) => p.broke.length === 0)).toBe(true)
  })
})

describe('the computer players', () => {
  test('decide from a view: only the driver touches the game, to make views', () => {
    const dir = new URL('.', import.meta.url)
    const sources = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    expect(sources).toContain('choose.ts')
    for (const file of sources) {
      const code = readFileSync(new URL(file, dir), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
      // The search player's imagined games, rebuilt from a view, are a game it steps and scores (search-player spec, rule 2).
      // Banter decides nothing: it reads the seats and scores of the game the host hands it, to say something about them.
      // The tests' helpers (testing.ts) decide nothing either: they check each rebuilt game against the view it came from.
      const touches = ['drive.ts', 'imagine.ts', 'banter.ts', 'testing.ts'].includes(file)
      expect({ file, game: /\bGame\b/.test(code), views: /\bviewFor\b/.test(code) }).toEqual({ file, game: touches, views: ['drive.ts', 'testing.ts'].includes(file) })
    }
    // And they hold nothing else: the search decides in `search.ts`, from the view.
    const imagine = readFileSync(new URL('imagine.ts', dir), 'utf8')
    expect([...imagine.matchAll(/^export (?:function|const) (\w+)/gm)].map((m) => m[1]).sort()).toEqual(['fullPlay', 'imagined', 'othersThan', 'rebuild', 'rollout', 'value'])
  })
})
