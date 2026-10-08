import { describe, expect, test } from 'vitest'
import { type Action, type Actor, type Game, type GameEvent, createGame, viewFor } from '../engine'
import { Table } from '../engine/testing'
import { chooseAction, fallbackAction } from './choose'
import { type Step, dueStep, reactions } from './drive'
import { mindFor } from '../../../kit/mind'

/** A four-seat game with one human at seat 0 and computers elsewhere, just dealt. */
function withComputers(seed = 3): Table {
  const t = new Table(4, {}, seed)
  t.game = { ...createGame(), rules: t.game.rules }
  t.do(null, { type: 'sit', seat: 0, name: 'You' })
  for (const seat of [1, 2, 3]) t.do(0, { type: 'addAi', seat })
  t.do(0, { type: 'start' })
  return t
}

/** Runs every reaction the way a host does, recording what was applied. */
function runReactions(t: Table, events: readonly GameEvent[], applied: { actor: Actor; action: Action }[]) {
  for (const ask of reactions(t.game, events)) {
    const step = ask(t.game)
    if (step && t.try(step.actor, step.action) === null) applied.push(step)
  }
}

describe('dueStep', () => {
  test('a computer playing for a person answers the wait for their Jodhi', () => {
    // D1-style hands: seat 2 wins the first trick for team 0; seat 0 holds the king and queen of spades.
    const t = new Table(4, { redealIfNoTrumps: false, timers: true })
      .deal(['Jh 9h Ks Qs 10c Qd', 'Js 9s As 10s Kd Qc', 'Jc 9c Ac Kc Ah 10h', 'Jd 9d Ad 10d Kh Qh'])
      .toPlay('spades')
    t.game = { ...t.game, rules: { ...t.game.rules, timers: false }, seats: t.game.seats.map((s, i) => (i === 0 || i === 2 ? { ...s, standIn: true } : s)) }
    t.play('Jc Qh 10c Qc')
    expect(t.game.phase).toMatchObject({ kind: 'trickPause', deadline: null })
    const step = dueStep(t.game, t.now + 60_000)
    expect(step).toMatchObject({ actor: 0, action: { type: 'claimJodhi', suit: 'spades' } })
    t.do(step!.actor, step!.action)
    expect(t.game.phase).toMatchObject({ kind: 'playing', turn: 2 })
  })

  test('ticks once a phase deadline has passed', () => {
    const t = withComputers()
    const phase = t.game.phase as Extract<Game['phase'], { deadline: number | null }>
    expect(dueStep(t.game, phase.deadline!)).toEqual({ actor: 'system', action: { type: 'tick' } })
  })

  test('is null while nothing is due', () => {
    const t = withComputers()
    const game: Game = { ...t.game, aiActAt: null }
    expect(dueStep(game, t.now)).toBeNull()
  })

  test("gives a due computer seat's own choice, with a fallback", () => {
    const t = withComputers()
    // Close the call window so a single seat is to act.
    for (let i = 0; i < 50 && t.game.phase.kind === 'calling'; i++) t.advance(20_000)
    const game = t.game
    expect(game.aiActAt).not.toBeNull()
    const step = dueStep(game, game.aiActAt!) as Step
    const seat = step.actor as number
    const view = viewFor(game, seat, 'full')
    expect(step.action).toEqual(chooseAction(view, mindFor(game, seat)))
    expect(step.fallback).toEqual(fallbackAction(view))
  })

  test('is null when the computer time has come but only the human is to act', () => {
    const t = withComputers()
    const game: Game = { ...t.game, phase: { kind: 'roundResult', summary: null as never }, aiActAt: t.now }
    expect(dueStep(game, t.now)).toBeNull()
  })
})

describe('reactions', () => {
  test('nothing to react to without a play, claim or trick', () => {
    const t = withComputers()
    expect(reactions(t.game, [{ type: 'seatChanged' }])).toEqual([])
  })

  test('a trick won asks only computers of the winning team about a Jodhi, then every seat about a challenge', () => {
    const t = withComputers()
    const asks = reactions(t.game, [{ type: 'trickWon', seat: 1, points: 0 }])
    // Seats 1 and 3 (team 1) for Jodhi; no card or claim, so no challenge questions.
    expect(asks).toHaveLength(2)
  })

  test('a card played asks every seat about a challenge, and a human seat never answers', () => {
    const t = withComputers()
    const asks = reactions(t.game, [{ type: 'cardPlayed', seat: 0, card: { suit: 'hearts', rank: 'J' } }])
    expect(asks).toHaveLength(4)
    // Not in play: nobody may challenge.
    for (const ask of asks) expect(ask(t.game)).toBeNull()
  })

  test('a host that runs the reactions applies nothing for an honest opening play', () => {
    const t = withComputers()
    const applied: { actor: Actor; action: Action }[] = []
    runReactions(t, [{ type: 'cardPlayed', seat: 0, card: { suit: 'hearts', rank: 'J' } }], applied)
    expect(applied).toEqual([])
  })
})
