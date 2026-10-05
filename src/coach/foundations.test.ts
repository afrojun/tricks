import { describe, expect, test } from 'vitest'
import { type Game, type View, SUIT_NAME, viewFor } from '../engine'
import { Table, card } from '../engine/testing'
import { advise } from './advise'
import type { TopicId } from './note'
import { reads, runningPoints } from './reads'
import { situation } from './situation'
import { TOPICS, topicsFor } from './topics'

// Dealer 0: seat 1 is trumper (team 1), seat 2 leads; trump is spades. Order of play 2, 3, 0, 1.
const D1 = ['Jh 9h Ks Qs 10c Qd', 'Js 9s As 10s Kd Qc', 'Jc 9c Ac Kc Ah 10h', 'Jd 9d Ad 10d Kh Qh']
const THUNEE = ['10d Kd Qd 10c Kc Qc', 'Js 9s As 10s Ks Jh', 'Qs 9h Ah Jc 9c Ac', 'Jd 9d Ad 10h Kh Qh']

const table = (hands: string[]) => new Table(4, { redealIfNoTrumps: false }).deal(hands)
const played = (plays: string, hands = D1) => {
  const t = table(hands).toPlay('spades')
  return plays ? t.play(plays) : t
}
const you = (game: Game, seat = 0): View => viewFor(game, seat, 'full')
const words = (...notes: ({ title: string; body: string } | null)[]) => notes.map((n) => (n ? `${n.title} ${n.body}` : '')).join(' ')

describe('topics', () => {
  test('every topic has a title and something to read', () => {
    for (const [id, topic] of Object.entries(TOPICS)) {
      expect(topic.title, id).not.toBe('')
      expect(topic.paragraphs.length, id).toBeGreaterThan(0)
    }
  })

  test('the first deal introduces the cards and calling', () => {
    const t = table(D1)
    expect(topicsFor(you(t.game), { type: 'dealt', roundNumber: 1, dealer: 0, half: 1 })).toEqual(['cards', 'calling'] satisfies TopicId[])
  })

  test('a chance to claim Jodhi introduces Jodhi', () => {
    // Seat 0 holds K and Q of spades (trump). Team 0 wins the first trick with the Jc.
    const t = played('Jc Qh 10c Qc')
    expect(topicsFor(you(t.game), null)).toContain('jodhi')
  })

  test("a two-player game's second half introduces the two-player game", () => {
    const t = table(D1)
    expect(topicsFor(you(t.game), { type: 'dealt', roundNumber: 1, dealer: 0, half: 2 })).toContain('twoPlayer')
  })
})

describe('reads', () => {
  test('a seat that did not follow the suit led has none of it', () => {
    const t = played('Jc Qh')
    expect(reads(you(t.game))).toEqual([{ seat: 3, voidIn: 'clubs' }])
  })

  test('nothing is read from players who followed suit', () => {
    expect(reads(you(played('Jc').game))).toEqual([])
  })

  test('running points count every trick each side has won', () => {
    const t = played('Jc Qh 10c Qc').endPause()
    // Team 0 (seat 2) won Jc Qh 10c Qc: 30 + 2 + 10 + 2.
    expect(runningPoints(you(t.game))).toEqual([44, 0])
  })
})

describe('situation', () => {
  test("says who is winning when it is the partner", () => {
    const text = words(situation(you(played('Jc Qh').game)))
    expect(text).toContain('P2')
    expect(text).toContain('J♣')
    expect(text.toLowerCase()).toContain('partner')
  })

  test('tells you to follow suit when you can', () => {
    expect(words(situation(you(played('Jc Qh').game)))).toContain('Clubs')
  })

  test('explains the choice while calling', () => {
    const text = words(situation(you(table(D1).game)))
    expect(text).toMatch(/call|pass/i)
  })

  test('says nothing when it is not your decision', () => {
    expect(situation(you(played('').game))).toBeNull()
  })

  test('a Thunee round never names a trump that is still hidden', () => {
    const t = table(THUNEE).advance(10_000)
    t.do(1, { type: 'chooseTrump', choice: 'spades' }).do(1, { type: 'callThunee' }).advance(10_000)
    // Seat 1 leads; give seat 2 (then 3, 0) the decision before any trump could be revealed.
    for (const seat of [0, 2, 3]) {
      const view = you(t.game, seat)
      const text = words(situation(view), advise(view)?.note ?? null)
      expect(text).not.toContain(SUIT_NAME.spades)
      expect(text).not.toMatch(/trump is/i)
    }
  })
})

describe('advise', () => {
  test('names the card the computer would play, with its reason', () => {
    const a = advise(you(played('Jc Qh').game))!
    expect(a.action).toEqual({ type: 'playCard', card: card('10c') })
    expect(a.note.cards).toEqual([card('10c')])
    expect(a.note.body.toLowerCase()).toContain('partner')
  })

  test('nothing to advise when it is not your decision', () => {
    expect(advise(you(played('').game))).toBeNull()
  })

  test('a provable renege is worth a challenge', () => {
    // Seat 3 holds the Qc but plays a heart on the club lead, then plays the Qc next trick.
    const renege = ['Jh 9h Ks Qs 10c Qd', 'Js 9s As 10s Kd Qh', 'Jc 9c Ac Kc Ah 10h', 'Jd 9d Ad 10d Kh Qc']
    const r = table(renege).toPlay('spades').play('Jc Kh 10c Qh  9c Qc')
    const a = advise(you(r.game))
    expect(a?.action).toEqual({ type: 'challengePlay', seat: 3 })
    expect(a?.note.body).toContain('P3')
  })

  test('no advice mentions bidding', () => {
    for (const plays of ['', 'Jc', 'Jc Qh', 'Jc Qh 10c']) {
      const t = played(plays)
      for (const seat of [0, 1, 2, 3]) expect(words(advise(you(t.game, seat))?.note ?? null, situation(you(t.game, seat)))).not.toMatch(/\bbid/i)
    }
  })

  test('a trump that wins says so', () => {
    // Seat 1 has no clubs left on trick 2 and trumps with the 10s.
    const a = advise(you(played('Jc Qh 10c Qc  9c Kh Qd').game, 1))!
    expect(a.note.body).toContain('trump')
  })

  test('the last card is simply your only card', () => {
    const t = played('Jc Qh 10c Qc  9c Kh Qd 10s  Js 10h 10d Qs  9s Ah Ad Ks  As Ac 9d 9h  Kd Kc Jd')
    expect(advise(you(t.game))!.note.body).toMatch(/only card/)
  })
})

