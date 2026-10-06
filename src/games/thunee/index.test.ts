import { describe, expect, test } from 'vitest'
import { thunee } from '.'
import { dueStep, reactions } from '../../ai/drive'
import { FORMAT_VERSION, apply, viewFor } from '../../engine'

describe('the Thunee module', () => {
  test('names the game and carries every part of the contract', () => {
    expect(thunee.id).toBe('thunee')
    expect(thunee.formatVersion).toBe(FORMAT_VERSION)
    expect(thunee.seatCounts).toEqual([2, 4])
    for (const fn of [thunee.createGame, thunee.apply, thunee.viewFor, thunee.seatsToAct, thunee.nextDeadline, thunee.checkInvariants, thunee.dueStep, thunee.reactions]) {
      expect(typeof fn).toBe('function')
    }
  })

  test('is the engine and the computer players themselves, not copies', () => {
    expect(thunee.apply).toBe(apply)
    expect(thunee.viewFor).toBe(viewFor)
    expect(thunee.dueStep).toBe(dueStep)
    expect(thunee.reactions).toBe(reactions)
  })

  test('a new game is an empty lobby of four seats in this format', () => {
    const game = thunee.createGame()
    expect(game).toMatchObject({ formatVersion: FORMAT_VERSION, playerCount: 4, phase: { kind: 'lobby' }, waiting: [], aiActAt: null })
    expect(game.seats.every((s) => s.kind === 'empty')).toBe(true)
    thunee.checkInvariants(game)
    expect(thunee.seatsToAct(game)).toEqual([])
    expect(thunee.nextDeadline(game)).toBeNull()
  })

  test('the action schema admits a player’s actions and no system ones', () => {
    expect(thunee.actionSchema.safeParse({ type: 'sit', seat: 0, name: 'A' }).success).toBe(true)
    expect(thunee.actionSchema.safeParse({ type: 'call', amount: 10 }).success).toBe(true)
    expect(thunee.actionSchema.safeParse({ type: 'tick' }).success).toBe(false)
    expect(thunee.actionSchema.safeParse({ type: 'setConnected', seat: 0, connected: true }).success).toBe(false)
  })
})
