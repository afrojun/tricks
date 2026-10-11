import { describe, expect, test } from 'vitest'
import type { RoomStatus } from '../protocol'
import { gameTitle, needsYou, rank, statusLine } from './yourGames'

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
  })

  test('the games that need you come first, then games in play, lobbies, and finished games', () => {
    const order = [status({ stage: 'gameOver' }), status({ stage: 'lobby' }), status({ waitingOn: [1] }), status({ standIn: true }), status({ yourTurn: true })]
    expect(order.map(rank)).toEqual([3, 2, 1, 0, 0])
    expect(order.map(needsYou)).toEqual([false, false, false, true, true])
  })
})
