import { describe, expect, test } from 'vitest'
import { type Game, viewFor } from '../engine'
import { Table, card, cards } from '../engine/testing'
import { decide } from './choose'
import { HONEST } from './mind'

// Dealer 0: seat 1 is trumper (team 1), seat 2 leads; trump is spades. Order of play 2, 3, 0, 1.
const D1 = ['Jh 9h Ks Qs 10c Qd', 'Js 9s As 10s Kd Qc', 'Jc 9c Ac Kc Ah 10h', 'Jd 9d Ad 10d Kh Qh']
// Seat 3 trumps the heart lead; seat 1, last, holds no hearts and can feed points.
const FEED = ['Qh Kh 10c Kc Qc Qd', '9s Jd 9d Ad 10d Kd', 'Ah 10h Jh 9h Jc 9c', 'Js As 10s Ks Qs Ac']
const THUNEE = ['10d Kd Qd 10c Kc Qc', 'Js 9s As 10s Ks Jh', 'Qs 9h Ah Jc 9c Ac', 'Jd 9d Ad 10h Kh Qh']

const table = (hands: string[]) => new Table(4, { redealIfNoTrumps: false }).deal(hands)
const played = (hands: string[], plays: string) => {
  const t = table(hands).toPlay('spades')
  return plays ? t.play(plays) : t
}
const turn = (game: Game) => (game.phase as { turn: number }).turn
const decideFor = (game: Game, seat = turn(game)) => decide(viewFor(game, seat, 'full'), HONEST)

describe('calling', () => {
  test('two jacks are worth calling 30 for', () => {
    const t = table(['Jh Jd Qs Qc 10c 10d', 'Ks Kc 9s 9c Kd Qd', 'Js Jc Ah 10h As Ac', '9h 9d Ad 10s Kh Qh'])
    expect(decideFor(t.game, 2)).toMatchObject({ action: { type: 'call', amount: 10 }, reason: { code: 'callStrong', jacks: 2, limit: 30 } })
  })

  test('nothing high is a pass', () => {
    const t = table(['Kh Qh Ks Qs 10c Qd', 'Js 9s As 10s Kd Qc', 'Jc 9c Ac Kc Ah 10h', 'Jd 9d Ad 10d Jh 9h'])
    expect(decideFor(t.game, 0)).toMatchObject({ action: { type: 'pass' }, reason: { code: 'passWeak', jacks: 0, limit: 0 } })
  })
})

describe('trump', () => {
  test('the strongest suit, naming the cards behind it', () => {
    const t = table(D1).advance(10_000)
    const d = decideFor(t.game, 1)
    expect(d.action).toEqual({ type: 'chooseTrump', choice: 'spades' })
    expect(d.reason).toEqual({ code: 'strongestSuit', suit: 'spades', cards: cards('Js 9s As 10s') })
  })
})

describe('playing', () => {
  test('leads a plain-suit jack', () => {
    expect(decideFor(played(D1, '').game)).toEqual({ action: { type: 'playCard', card: card('Jc') }, reason: { code: 'leadBoss', card: card('Jc') } })
  })

  test('throws the cheapest card when nothing can win', () => {
    expect(decideFor(played(D1, 'Jc').game)).toMatchObject({ reason: { code: 'cannotWin', card: card('Qh') } })
  })

  test('stays low under a partner who is winning when others are still to play', () => {
    expect(decideFor(played(D1, 'Jc Qh').game)).toMatchObject({ reason: { code: 'holdUnderPartner', card: card('10c') } })
  })

  test('wins as cheaply as it can', () => {
    const t = played(D1, 'Jc Qh 10c Qc  9c Kh Qd')
    expect(decideFor(t.game)).toMatchObject({ reason: { code: 'cheapestWinner', card: card('10s') } })
  })

  test('feeds points to a partner who has the trick, when playing last', () => {
    expect(decideFor(played(FEED, 'Ah Js Qh').game)).toMatchObject({ reason: { code: 'feedPartner', card: card('Jd') } })
  })

  test('the Thunee caller leads high', () => {
    const t = table(THUNEE).advance(10_000)
    t.do(1, { type: 'chooseTrump', choice: 'spades' }).do(1, { type: 'callThunee' }).advance(10_000)
    expect(decideFor(t.game, 1)).toMatchObject({ reason: { code: 'thuneeLeadHigh', card: card('Js') } })
  })

  test('a cheapest card that still beats the partner says so', () => {
    // Partner (seat 2) leads A♥, seat 3 follows Q♥; seat 0 holds only J♥ and 9♥ in hearts — both beat the ace.
    const t = table(['Jh 9h Ks Qs 10c Qd', 'Js 9s As 10s Kd Qc', 'Ah Jc 9c Ac Kc 10h', 'Jd 9d Ad 10d Kh Qh']).toPlay('spades').play('Ah Qh')
    expect(decideFor(t.game)).toMatchObject({ action: { type: 'playCard', card: card('9h') }, reason: { code: 'cheapOvertake', card: card('9h') } })
  })
})
