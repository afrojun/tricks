import { describe, expect, test } from 'vitest'
import { sameCard } from '../../../kit/cards'
import { collectCards } from '../../../kit/testing'
import { apply, createGame } from './apply'
import { availableActions } from './available'
import { VOID } from './deals'
import { Table, cards, playOf } from './testing'
import type { Game } from './types'
import { viewFor } from './view'

/** VOID without passing: seat 3 wins the first trick; on the second, seat 1 throws a heart and seat 2 reneges. */
const twoTricks = () => new Table({ passing: 'none' }).deal(VOID).play('2c 4d 9c Ac  Qc 3c 4h 8d')

describe('views', () => {
  test('a view holds the viewer’s own hand, hand sizes, the scores, the round number and the pass direction', () => {
    const t = new Table().deal(VOID)
    const view = viewFor(t.game, 1)
    expect(view).toMatchObject({ seat: 1, playerCount: 4, scores: [0, 0, 0, 0], roundNumber: 1, direction: 'left' })
    expect(view.phase).toMatchObject({ kind: 'passing', hand: cards(VOID[1]), handCounts: [13, 13, 13, 13], chosen: [], choice: null })
    expect(viewFor(t.game, null).phase).toMatchObject({ hand: [], handCounts: [13, 13, 13, 13], choice: null })
  })

  test('in play: the current trick, the last completed trick, the winners of earlier ones, the turn, hearts broken and points taken', () => {
    const t = twoTricks()
    const paused = viewFor(t.game, 0).phase
    if (paused.kind !== 'trickPause') throw new Error(paused.kind)
    expect(paused.tricks.map((x) => x.winner)).toEqual([3, 3])
    expect(paused.tricks.map((x) => x.plays.length)).toEqual([0, 4])
    expect(paused.tricks[1].plays).toEqual([
      { seat: 3, card: cards('Qc')[0] },
      { seat: 0, card: cards('3c')[0] },
      { seat: 1, card: cards('4h')[0] },
      { seat: 2, card: cards('8d')[0] },
    ])
    expect(paused).toMatchObject({ turn: null, heartsBroken: true, taken: [0, 0, 0, 1], current: [], handCounts: [11, 11, 11, 11] })
    expect(paused.deadline).toBe(t.now + 2000)

    t.endPause().play('Kc')
    const playing = viewFor(t.game, 0).phase
    expect(playing).toMatchObject({ kind: 'playing', turn: 0, current: [{ seat: 3, card: cards('Kc')[0] }], deadline: null })
  })

  test('full memory keeps every trick; what a player may do is the same with either memory', () => {
    const t = twoTricks()
    const full = viewFor(t.game, 0, 'full').phase
    if (full.kind !== 'trickPause') throw new Error(full.kind)
    expect(full.tricks.map((x) => x.plays.length)).toEqual([4, 4])
    t.endPause().play('Kc')
    for (const seat of [0, 1, 2, 3]) {
      expect(availableActions(viewFor(t.game, seat))).toEqual(availableActions(viewFor(t.game, seat, 'full')))
    }
  })

  test('never in a view: another hand, an earlier trick’s cards, handBefore, broke or the salt', () => {
    const t = twoTricks()
    const play = playOf(t.game)
    expect(play.tricks[1].plays[3].broke).toEqual(['followSuit'])
    const firstTrick = play.tricks[0].plays.map((p) => p.card)
    for (const seat of [0, 1, 2, 3, null]) {
      const view = viewFor(t.game, seat)
      const hidden = [...play.hands.filter((_, s) => s !== seat).flat(), ...firstTrick]
      expect(collectCards(view).filter((c) => hidden.some((h) => sameCard(h, c)))).toEqual([])
      const text = JSON.stringify(view)
      for (const secret of ['"handBefore":', '"broke":', '"aiSalt":']) expect(text).not.toContain(secret)
    }
  })

  test('the viewer sees what it gave and received all round; a spectator sees neither', () => {
    const t = new Table().deal(VOID).pass(['2c 3c 4c', '4d 5d 6d', '9c 10c Jc', 'Qc Kc Ac']).play('2c')
    expect(viewFor(t.game, 2).phase).toMatchObject({ received: cards('4d 5d 6d'), gave: cards('9c 10c Jc') })
    expect(viewFor(t.game, null).phase).toMatchObject({ received: [], gave: [] })
  })

  test('a hidden persona stays out of every view until the game is over', () => {
    let game = createGame()
    const run = (actor: number | null, action: Parameters<typeof apply>[2]) => {
      const result = apply(game, actor, action, { now: 0, rng: () => 0.5 })
      if ('rejected' in result) throw new Error(result.rejected)
      game = result.game
    }
    run(null, { type: 'sit', seat: 0, name: 'Host' })
    run(0, { type: 'addAi', seat: 1, persona: 'surprise' })
    run(0, { type: 'addAi', seat: 2 })
    run(0, { type: 'addAi', seat: 3 })
    run(0, { type: 'start' })
    for (const seat of [0, 1, null]) expect(viewFor(game, seat).seats[1].persona).toBeNull()
    const over: Game = { ...game, phase: { kind: 'gameOver', winner: 0, summary: null as never } }
    expect(viewFor(over, 0).seats[1].persona).toBe(game.seats[1].persona)
  })
})
