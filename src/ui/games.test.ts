import { describe, expect, test } from 'vitest'
import { GAMES, loadGame } from './games'
import { tableSizes } from './seats'

describe('the browser’s list of games', () => {
  test.each(GAMES.map((entry) => [entry.id, entry] as const))('%s is listed as its own client says', async (_, entry) => {
    const client = await loadGame(entry.id)
    expect({ id: client.id, name: client.name, tagline: client.tagline, seatCounts: [...client.seatCounts] }).toEqual({ id: entry.id, name: entry.name, tagline: entry.tagline, seatCounts: [...entry.seatCounts] })
  })

  test('a game is loaded once', async () => {
    expect(loadGame(GAMES[0].id)).toBe(loadGame(GAMES[0].id))
  })

  test('each game is listed once', () => {
    expect(new Set(GAMES.map((g) => g.id)).size).toBe(GAMES.length)
  })

  test('the home says how many can play', () => {
    expect(tableSizes([2, 4])).toBe('Two or four players')
    expect(tableSizes([4])).toBe('Four players')
    expect(tableSizes([3, 4, 5])).toBe('Three, four or five players')
  })
})
