import { describe, expect, test } from 'vitest'
import type { Action as HeartsAction, Card as HeartsCard, View as HeartsView } from '../games/hearts/engine'
import { heartsPractice } from '../games/hearts/practice'
import { type Action as ThuneeAction, type View as ThuneeView, availableActions as thuneeAvailable } from '../games/thunee/engine'
import { thuneePractice } from '../games/thunee/practice'
import { TOPICS as HEARTS_TOPICS } from '../games/hearts/coach/topics'
import { TOPICS as THUNEE_TOPICS } from '../games/thunee/coach/topics'
import type { TableState, TableView } from '../kit/table'
import type { Drill, GamePractice, Note, Verdict } from './contract'
import { PracticeGame } from './game'
import { playPractice } from './testing'

/** The player's action at a moment where the drill's lesson is to be missed: 'wait' lets the moment pass, null takes the hint. */
type Mistake<V, A> = (view: V) => A | 'wait' | null

/**
 * Plays a drill from its first moment: the player takes the hint, or makes `mistake` where it says,
 * continues every pause, and lets time run, until the drill gives its verdict. Every hint is checked
 * to be one the coach does not warn against.
 */
function playDrill<G extends TableState, A extends { type: string }, E, V extends TableView, N extends Note, D, S>(
  practice: GamePractice<G, A, E, V, N, D, S>,
  drill: Drill<G, A, V, N>,
  seed: number,
  mistake: Mistake<V, A> = () => null,
): Verdict<N> & { dealt: D[] } {
  const p = PracticeGame.drill(practice, drill, seed, 'You')
  let verdict: Verdict<N> | null = null
  playPractice(
    p,
    200,
    (q) => {
      const view = q.coachView()
      const advice = practice.coach.advise(view)
      if (advice) expect(practice.coach.check(view, advice.action), `${drill.id}: ${JSON.stringify(advice.action)}`).toBeNull()
      const wrong = mistake(view)
      return wrong === 'wait' ? null : (wrong ?? advice?.action ?? null)
    },
    undefined,
    (q) => (verdict = drill.verdict(q.coachView(), q.round.decisions)) !== null,
  )
  if (verdict === null) throw new Error(`${drill.id}: no verdict after 200 moves, in ${p.game.phase.kind}`)
  return { ...(verdict as Verdict<N>), dealt: p.round.dealt }
}

const play = (rank: HeartsCard['rank'], suit: HeartsCard['suit']): HeartsAction => ({ type: 'playCard', card: { rank, suit } })

const THUNEE_MISTAKES: Record<string, Mistake<ThuneeView, ThuneeAction>> = {
  // Lets the pause pass, and leads the next trick, without calling.
  jodhi: (v) => {
    if (thuneeAvailable(v).claimJodhi.length === 0) return null
    return v.phase.kind === 'playing' ? { type: 'playCard', card: v.phase.hand[0] } : 'wait'
  },
  // Plays the winning card without calling.
  khanaak: (v) => (thuneeAvailable(v).callKhanaak ? { type: 'playCard', card: { rank: 'J', suit: 'hearts' } } : null),
  thunee: (v) => (thuneeAvailable(v).callThunee ? { type: 'pass' } : null),
  // Plays on instead of challenging.
  challenge: (v) => (thuneeAvailable(v).challengePlay.includes(1) && v.phase.kind === 'playing' ? { type: 'playCard', card: v.phase.hand[0] } : null),
}

const HEARTS_MISTAKES: Record<string, Mistake<HeartsView, HeartsAction>> = {
  firstTrick: () => play('A', 'hearts'),
  leadingHearts: () => play('A', 'hearts'),
  dumpQueen: () => play('Q', 'diamonds'),
}

/** Each game's practice and the mistake that misses each of its drills. Every game with drills is here. */
const GAMES = [
  { practice: thuneePractice, mistakes: THUNEE_MISTAKES, topics: THUNEE_TOPICS },
  { practice: heartsPractice, mistakes: HEARTS_MISTAKES, topics: HEARTS_TOPICS },
] as const

describe.each(GAMES)('$practice.module.id drills', ({ practice, mistakes, topics }) => {
  const drills = practice.drills as readonly Drill<TableState, { type: string }, TableView, Note>[]
  const p = practice as unknown as GamePractice<TableState, { type: string }, unknown, TableView, Note, unknown, unknown>

  test('every drill has its own id and a mistake to test', () => {
    expect(new Set(drills.map((d) => d.id)).size).toBe(drills.length)
    expect(Object.keys(mistakes).sort()).toEqual(drills.map((d) => d.id).sort())
    // A brief's "Learn about" link opens one of the game's lessons.
    for (const d of drills) if (d.brief.topic !== undefined) expect(Object.keys(topics), d.id).toContain(d.brief.topic)
  })

  test.each(drills.map((d) => [d.id, d] as const))('%s starts at its moment, with a guide and no verdict yet', (_, drill) => {
    for (const seed of [1, 2, 3]) {
      const game = PracticeGame.drill(p, drill, seed, 'You')
      expect(game.game.playerCount).toBe(drill.playerCount)
      expect(game.round.decisions).toEqual([])
      expect(drill.verdict(game.coachView(), [])).toBeNull()
      expect(drill.guide(game.coachView())).not.toBeNull()
      expect(p.coach.advise(game.coachView())).not.toBeNull()
    }
  })

  test.each(drills.map((d) => [d.id, d] as const))('%s is passed by taking the hint', (_, drill) => {
    for (const seed of [1, 2, 3]) {
      const { passed, dealt } = playDrill(p, drill, seed)
      expect(passed, `seed ${seed}`).toBe(true)
      // The review can show the deal as stacked.
      expect(dealt.length).toBeGreaterThan(0)
    }
  })

  test.each(drills.map((d) => [d.id, d] as const))('%s is missed by the usual mistake', (_, drill) => {
    const mistake = (mistakes as Record<string, Mistake<TableView, { type: string }>>)[drill.id]
    for (const seed of [1, 2, 3]) {
      const verdict = playDrill(p, drill, seed, mistake)
      expect(verdict.passed, `seed ${seed}`).toBe(false)
      expect(verdict.note.tone).toBe('warn')
    }
  })
})

describe('the Jodhi drill', () => {
  const drill = thuneePractice.drills.find((d) => d.id === 'jodhi')!

  test('a Jodhi claimed with a jack not held is false, and missed', () => {
    const p = PracticeGame.drill(thuneePractice, drill, 1, 'You')
    p.act({ type: 'playCard', card: { rank: 'J', suit: 'clubs' } }, null)
    for (let i = 0; i < 20 && thuneeAvailable(p.coachView()).claimJodhi.length === 0; i++) p.advance(p.nextIn() ?? 1000, false)
    p.act({ type: 'claimJodhi', suit: 'spades', withJack: true }, null)
    expect(drill.verdict(p.coachView(), p.round.decisions)).toMatchObject({ passed: false, note: { title: 'A false Jodhi' } })
  })
})
