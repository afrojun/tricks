import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { GAMES } from '../games'
import { availableActions as heartsAvailable } from '../games/hearts/engine'
import { heartsPractice } from '../games/hearts/practice'
import { spadesPractice } from '../games/spades/practice'
import { dwell as heartsDwell } from '../games/hearts/ui/dwell'
import { thuneeCoach } from '../games/thunee/coach'
import { advise } from '../games/thunee/coach/advise'
import { check } from '../games/thunee/coach/check'
import { narrate } from '../games/thunee/coach/narrate'
import { review } from '../games/thunee/coach/review'
import { situation } from '../games/thunee/coach/situation'
import { topicsFor } from '../games/thunee/coach/topics'
import { availableActions as thuneeAvailable } from '../games/thunee/engine'
import { thuneePractice } from '../games/thunee/practice'
import { dwell as thuneeDwell } from '../games/thunee/ui/dwell'
import { hasCard } from '../kit/cards'
import type { TableState, TableView } from '../kit/table'
import { GAMES as CLIENTS, loadGame } from '../ui/games'
import type { GamePractice, Note } from './contract'
import { PracticeGame } from './game'
import { openPracticeSession } from './session'
import { playPractice } from './testing'

/** What a seeded practice game showed about its coach. */
interface Seen {
  advised: number
  over: boolean
}

/**
 * Plays a practice game in which the player follows the coach's advice and moves on between
 * rounds. After every step: the advice is never warned against, and is something the engine
 * accepts from the player now, so there is none when the player has nothing to decide.
 */
function followTheCoach<G extends TableState, A extends { type: string }, E, V extends TableView, N extends Note, D, S>(
  practice: GamePractice<G, A, E, V, N, D, S>,
  moveOn: A,
  playerCount: number,
  seed: number,
  steps: number,
): Seen {
  const { coach, module } = practice
  const p = PracticeGame.start(practice, playerCount, seed, 'You')
  let advised = 0
  /** The coach's advice for the game as it stands, asked once per state: checked, then followed. */
  let asked: { game: G; view: V; advice: ReturnType<typeof coach.advise> } | null = null
  const adviceNow = () => {
    if (asked?.game !== p.game) {
      const view = p.coachView()
      asked = { game: p.game, view, advice: coach.advise(view) }
    }
    return asked
  }
  const inspect = () => {
    const { view, advice } = adviceNow()
    if (advice === null) return
    advised++
    // Checked after every step, so without expect's cost.
    const warning = coach.check(view, advice.action)
    const result = module.apply(p.game, p.you, advice.action, { now: p.virtualNow, rng: () => 0.5 })
    const rejected = 'rejected' in result ? result.rejected : null
    if (warning !== null || rejected !== null) {
      throw new Error(`${module.id} ${playerCount}p seed ${seed}, ${p.game.phase.kind}: ${JSON.stringify(advice.action)} is ${warning !== null ? `warned against: ${warning.body}` : `rejected: ${rejected}`}`)
    }
  }
  inspect()
  playPractice(p, steps, (q) => (q.game.phase.kind === 'roundResult' ? moveOn : (adviceNow().advice?.action ?? null)), inspect)
  return { advised, over: p.game.phase.kind === 'gameOver' }
}

/** Every game with a practice, the table sizes it is practised at, and how the player moves on between rounds. */
const COACHED: Record<string, { counts: number[]; play: (playerCount: number, seed: number) => Seen }> = {
  thunee: { counts: [2, 4], play: (n, seed) => followTheCoach(thuneePractice, { type: 'nextRound' }, n, seed, 3000) },
  hearts: { counts: [4], play: (n, seed) => followTheCoach(heartsPractice, { type: 'nextRound' }, n, seed, 20_000) },
  spades: { counts: [2, 3, 4], play: (n, seed) => followTheCoach(spadesPractice, { type: 'nextRound' }, n, seed, 20_000) },
}

describe('every game’s coach', () => {
  test('every game whose screens offer practice is played here, and only those', async () => {
    // A game may list itself with `practice: null` until its practice is written.
    for (const { id } of CLIENTS) expect(id in COACHED, id).toBe((await loadGame(id)).practice !== null)
    for (const id of Object.keys(COACHED)) expect(GAMES.has(id), id).toBe(true)
  })

  test('Thunee’s practice coach is its hand-written coach, every member', () => {
    expect(thuneePractice.coach).toBe(thuneeCoach)
    expect(thuneeCoach).toEqual({ situation, advise, check, narrate, topicsFor, review })
  })

  for (const [id, { counts, play }] of Object.entries(COACHED)) {
    for (const playerCount of counts) {
      test(`${id}, ${playerCount} players: the advice is never warned against, and is always a move the player may make`, () => {
        let advised = 0
        for (let seed = 1; seed <= 3; seed++) {
          const seen = play(playerCount, seed)
          expect(seen.over, `${id} seed ${seed} reaches game over`).toBe(true)
          advised += seen.advised
        }
        expect(advised).toBeGreaterThan(50)
      })
    }
  }
})

/**
 * Plays a practice session, taking the hints, until the player holds a card that would break a
 * rule; then asks the session's coach about it, as a table's hand does before its second tap.
 */
function checkThroughSession<G extends TableState, A extends { type: string }, E, V extends TableView, N extends Note, D, S>(
  practice: GamePractice<G, A, E, V, N, D, S>,
  dwell: (event: E) => number,
  ruleBreaking: (view: V) => A | null,
  moveOn: A,
): void {
  const storage = new Map<string, string>()
  const s = openPracticeSession(practice, dwell, {
    playerCount: null,
    seed: 2,
    storage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v), removeItem: (k) => void storage.delete(k) },
  })
  vi.runOnlyPendingTimers()
  for (let guard = 0; guard < 5000; guard++) {
    const state = s.coach.getState()
    const view = s.store.getState().view!
    if (state.topic !== null) s.coach.dismissTopic()
    else if (state.trickPaused) s.coach.continueTrick()
    else if (view.phase.kind === 'roundResult') s.send(moveOn)
    else if (state.advice && state.version === s.store.getState().version) {
      const bad = ruleBreaking(view)
      if (bad !== null) {
        const warning = s.coach.check(bad)
        expect(warning).toMatchObject({ tone: 'warn', rule: 'illegal' })
        expect(warning).toEqual(practice.coach.check(view, bad))
        expect(s.coach.check(state.advice.action)).toBeNull()
        s.close()
        return
      }
      s.send(state.advice.action)
    }
    vi.advanceTimersByTime(500)
  }
  s.close()
  throw new Error(`${practice.module.id}: the player never held a card that breaks a rule`)
}

describe('the practice session asks the coach about an action', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test('Thunee: the coach’s warning for a rule-breaking card, and nothing for the hint', () => {
    const ruleBreaking = (view: Parameters<typeof thuneeAvailable>[0]) => {
      const can = thuneeAvailable(view)
      const card = can.play.find((c) => !hasCard(can.legal, c))
      return card ? ({ type: 'playCard', card } as const) : null
    }
    checkThroughSession(thuneePractice, thuneeDwell, ruleBreaking, { type: 'nextRound' })
  })

  test('Hearts: the coach’s warning for a rule-breaking card, and nothing for the hint', () => {
    const ruleBreaking = (view: Parameters<typeof heartsAvailable>[0]) => {
      const can = heartsAvailable(view)
      const card = can.play.find((c) => !hasCard(can.legal, c))
      return card ? ({ type: 'playCard', card } as const) : null
    }
    checkThroughSession(heartsPractice, heartsDwell, ruleBreaking, { type: 'nextRound' })
  })
})
