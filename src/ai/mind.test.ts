import { describe, expect, test } from 'vitest'
import { viewFor } from '../games/thunee/engine'
import { Table } from '../games/thunee/engine/testing'
import { mindFor, roll } from '../kit/mind'
import { history, mood } from './read'

const D1 = ['Jh 9h Ks Qs 10c Qd', 'Js 9s As 10s Kd Qc', 'Jc 9c Ac Kc Ah 10h', 'Jd 9d Ad 10d Kh Qh']
const start = () => new Table(4, { redealIfNoTrumps: false }).deal(D1).toPlay('spades')

describe('minds', () => {
  test('a roll is repeatable, evenly spread, and differs by salt, observer and question', () => {
    expect(roll(5, 1, 'x')).toBe(roll(5, 1, 'x'))
    const values = Array.from({ length: 4000 }, (_, i) => roll(i, 2, 'renege:1:0:3'))
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    const mean = values.reduce((a, b) => a + b) / values.length
    expect(mean).toBeGreaterThan(0.47)
    expect(mean).toBeLessThan(0.53)
    expect(values.filter((v) => v < 0.25).length / values.length).toBeCloseTo(0.25, 1)
    expect(new Set([roll(1, 0, 'a'), roll(2, 0, 'a'), roll(1, 1, 'a'), roll(1, 0, 'b')]).size).toBe(4)
  })

  test('a seat plays with its own persona and the round salt; a stand-in always plays straight', () => {
    const t = start()
    const game = { ...t.game, seats: t.game.seats.map((s) => ({ ...s, persona: 'wild' as const })) }
    expect(mindFor(game, 1)).toEqual({ persona: 'wild', salt: game.aiSalt })
    game.seats[1] = { ...game.seats[1], standIn: true }
    expect(mindFor(game, 1)).toEqual({ persona: 'straight', salt: game.aiSalt })
  })

  test('history lists the tricks with the current one last, and skips tricks a table view has turned down', () => {
    const t = start().play('Ah Qh 9h 10s').endPause().play('Js 9c')
    const full = viewFor(t.game, 0, 'full').phase
    if (full.kind !== 'playing') throw new Error(full.kind)
    expect(history(full).map((r) => [r.index, r.winner, r.plays.length])).toEqual([[0, 1, 4], [1, null, 2]])

    t.play('Kh Qs').endPause().play('As Jc Ad Ks').endPause()
    const table = viewFor(t.game, 0).phase
    if (table.kind !== 'playing') throw new Error(table.kind)
    expect(history(table).map((r) => r.index)).toEqual([2])
  })

  test('mood rises when the team is behind in balls or in points this round', () => {
    const t = start().play('Ah Qh 9h 10s') // seat 1's team takes 43 points
    expect(mood(viewFor(t.game, 1, 'full'))).toBe(1)
    expect(mood(viewFor(t.game, 0, 'full'))).toBe(1.5)
    t.game = { ...t.game, balls: [0, 3] }
    expect(mood(viewFor(t.game, 0, 'full'))).toBe(2)
  })

  test('mood as of an earlier trick counts only the card points up to then', () => {
    const t = start().play('Ah Qh 9h 10s').endPause().play('Js') // trick 0 is seat 1's team's; trick 1 is open
    const view = viewFor(t.game, 0, 'full')
    expect(mood(view, -1)).toBe(1)
    expect(mood(view, 0)).toBe(1.5)
    expect(mood(view)).toBe(1.5)
    t.game = { ...t.game, balls: [0, 3] }
    expect(mood(viewFor(t.game, 0, 'full'), -1)).toBe(1.5)
  })
})
