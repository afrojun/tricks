import { describe, expect, test } from 'vitest'
import { type Action, type Game, type Persona, availableActions, checkInvariants, hasCard, nextDeadline, seatsToAct, viewFor } from '../engine'
import { Table } from '../engine/testing'
import { chooseAction, chooseJodhi } from './choose'
import type { Mind } from './mind'
import { chooseChallenge } from './suspicion'

const GAMES = Number(process.env.SIM_GAMES ?? 30)

interface Tally {
  illegal: number
  bluffs: number
}

/** A whole game in which every seat is a computer with the given persona, all watching each other. */
function playGame(personas: Persona[], seed: number) {
  const t = new Table(personas.length as 2 | 4, { ballsToWin: 6 }, seed).do(0, { type: 'start' })
  const tally = new Map<Persona, Tally>(personas.map((p) => [p, { illegal: 0, bluffs: 0 }]))
  const mind = (seat: number): Mind => ({ persona: personas[seat], salt: t.game.aiSalt })
  const inPlay = () => t.game.phase.kind === 'playing' || t.game.phase.kind === 'trickPause'

  const act = (seat: number, action: Action) => {
    if (action.type === 'playCard' && !hasCard(availableActions(viewFor(t.game, seat)).legal, action.card)) {
      tally.get(personas[seat])!.illegal++
    }
    t.do(seat, action)
    checkInvariants(t.game)
    expect(JSON.stringify(viewFor(t.game, seat))).not.toContain('"aiSalt"')
    const phase = t.game.phase as Extract<Game['phase'], { kind: 'playing' | 'trickPause' }>
    if (action.type === 'claimJodhi' && !phase.play.jodhiClaims.at(-1)!.valid) tally.get(personas[seat])!.bluffs++
    // Everyone watches after every action; a challenge ends the round.
    for (let s = 0; s < personas.length && inPlay(); s++) {
      const challenge = chooseChallenge(viewFor(t.game, s, 'full'), mind(s))
      if (challenge) t.do(s, challenge)
    }
  }

  for (let guard = 0; guard < 20_000 && t.game.phase.kind !== 'gameOver'; guard++) {
    const phase = t.game.phase
    if (phase.kind === 'roundResult') {
      t.do(0, { type: 'nextRound' })
      continue
    }
    const waiting = seatsToAct(t.game)
    if (waiting.length === 0) {
      for (let s = 0; s < personas.length && phase.kind === 'trickPause' && inPlay(); s++) {
        const claim = chooseJodhi(viewFor(t.game, s, 'full'), mind(s))
        if (claim) act(s, claim)
      }
      if (!inPlay()) continue // a claim was challenged
      t.now = nextDeadline(t.game)!
      t.do('system', { type: 'tick' })
      continue
    }
    const seat = waiting[0]
    act(seat, chooseAction(viewFor(t.game, seat, 'full'), mind(seat)))
  }
  expect(t.game.phase.kind).toBe('gameOver')
  const challenges = t.events.filter((e) => e.type === 'challengeResolved')
  return { tally, challenges }
}

describe('personas', () => {
  test(`${GAMES} games of Straight and Sharp against Sly and Wild`, () => {
    // Seats 0 and 2 are a team, as are 1 and 3.
    const personas: Persona[] = ['straight', 'sly', 'sharp', 'wild']
    const total = new Map<Persona, Tally>(personas.map((p) => [p, { illegal: 0, bluffs: 0 }]))
    let guilty = 0
    let innocent = 0
    for (let seed = 1; seed <= GAMES; seed++) {
      const { tally, challenges } = playGame(personas, seed)
      for (const [p, n] of tally) {
        total.get(p)!.illegal += n.illegal
        total.get(p)!.bluffs += n.bluffs
      }
      for (const c of challenges) if (c.type === 'challengeResolved') c.guilty ? guilty++ : innocent++
    }
    console.log('personas:', JSON.stringify(Object.fromEntries(total)), `challenges: ${guilty} guilty, ${innocent} innocent`)
    expect(total.get('straight')).toEqual({ illegal: 0, bluffs: 0 })
    expect(total.get('sharp')).toEqual({ illegal: 0, bluffs: 0 })
    expect(total.get('wild')!.illegal).toBeGreaterThan(total.get('sly')!.illegal)
    expect(total.get('sly')!.illegal + total.get('sly')!.bluffs).toBeGreaterThan(0)
    expect(guilty).toBeGreaterThan(0)
    expect(innocent).toBeGreaterThan(0)
  }, 600_000)

  test('two-player games finish with any pair of personas', () => {
    const pairs: Persona[][] = [['sly', 'wild'], ['sharp', 'straight'], ['wild', 'sharp']]
    for (const pair of pairs) for (let seed = 1; seed <= 5; seed++) playGame(pair, seed)
  }, 120_000)
})
