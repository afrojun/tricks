import { describe, expect, test } from 'vitest'
import { GAMES } from '../games'
import { heartsPractice } from '../games/hearts/practice'
import { thuneeCoach } from '../games/thunee/coach'
import { advise } from '../games/thunee/coach/advise'
import { check } from '../games/thunee/coach/check'
import { narrate } from '../games/thunee/coach/narrate'
import { review } from '../games/thunee/coach/review'
import { situation } from '../games/thunee/coach/situation'
import { topicsFor } from '../games/thunee/coach/topics'
import { thuneePractice } from '../games/thunee/practice'
import type { TableState, TableView } from '../kit/table'
import { GAMES as CLIENTS, loadGame } from '../ui/games'
import type { GamePractice, Note } from './contract'
import { PracticeGame } from './game'
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
  const inspect = () => {
    const view = p.coachView()
    const advice = coach.advise(view)
    if (advice === null) return
    advised++
    const where = `${module.id} ${playerCount}p seed ${seed}, ${p.game.phase.kind}: ${JSON.stringify(advice.action)}`
    expect(coach.check(view, advice.action), where).toBeNull()
    const result = module.apply(p.game, p.you, advice.action, { now: p.virtualNow, rng: () => 0.5 })
    expect('rejected' in result ? result.rejected : null, where).toBeNull()
  }
  inspect()
  playPractice(
    p,
    steps,
    (q) => (q.game.phase.kind === 'roundResult' ? moveOn : (coach.advise(q.coachView())?.action ?? null)),
    inspect,
  )
  return { advised, over: p.game.phase.kind === 'gameOver' }
}

/** Every game with a practice, the table sizes it is practised at, and how the player moves on between rounds. */
const COACHED: Record<string, { counts: number[]; play: (playerCount: number, seed: number) => Seen }> = {
  thunee: { counts: [2, 4], play: (n, seed) => followTheCoach(thuneePractice, { type: 'nextRound' }, n, seed, 3000) },
  hearts: { counts: [4], play: (n, seed) => followTheCoach(heartsPractice, { type: 'nextRound' }, n, seed, 20_000) },
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
      }, 60_000)
    }
  }
})
