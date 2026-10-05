import { describe, expect, test } from 'vitest'
import { type Game, type GameEvent, type RoundSummary, type View, viewFor } from '../engine'
import { Table, card } from '../engine/testing'
import { PracticeGame } from '../practice/game'
import { playPractice } from '../practice/testing'
import { SILENT, narrate } from './narrate'
import type { DecisionRecord } from './note'
import { review } from './review'

const D1 = ['Jh 9h Ks Qs 10c Qd', 'Js 9s As 10s Kd Qc', 'Jc 9c Ac Kc Ah 10h', 'Jd 9d Ad 10d Kh Qh']
const table = (hands = D1) => new Table(4, { redealIfNoTrumps: false }).deal(hands)
const played = (plays: string, hands = D1) => {
  const t = table(hands).toPlay('spades')
  return plays ? t.play(plays) : t
}
const you = (game: Game, seat = 0): View => viewFor(game, seat, 'full')
const text = (n: { title: string; body: string } | null) => (n ? `${n.title} ${n.body}` : '')

describe('narrate', () => {
  test('a trick won: who, with what, the points, and both sides against the target', () => {
    const t = played('Jc Qh 10c Qc')
    const said = text(narrate({ type: 'trickWon', seat: 2, points: 44 }, you(t.game)))
    expect(said).toContain('P2')
    expect(said).toContain('J♣')
    expect(said).toContain('44')
    expect(said).toContain('105')
  })

  test("a computer's card that shows a missing suit", () => {
    const t = played('Jc Qh')
    expect(text(narrate({ type: 'cardPlayed', seat: 3, card: card('Qh') }, you(t.game)))).toMatch(/P3 has no clubs/)
  })

  test('your own card needs no narration', () => {
    const t = played('Jc Qh 10c')
    expect(narrate({ type: 'cardPlayed', seat: 0, card: card('10c') }, you(t.game))).toBeNull()
  })

  test('the second half of a two-player round brings six new cards', () => {
    const t = table()
    expect(text(narrate({ type: 'dealt', roundNumber: 1, dealer: 0, half: 2 }, you(t.game)))).toMatch(/six new cards/i)
  })

  test('being caught not following suit explains the 4 balls', () => {
    const t = table()
    const said = text(narrate({ type: 'challengeResolved', challenger: 1, accused: 0, guilty: true }, you(t.game)))
    expect(said).toContain('4 balls')
    expect(said.toLowerCase()).toContain('you')
  })

  test('every event in whole practice games is narrated or deliberately silent', () => {
    for (const players of [2, 4] as const) {
      const p = PracticeGame.start(players, 3, 'Ann')
      const seen: GameEvent[] = []
      const original = p.advance.bind(p)
      p.advance = (ms, sheet) => {
        const applied = original(ms, sheet)
        for (const e of applied.events) {
          const note = narrate(e, p.coachView())
          if (note === null && !SILENT.has(e.type) && !(e.type === 'cardPlayed')) seen.push(e)
        }
        return applied
      }
      playPractice(p, 4000)
      expect(seen).toEqual([])
    }
  })
})

describe('review', () => {
  const summary = (over: Partial<RoundSummary> = {}): RoundSummary => ({
    roundNumber: 1,
    reason: 'normal',
    winner: 0,
    balls: 1,
    ballsAfter: [1, 0],
    trumper: 1,
    trump: 'spades',
    callAmount: 0,
    cardPoints: [150, 154],
    tricksWon: [3, 3],
    normal: { countingTeam: 0, lines: [{ label: 'cards', value: 150 }, { label: 'lastTrick', value: -10 }], total: 140, target: 105 },
    ...over,
  })

  test('the score in words', () => {
    const notes = review({ decisions: [], summary: summary(), dealt: [], you: 0, view: you(table().game) })
    expect(text(notes[0])).toContain('140')
    expect(text(notes[0])).toContain('105')
  })

  test('a move against the advice is a key moment, and only the three biggest are kept', () => {
    const t = played('Jc Qh')
    const v = you(t.game)
    const differ: DecisionRecord = { view: v, advised: { type: 'playCard', card: card('10c') }, taken: { type: 'playCard', card: card('Jh') } }
    const notes = review({ decisions: [differ, differ, differ, differ], summary: summary(), dealt: [], you: 0, view: v })
    const moments = notes.filter((n) => n.tone === 'suggest')
    expect(moments).toHaveLength(3)
    expect(text(moments[0])).toContain('10♣')
  })

  test('a rule broken and not caught is pointed out', () => {
    const v = you(played('Jc Qh').game)
    const broke: DecisionRecord = { view: v, advised: null, taken: { type: 'playCard', card: card('Jh') } }
    const notes = review({ decisions: [broke], summary: summary(), dealt: [], you: 0, view: v })
    expect(notes.map(text).join(' ')).toMatch(/challenge/i)
  })

  test('a round ended by a challenge makes sense without normal scoring', () => {
    const s = summary({ reason: 'challenge', normal: undefined, winner: 1, balls: 4, challenge: { challenger: 1, accused: 0, kind: 'play', guilty: true, card: card('Jh') } })
    const notes = review({ decisions: [], summary: s, dealt: [], you: 0, view: you(table().game) })
    expect(text(notes[0])).toMatch(/challenge/i)
    expect(text(notes[0])).toContain('4 balls')
  })
})
