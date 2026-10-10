import { describe, expect, test } from 'vitest'
import { type Game, type View, viewFor } from '../engine'
import { Table, card } from '../engine/testing'
import { check } from './check'

// Dealer 0: seat 1 is trumper (team 1), seat 2 leads; trump is spades. Order of play 2, 3, 0, 1.
const D1 = ['Jh 9h Ks Qs 10c Qd', 'Js 9s As 10s Kd Qc', 'Jc 9c Ac Kc Ah 10h', 'Jd 9d Ad 10d Kh Qh']
// Partner (seat 2) leads the 9c; seat 0 can overtake with the Jc or stay under with the Qc.
const OVER = ['Jc Qc Ks Qs 10h Qd', 'Js 9s As 10s Kd Qh', '9c Kc Ac Jh 9h Ah', 'Jd 9d Ad 10d Kh 10c']
const THUNEE = ['10d Kd Qd 10c Kc Qc', 'Js 9s As 10s Ks Jh', 'Qs 9h Ah Jc 9c Ac', 'Jd 9d Ad 10h Kh Qh']

const table = (hands: string[]) => new Table(4, { redealIfNoTrumps: false }).deal(hands)
const played = (plays: string, hands = D1) => {
  const t = table(hands).toPlay('spades')
  return plays ? t.play(plays) : t
}
const you = (game: Game, seat = 0): View => viewFor(game, seat, 'full')

describe('check', () => {
  test('breaking follow-suit', () => {
    // Clubs led; seat 0 holds the 10c but plays a heart.
    const note = check(you(played('Jc Qh').game), { type: 'playCard', card: card('Jh') })
    expect(note).toMatchObject({ tone: 'warn', rule: 'illegal' })
    expect(note!.body).toContain('4 balls')
    expect(check(you(played('Jc Qh').game), { type: 'playCard', card: card('10c') })).toBeNull()
  })

  test('taking the trick from a partner who has it', () => {
    const v = you(played('9c 10c', OVER).game)
    expect(check(v, { type: 'playCard', card: card('Jc') })).toMatchObject({ rule: 'overtakePartner' })
    expect(check(v, { type: 'playCard', card: card('Qc') })).toBeNull()
  })

  test('throwing points into a trick the opponents are winning', () => {
    const t = played('Jc Qh 10c Qc  9c Kh Qd 10s  Js')
    // Seat 2 to play after trumper's Js: holds hearts and clubs, no spades.
    const v = you(t.game, 2)
    expect(check(v, { type: 'playCard', card: card('Ah') })).toMatchObject({ rule: 'givePoints' })
    expect(check(v, { type: 'playCard', card: card('Kc') })).toBeNull()
  })

  test('calling more than the hand is worth', () => {
    const v = you(table(['Kh Qh Ks Qs 10c Qd', 'Js 9s As 10s Kd Qc', 'Jc 9c Ac Kc Ah 10h', 'Jd 9d Ad 10d Jh 9h']).game)
    expect(check(v, { type: 'call', amount: 30 })).toMatchObject({ rule: 'overcall' })
    expect(check(v, { type: 'call', amount: 10 })).toBeNull()
    expect(check(v, { type: 'pass' })).toBeNull()
  })

  test('calling a Thunee the hand cannot make', () => {
    const t = table(THUNEE).advance(10_000)
    t.do(1, { type: 'chooseTrump', choice: 'spades' })
    expect(check(you(t.game, 2), { type: 'callThunee' })).toMatchObject({ rule: 'thunee' })
  })

  test('moving on with a Jodhi in hand', () => {
    // Team 0 wins trick 1; seat 0 holds K and Q of spades.
    const v = you(played('Jc Qh 10c Qc').game)
    expect(check(v, { type: 'tick' })).toMatchObject({ rule: 'jodhiUnclaimed' })
  })

  test('a challenge with nothing to prove', () => {
    const v = you(played('Jc Qh 10c').game)
    expect(check(v, { type: 'challengePlay', seat: 3 })).toMatchObject({ rule: 'challenge' })
  })
})
