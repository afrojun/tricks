import { describe, expect, test } from 'vitest'
import type { RoomStatus } from '../protocol'
import { gameTitle, latestOnly, needsYou, rank, statusLine } from './yourGames'

const status = (over: Partial<RoomStatus> = {}): RoomStatus => ({
  stage: 'playing',
  seat: 0,
  names: ['You', 'Asha', 'Chan', 'Devi'],
  waitingOn: [],
  yourTurn: false,
  standIn: false,
  pace: 'async',
  ...over,
})

describe('your games', () => {
  test('only the latest refresh shows, whichever answers first, and none after closing', async () => {
    const answers: ((value: string) => void)[] = []
    const shown: string[] = []
    const refresh = latestOnly(() => new Promise<string>((resolve) => answers.push(resolve)), (value) => shown.push(value))
    const first = refresh.run()
    const second = refresh.run()
    answers[1]('new')
    answers[0]('old')
    await Promise.all([first, second])
    expect(shown).toEqual(['new'])
    const third = refresh.run()
    refresh.close()
    answers[2]('late')
    await third
    expect(shown).toEqual(['new'])
  })

  test('a row names the game and everyone else at it', () => {
    expect(gameTitle('Thunee', 'ABCDEF', status())).toBe('Thunee with Asha, Chan and Devi')
    expect(gameTitle('Hearts', 'ABCDEF', status({ names: ['You', '', 'Chan', ''] }))).toBe('Hearts with Chan')
    expect(gameTitle('Spades', 'ABCDEF', status({ stage: 'lobby', names: ['You', '', ''] }))).toBe('Spades, game ABCDEF')
  })

  test('says what the game waits on', () => {
    expect(statusLine(status({ yourTurn: true, waitingOn: [0] }))).toBe('Your turn')
    expect(statusLine(status({ yourTurn: true, standIn: true }))).toBe('Computer playing for you')
    expect(statusLine(status({ waitingOn: [1] }))).toBe('Waiting for Asha')
    expect(statusLine(status({ waitingOn: [1, 3] }))).toBe('Waiting for Asha and Devi')
    expect(statusLine(status())).toBe('Computers playing')
    expect(statusLine(status({ stage: 'lobby' }))).toBe('In the lobby')
    expect(statusLine(status({ stage: 'gameOver', yourTurn: true }))).toBe('Game over')
    expect(statusLine(status({ stage: 'roundOver' }))).toBe('Round over')
  })

  test('the games that need you come first, then games in play, lobbies, and finished games', () => {
    const order = [status({ stage: 'gameOver' }), status({ stage: 'lobby' }), status({ waitingOn: [1] }), status({ standIn: true }), status({ yourTurn: true }), status({ stage: 'roundOver' })]
    expect(order.map(rank)).toEqual([3, 2, 1, 0, 0, 0])
    expect(order.map(needsYou)).toEqual([false, false, false, true, true, true])
  })
})
