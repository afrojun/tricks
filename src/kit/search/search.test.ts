import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { type Card, cardId, hasCard, removeCard, sameCard } from '../cards'
import { HONEST } from '../mind'
import type { Seat, TableView } from '../table'
import { explain } from './explain'
import { search } from './search'
import type { SearchGame } from './types'

/**
 * The smallest game with hidden cards: two seats hold three hearts each from one to six; seat 0 plays one,
 * then seat 1, and the higher card wins. The search must find the best card from its own hand alone.
 */
interface Toy {
  hands: Card[][]
  played: (Card | null)[]
  turn: Seat | null
}
interface ToyView extends TableView {
  hand: Card[]
  played: (Card | null)[]
  counts: number[]
}
type ToyAction = { type: 'play'; card: Card }

const heart = (rank: number): Card => ({ suit: 'hearts', rank: String(rank) })
const DECK = [1, 2, 3, 4, 5, 6].map(heart)
const winner = (game: Toy): Seat | null => {
  const [a, b] = game.played
  return a && b ? (Number(a.rank) > Number(b.rank) ? 0 : 1) : null
}

function viewOf(game: Toy, seat: Seat | null): ToyView {
  return {
    seat,
    seats: [],
    host: null,
    owner: null,
    playerCount: 2,
    waiting: [],
    phase: { kind: game.turn === null ? 'over' : 'playing' },
    hand: seat === null ? [] : [...game.hands[seat]],
    played: [...game.played],
    counts: game.hands.map((h) => h.length),
  }
}

let steps = 0

const toy: SearchGame<Toy, ToyAction, ToyView> = {
  step(draft, actor, action) {
    steps++
    if (action.type !== 'play') return { rejected: 'nothingDue' }
    if (typeof actor !== 'number' || actor !== draft.turn) return { rejected: 'notYourTurn' }
    if (!hasCard(draft.hands[actor], action.card)) return { rejected: 'cardNotInHand' }
    draft.hands[actor] = removeCard(draft.hands[actor], action.card)
    draft.played[actor] = action.card
    draft.turn = actor === 0 ? 1 : null
    return { events: [] }
  },
  knowledge(view) {
    const seen = [...view.hand, ...view.played.filter((c): c is Card => c !== null)]
    return { hidden: DECK.filter((c) => !hasCard(seen, c)), sizes: [view.counts[1 - view.seat!]], hard: [], soft: [] }
  },
  rebuild(view, world) {
    const me = view.seat!
    const hands = me === 0 ? [[...view.hand], [...world[0]]] : [[...world[0]], [...view.hand]]
    return { hands, played: [...view.played], turn: view.phase.kind === 'over' ? null : view.played[0] === null ? 0 : 1 }
  },
  candidates: (view) => [...view.hand].sort((a, b) => cardId(a).localeCompare(cardId(b))).map((card) => ({ type: 'play', card })),
  rollout: (game, seat, rng) => ({ type: 'play', card: game.hands[seat][Math.floor(rng() * game.hands[seat].length)] }),
  value: (game, seat) => (winner(game) === seat ? 1 : -1),
  decisionId: (view) => `play:${view.played.filter(Boolean).length}`,
  worlds: 30,
  trick: () => 0,
  trickWinner: (game) => winner(game),
  seatsToAct: (game) => (game.turn === null ? [] : [game.turn]),
  nextDeadline: () => null,
}

const deal = (mine: number[]): Toy => ({ hands: [mine.map(heart), DECK.filter((c) => !mine.includes(Number(c.rank)))], played: [null, null], turn: 0 })

describe('the search player', () => {
  test('finds the best card from its own view: the one that always wins', () => {
    const result = search(toy, viewOf(deal([2, 4, 6]), 0), HONEST)!
    expect(result.action).toEqual({ type: 'play', card: heart(6) })
    expect(result.worlds).toBe(30)
    const six = result.options[result.chosen]
    expect(six.values.every((v) => v === 1)).toBe(true)
    expect(six.won).toBe(30)
    // The two can never win against the three, five and six-less hand it faces: 1, 3 and 5.
    const two = result.options.find((o) => sameCard((o.action as ToyAction).card, heart(2)))!
    expect(two.won).toBe(two.values.filter((v) => v === 1).length)
  })

  test('the same view and mind give the same result; another salt may differ', () => {
    const view = viewOf(deal([1, 4, 5]), 0)
    const once = search(toy, view, { persona: 'straight', salt: 3 })
    expect(search(toy, structuredClone(view), { persona: 'straight', salt: 3 })).toEqual(once)
    const others = Array.from({ length: 10 }, (_, salt) => search(toy, view, { persona: 'straight', salt: salt + 10 })!.options.map((o) => o.values.join()))
    expect(others.some((values) => values.join('|') !== once!.options.map((o) => o.values.join()).join('|'))).toBe(true)
  })

  test('the decision id names the stream: another decision with the same salt draws other worlds', () => {
    const view = viewOf(deal([1, 4, 5]), 0)
    const named = (id: string) => search({ ...toy, decisionId: () => id }, view, HONEST)!.options.map((o) => o.values.join()).join('|')
    expect(named('a')).toBe(named('a'))
    expect(new Set(['a', 'b', 'c', 'd', 'e'].map(named)).size).toBeGreaterThan(1)
  })

  test('chooses only among the candidates, and a single one is taken without a search', () => {
    steps = 0
    const result = search({ ...toy, candidates: () => [{ type: 'play', card: heart(1) }] }, viewOf(deal([1, 4, 5]), 0), HONEST)!
    expect(result).toMatchObject({ action: { type: 'play', card: heart(1) }, worlds: 0, chosen: 0 })
    expect(steps).toBe(0)
    expect(explain(result)).toBeNull()
  })

  test('nothing to decide is nothing chosen', () => {
    expect(search(toy, viewOf(deal([1, 4, 5]), null), HONEST)).toBeNull()
    expect(search({ ...toy, candidates: () => [] }, viewOf(deal([1, 4, 5]), 0), HONEST)).toBeNull()
  })

  test('a candidate the engine refuses is a bug, and throws', () => {
    const view = viewOf(deal([1, 4, 5]), 0)
    expect(() => search({ ...toy, candidates: () => [{ type: 'play', card: heart(1) }, { type: 'play', card: heart(6) }] }, view, HONEST)).toThrow(/refused \(cardNotInHand\)/)
    expect(() => search({ ...toy, rollout: (game) => ({ type: 'play', card: game.hands[0][0] ?? heart(1) }), seatsToAct: () => [0] }, view, HONEST)).toThrow(/refused/)
  })

  test('does a fixed amount of work: one rebuilt game and one playout per world and candidate, whatever happens in them', () => {
    let rebuilt = 0
    const counted = { ...toy, rebuild: (view: ToyView, world: Card[][]) => (rebuilt++, toy.rebuild(view, world)) }
    for (const worlds of [1, 7, 30]) {
      rebuilt = 0
      const result = search({ ...counted, worlds }, viewOf(deal([1, 4, 5]), 0), HONEST)!
      expect(rebuilt).toBe(worlds * 3)
      expect(result.options.every((o) => o.values.length === worlds)).toBe(true)
    }
  })

  test('reads no clock and no other randomness, and imports nothing but the kit', () => {
    const dir = new URL('.', import.meta.url)
    const sources = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    expect(sources.sort()).toEqual(['explain.ts', 'sample.ts', 'search.ts', 'seed.ts', 'types.ts'])
    const adapter = new URL('../../games/hearts/ai/search.ts', import.meta.url)
    for (const file of [...sources.map((f) => new URL(f, dir)), adapter]) {
      const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
      expect({ file: file.pathname, chance: /Math\.random|Date\b|performance\.|setTimeout/.test(code) }).toEqual({ file: file.pathname, chance: false })
      if (file !== adapter) for (const [, from] of code.matchAll(/from '([^']+)'/g)) expect(from, file.pathname).toMatch(/^\.\.?\/[a-z]+$/)
    }
  })

  test('explains each option: mean, standard error, the gap to the chosen paired by world, and how often it won the trick', () => {
    const result = search(toy, viewOf(deal([2, 4, 6]), 0), HONEST)!
    const explanation = explain(result)!
    expect(explanation.worlds).toBe(30)
    expect(explanation.chosen).toMatchObject({ action: { card: heart(6) }, mean: 1, se: 0, gap: 0, gapSe: 0, wins: 1 })
    expect(explanation.others.map((o) => o.action.card.rank)).toEqual(['4', '2'])
    for (const other of explanation.others) {
      const option = result.options.find((o) => o.action === other.action)!
      const m = option.values.reduce((a, b) => a + b, 0) / 30
      expect(other.mean).toBeCloseTo(m, 12)
      expect(other.gap).toBeCloseTo(m - 1, 12)
      expect(other.wins).toBeCloseTo(option.won! / 30, 12)
      expect(other.se).toBeGreaterThan(0)
    }
  })
})
