import { describe, expect, test } from 'vitest'
import { hasCard } from '../../../kit/cards'
import { type Persona, TRAITS, mindFor } from '../../../kit/mind'
import { seatsToAct } from '../engine/apply'
import { availableActions } from '../engine/available'
import type { RuleOverrides } from '../engine/rules'
import { Table, playOf } from '../engine/testing'
import type { Action, View } from '../engine/types'
import { viewFor } from '../engine/view'
import { chooseChallenge, findProofs } from './catch'
import { decide } from './choose'

/** Raise with SIM_GAMES=100 for a soak run. */
const GAMES = Number(process.env.SIM_GAMES ?? 4)

interface Tally {
  /** Rule-breaking cards played. */
  cheats: number
  guilty: number
  innocent: number
  /** Proofs this persona held, counted after every card, each naming a rule the accused really broke. */
  proofs: number
}

const EMPTY: Tally = { cheats: 0, guilty: 0, innocent: 0, proofs: 0 }

/** Each seat's `full` view of the game. */
const fullViews = (t: Table) => [0, 1, 2, 3].map((seat) => viewFor(t.game, seat, 'full'))

/**
 * Every proof any seat holds, as `views` (each seat's `full` view of the round
 * in play) show them, names a rule its accused broke with the card the proof
 * is about, as the engine recorded it. Returns how many each seat holds.
 */
function soundProofs(t: Table, views: readonly View[]): number[] {
  const { tricks, current } = playOf(t.game)
  return views.map((view) => {
    const proofs = findProofs(view)
    for (const proof of proofs) {
      // Proof ids are `<rule>:<seat>:<trick>:<what shows it>`.
      const trick = Number(proof.id.split(':')[2])
      const plays = trick < tricks.length ? tricks[trick].plays : current
      if (!plays.find((p) => p.seat === proof.accused)!.broke.some((rule) => rule === proof.rule)) throw new Error(`seat ${view.seat} holds an unsound proof ${proof.id}`)
    }
    return proofs.length
  })
}

/**
 * A whole game in which every seat is a computer with the given persona, all
 * watching each other after every card. With `watch` off nobody accuses, so
 * every cheat stands. Checks that every cheat is a renege that dodges points,
 * and that every proof any seat holds is sound.
 */
function playGame(personas: Persona[], seed: number, overrides: RuleOverrides = {}, watch = true) {
  const t = new Table(overrides, seed).do(0, { type: 'start' })
  const seats = personas.map((persona) => ({ persona, standIn: false }))
  const mind = (seat: number) => mindFor({ seats, aiSalt: t.game.aiSalt, rules: t.game.rules }, seat)
  const tally = new Map<Persona, Tally>(personas.map((p) => [p, { ...EMPTY }]))
  const inPlay = () => t.game.phase.kind === 'playing' || t.game.phase.kind === 'trickPause'
  const proofless: Action[] = []

  const play = (seat: number) => {
    const decision = decide(viewFor(t.game, seat, 'full'), mind(seat))!
    const { action, reason } = decision
    const illegal = action.type === 'playCard' && !hasCard(availableActions(viewFor(t.game, seat)).legal, action.card)
    t.do(seat, action)
    if (illegal) {
      tally.get(personas[seat])!.cheats++
      expect(reason).toMatchObject({ code: 'renege' })
      if (reason.code === 'renege') expect(reason.dodges).toBeGreaterThan(0)
      const play = playOf(t.game)
      const record = play.current.at(-1) ?? play.tricks.at(-1)!.plays.at(-1)!
      expect(record.broke).toEqual(['followSuit'])
    }
    if (!inPlay()) return
    // Nothing changes the game again until a challenge, which ends the round: every seat's view stands till then.
    const views = fullViews(t)
    soundProofs(t, views).forEach((n, observer) => (tally.get(personas[observer])!.proofs += n))
    for (let s = 0; s < personas.length && watch && inPlay(); s++) {
      const challenge = chooseChallenge(views[s], mind(s))
      if (!challenge) continue
      const from = t.events.length
      t.do(s, challenge)
      const verdict = t.events.slice(from).find((e) => e.type === 'challengeResolved')!
      if (verdict.type !== 'challengeResolved') throw new Error(verdict.type)
      tally.get(personas[s])![verdict.guilty ? 'guilty' : 'innocent']++
      if (!verdict.guilty && TRAITS[mind(s).persona].hunchAt === null) proofless.push(challenge)
    }
  }

  for (let guard = 0; guard < 20_000 && t.game.phase.kind !== 'gameOver'; guard++) {
    const phase = t.game.phase
    if (phase.kind === 'roundResult') t.do(0, { type: 'nextRound' })
    else if (phase.kind === 'trickPause') t.endPause()
    else play(seatsToAct(t.game)[0])
  }
  expect(t.game.phase.kind).toBe('gameOver')
  // Straight and Sly accuse only on a proof, so they are never wrong.
  expect(proofless).toEqual([])
  return tally
}

function total(runs: Map<Persona, Tally>[]): Map<Persona, Tally> {
  const out = new Map<Persona, Tally>()
  for (const run of runs) {
    for (const [p, n] of run) {
      const t = out.get(p) ?? EMPTY
      out.set(p, { cheats: t.cheats + n.cheats, guilty: t.guilty + n.guilty, innocent: t.innocent + n.innocent, proofs: t.proofs + n.proofs })
    }
  }
  return out
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

describe('personas in whole games', () => {
  test(`${GAMES} games of Straight and Sharp against Sly and Wild`, () => {
    const all = total(range(GAMES).map((seed) => playGame(['straight', 'sly', 'sharp', 'wild'], seed)))
    console.log('personas:', JSON.stringify(Object.fromEntries(all)))
    expect(all.get('straight')!.cheats).toBe(0)
    expect(all.get('sharp')!.cheats).toBe(0)
    expect(all.get('wild')!.cheats).toBeGreaterThan(all.get('sly')!.cheats)
    const guilty = [...all.values()].reduce((n, t) => n + t.guilty, 0)
    expect(guilty).toBeGreaterThan(0)
    // Each watched and held proofs, every one sound. Wild, the only cheat here, has nobody to prove anything against.
    for (const persona of ['straight', 'sly', 'sharp'] as const) expect(all.get(persona)!.proofs).toBeGreaterThan(0)
  }, Math.max(120_000, GAMES * 30_000))

  test(`${GAMES} games where nobody accuses: Sly's careful cheats stand, and Wild cheats more`, () => {
    const all = total(range(GAMES).map((seed) => playGame(['sly', 'wild', 'sly', 'wild'], seed, {}, false)))
    console.log('unwatched:', JSON.stringify(Object.fromEntries(all)))
    expect(all.get('sly')!.cheats).toBeGreaterThan(0)
    expect(all.get('wild')!.cheats).toBeGreaterThan(all.get('sly')!.cheats)
    for (const persona of ['sly', 'wild'] as const) expect(all.get(persona)!.proofs).toBeGreaterThan(0)
  }, Math.max(120_000, GAMES * 30_000))

  test('Straight and Sharp at an honest table never cheat, and Straight never sees a proof that is not there', () => {
    for (let seed = 1; seed <= GAMES; seed++) {
      const personas: Persona[] = ['straight', 'sharp', 'straight', 'sharp']
      const t = new Table({}, seed).do(0, { type: 'start' })
      const mind = (seat: number) => ({ persona: personas[seat], salt: t.game.aiSalt })
      for (let guard = 0; guard < 20_000 && t.game.phase.kind !== 'gameOver'; guard++) {
        const phase = t.game.phase
        if (phase.kind === 'roundResult') t.do(0, { type: 'nextRound' })
        else if (phase.kind === 'trickPause') t.endPause()
        else {
          const seat = seatsToAct(t.game)[0]
          t.do(seat, decide(viewFor(t.game, seat, 'full'), mind(seat))!.action)
        }
        const p = t.game.phase
        if (p.kind === 'playing' || p.kind === 'trickPause') {
          // Checked after every action, so without expect's cost.
          if ([...p.play.tricks.flatMap((x) => x.plays), ...p.play.current].some((r) => r.broke.length > 0)) throw new Error(`seed ${seed}: a card broke a rule`)
          const views = fullViews(t)
          for (const seat of [0, 2]) if (chooseChallenge(views[seat], mind(seat)) !== null) throw new Error(`seed ${seed}: seat ${seat} accuses`)
          if (soundProofs(t, views).some((n) => n > 0)) throw new Error(`seed ${seed}: a seat holds a proof`)
        }
      }
      expect(t.game.phase.kind).toBe('gameOver')
    }
  }, Math.max(120_000, GAMES * 30_000))

  test('with cheating off every persona plays straight: nobody cheats or accuses', () => {
    const all = total(range(GAMES).map((seed) => playGame(['sly', 'wild', 'sharp', 'straight'], seed, { allowCheating: false })))
    for (const tally of all.values()) expect(tally).toEqual(EMPTY)
  }, Math.max(120_000, GAMES * 30_000))
})
