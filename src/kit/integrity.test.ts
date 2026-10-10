import { describe, expect, test } from 'vitest'
import type { Card, Suit } from './cards'
import {
  type Proof,
  type SeenPlay,
  brokenRules,
  chanceOfVoid,
  exposes,
  firstCheat,
  legalCards,
  noticeOdds,
  noticed,
  playProofs,
  recordPlay,
} from './integrity'
import { TRAITS, roll } from './mind'
import { followSuit } from './tricks'

const LETTERS: Record<string, Suit> = { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' }
const card = (text: string): Card => ({ suit: LETTERS[text.slice(-1)], rank: text.slice(0, -1) })
const cards = (text: string) => text.trim().split(/\s+/).map(card)

/**
 * Tricks as an observer saw them, each a string of cards in play order, led by
 * `leaders[i]`. Every card off the led suit carries the follow-suit excuse.
 */
function seen(tricks: string[], leaders: number[], deals: number[] = tricks.map(() => 0)): SeenPlay<Card>[] {
  return tricks.flatMap((text, trick) => {
    const played = cards(text)
    return played.map((c, i) => ({
      seat: (leaders[trick] + i) % 4,
      card: c,
      trick,
      deal: deals[trick],
      excuses: followSuit(c, i === 0 ? null : played[0].suit),
    }))
  })
}

describe('the record', () => {
  test('a broken excuse is recorded, with the hand the card came from', () => {
    const hand = cards('Jh 9c')
    const record = recordPlay(2, card('9c'), hand, followSuit(card('9c'), 'hearts'))
    expect(record).toEqual({ seat: 2, card: card('9c'), handBefore: hand, broke: ['followSuit'] })
    expect(record.handBefore).not.toBe(hand)
  })

  test('a legal play records nothing', () => {
    expect(recordPlay(2, card('9c'), cards('9c Qd'), followSuit(card('9c'), 'hearts')).broke).toEqual([])
    expect(recordPlay(2, card('Jh'), cards('Jh 9c'), followSuit(card('Jh'), 'hearts')).broke).toEqual([])
  })

  test('each excuse is judged on its own', () => {
    const excuses = [
      { rule: 'one', without: (c: Card) => c.suit === 'hearts' },
      { rule: 'two', without: (c: Card) => c.suit === 'spades' },
      { rule: 'three', without: (c: Card) => c.rank === 'A' },
    ]
    expect(brokenRules(cards('Qh Ad Kd'), excuses)).toEqual(['one', 'three'])
    expect(brokenRules([], excuses)).toEqual([])
  })

  test('the legal cards are those that break nothing', () => {
    const hand = cards('Jh 9c Qh Kd')
    expect(legalCards(hand, (c) => followSuit(c, 'hearts'))).toEqual(cards('Jh Qh'))
    expect(legalCards(hand, (c) => followSuit(c, 'spades'))).toEqual(hand)
  })

  test('the verdict is the accused’s first play that broke a rule', () => {
    const plays = [
      { seat: 1, card: card('Jh'), handBefore: [], broke: [] },
      { seat: 2, card: card('Qh'), handBefore: [], broke: ['followSuit'] },
      { seat: 1, card: card('9c'), handBefore: [], broke: ['followSuit', 'undercut'] },
      { seat: 1, card: card('Kd'), handBefore: [], broke: ['followSuit'] },
    ]
    expect(firstCheat(plays, 1)).toBe(plays[2])
    expect(firstCheat(plays, 3)).toBeNull()
    expect(firstCheat(plays.slice(0, 2), 1)).toBeNull()
  })
})

describe('proofs', () => {
  // Thunee's "clumsy" cheat: seat 1 trumps a club trick it should have followed, then leads its club at once.
  const clumsy = () => seen(['Kc Qh 10c Js', 'Qc'], [2, 1])
  // Thunee's "patient" cheat: seat 1 discards on a club trick, then holds its club until trick 6.
  const patient = () => seen(['Kc Qh 10c Kd', 'Qd 10s 10h Jd', 'As Ah Kh Qs', '9s Ac 10d Ks', 'Js 9c Ad Jh', 'Qc'], [2, 0, 1, 1, 1, 1])

  test('a later card proves an earlier excuse false', () => {
    expect(playProofs(clumsy(), (s) => s % 2 === 1)).toEqual([
      { id: 'followSuit:1:0:1', accused: 1, rule: 'followSuit', claim: null, gap: 0, salience: 1 },
    ])
  })

  test('the gap counts the tricks between the cheat and the card that shows it up', () => {
    const proofs = playProofs(patient(), () => true)
    expect(proofs.map((p) => [p.id, p.gap])).toEqual([['followSuit:1:0:5', 4]])
  })

  test('only suspects are accused, and a fair round holds no proof', () => {
    expect(playProofs(clumsy(), (s) => s % 2 === 0)).toEqual([])
    expect(playProofs(seen(['Jc Qh 10c Qc', '9c Kh Qd 10s'], [2, 2]), () => true)).toEqual([])
  })

  test('a card from a different deal proves nothing', () => {
    expect(playProofs(seen(['Kc Qh 10c Js', 'Qc'], [2, 1], [1, 2]), () => true)).toEqual([])
  })

  test('a card played before the excuse proves nothing', () => {
    // Seat 1 plays a heart in trick 0, then shows a heart void in trick 1: no contradiction.
    expect(playProofs(seen(['Kh Qh 10h Jh', 'Ah Js'], [0, 0]), () => true)).toEqual([])
  })

  test('each excuse of a play is proved on its own', () => {
    const plays: SeenPlay<Card>[] = [
      {
        seat: 1,
        card: card('Qs'),
        trick: 0,
        deal: 0,
        excuses: [
          { rule: 'followSuit', without: (c) => c.suit === 'hearts' },
          { rule: 'undercut', without: (c) => c.suit !== 'spades' },
        ],
      },
      { seat: 1, card: card('Jc'), trick: 1, deal: 0, excuses: [] },
      { seat: 1, card: card('Qh'), trick: 3, deal: 0, excuses: [] },
    ]
    expect(playProofs(plays, () => true).map((p) => [p.id, p.rule, p.gap])).toEqual([
      ['followSuit:1:0:3', 'followSuit', 2],
      ['undercut:1:0:1', 'undercut', 0],
      ['undercut:1:0:3', 'undercut', 2],
    ])
  })

  test('a proof id is `<rule>:<seat>:<trick>:<revealing trick>`, so Thunee keeps its ids by naming its rules', () => {
    // How src/ai/suspicion.ts builds them today.
    const thuneeId = (rule: 'renege' | 'undercut', seat: number, trick: number, revealTrick: number) => `${rule}:${seat}:${trick}:${revealTrick}`
    const play = (seat: number, c: string, trick: number, rule?: string, without?: (x: Card) => boolean): SeenPlay<Card> => ({
      seat,
      card: card(c),
      trick,
      deal: 0,
      excuses: rule && without ? [{ rule, without }] : [],
    })
    // Thunee's "clumsy" and "patient" reneges, and its undercut shown up by a plain card.
    const clumsy = [play(1, 'Js', 0, 'renege', (x) => x.suit === 'clubs'), play(1, 'Qc', 1)]
    const patient = [play(1, 'Kd', 0, 'renege', (x) => x.suit === 'clubs'), play(1, 'Qc', 5)]
    const undercut = [play(1, 'Qs', 0, 'undercut', (x) => x.suit !== 'spades'), play(1, 'Jc', 1)]
    expect(playProofs(clumsy, () => true).map((p) => p.id)).toEqual([thuneeId('renege', 1, 0, 1)])
    expect(playProofs(patient, () => true).map((p) => p.id)).toEqual([thuneeId('renege', 1, 0, 5)])
    expect(playProofs(undercut, () => true).map((p) => p.id)).toEqual([thuneeId('undercut', 1, 0, 1)])
    expect(playProofs(clumsy, () => true)[0].id).toBe('renege:1:0:1')

    // The same id, gap and salience give the same look as Thunee's own loop, salt by salt.
    const proof = { ...playProofs(patient, () => true)[0], salience: 1.2 }
    for (let salt = 1; salt <= 500; salt++) {
      const thunee = roll(salt, 2, thuneeId('renege', 1, 0, 5)) < noticeOdds(TRAITS.sharp.attention, 4, 1.2)
      expect(noticed([proof], { persona: 'sharp', salt }, 2) !== null).toBe(thunee)
    }
  })

  test('a game may weigh each proof by the cheat and the card that shows it up; without that, salience is 1', () => {
    const plays = patient()
    const weighed: [number, number, string][] = []
    const salience = (cheat: SeenPlay<Card>, reveal: SeenPlay<Card>) => {
      weighed.push([cheat.trick, reveal.trick, `${reveal.card.rank}${reveal.card.suit}`])
      return reveal.card.rank === 'Q' ? 1.2 : 1
    }
    expect(playProofs(plays, () => true, salience)).toEqual([
      { id: 'followSuit:1:0:5', accused: 1, rule: 'followSuit', claim: null, gap: 4, salience: 1.2 },
    ])
    expect(weighed).toEqual([[0, 5, 'Qclubs']])
    expect(playProofs(plays, () => true)[0].salience).toBe(1)
  })

  test('a card exposes an earlier excuse of one’s own', () => {
    const own = clumsy().filter((p) => p.seat === 1 && p.trick === 0)
    expect(exposes(card('Ac'), own)).toBe(true)
    expect(exposes(card('Kd'), own)).toBe(false)
    expect(exposes(card('Ac'), [])).toBe(false)
  })

  test('a settled play is never the cheat, but still shows up a later one', () => {
    // Seat 1 trumps a club trick, is judged for it, then discards on another club trick and leads a club.
    const plays = seen(['Kc Qh 10c Js', 'Ac Kd 9c Jc', 'Qc'], [2, 0, 1]).map((p) => (p.trick === 0 ? { ...p, settled: true } : p))
    expect(playProofs(plays, () => true).map((p) => p.id)).toEqual(['followSuit:1:1:2'])
    expect(exposes(card('Ac'), plays.filter((p) => p.seat === 1 && p.trick === 0))).toBe(false)
    expect(exposes(card('Ac'), plays.filter((p) => p.seat === 1 && p.trick === 1))).toBe(true)
  })
})

describe('noticing', () => {
  const proof = (id: string, gap: number, salience = 1): Proof => ({ id, accused: 1, rule: 'followSuit', claim: null, gap, salience })

  test('the chance of noticing fades with the tricks in between and rises with salience', () => {
    expect(noticeOdds(0.95, 4, 1.2)).toBeCloseTo(0.285)
    expect(noticeOdds(0.6, 0, 1)).toBeCloseTo(0.6)
    expect(noticeOdds(0.6, 2, 1)).toBeCloseTo(0.3)
    expect(noticeOdds(0.6, 0, 1.3 * 1.3 * 1.2)).toBe(1)
  })

  test('a proof certain to be noticed always is', () => {
    for (let salt = 1; salt <= 50; salt++) {
      const p = proof('followSuit:1:0:1', 0, 2)
      expect(noticed([p], { persona: 'straight', salt }, 2)).toBe(p)
    }
  })

  test('noticing is stable across calls, and a proof missed once stays missed', () => {
    const early = proof('followSuit:1:0:5', 4, 1.2)
    const late = proof('followSuit:3:2:6', 3)
    let caught = 0
    for (let salt = 1; salt <= 2000; salt++) {
      const mind = { persona: 'sharp' as const, salt }
      const once = noticed([early], mind, 2)
      expect(noticed([{ ...early }], mind, 2)).toEqual(once)
      if (once) caught++
      // A later proof never revives a missed one, and never hides a noticed one.
      const both = noticed([early, late], mind, 2)
      expect(both === null || both === late || both === early).toBe(true)
      expect(both === early).toBe(once !== null)
    }
    expect(caught / 2000).toBeGreaterThan(0.24)
    expect(caught / 2000).toBeLessThan(0.33)
  })

  test('each observer has its own look', () => {
    const p = proof('followSuit:1:0:2', 1)
    const looks = Array.from({ length: 200 }, (_, salt) => [0, 2, 3].map((o) => noticed([p], { persona: 'straight', salt }, o) !== null))
    expect(looks.some(([a, b]) => a !== b)).toBe(true)
  })

  test('nothing to notice is nothing noticed', () => {
    expect(noticed([], { persona: 'sharp', salt: 1 }, 0)).toBeNull()
  })
})

describe('void odds', () => {
  test('the chance of a real void draws the hidden hand from every card the observer cannot place', () => {
    expect(chanceOfVoid(16, 4, 5)).toBeCloseTo(792 / 4368, 12)
    expect(chanceOfVoid(16, 3, 5)).toBeCloseTo(1287 / 4368, 12)
    expect(chanceOfVoid(17, 4, 5)).toBeCloseTo(1287 / 6188, 12)
    expect(chanceOfVoid(6, 3, 2)).toBeCloseTo(0.2, 12)
    expect(chanceOfVoid(5, 0, 3)).toBe(1)
    expect(chanceOfVoid(3, 3, 1)).toBe(0)
    // The numbers a 52-card game works with.
    expect(chanceOfVoid(39, 12, 13)).toBeCloseTo(0.00247, 5)
  })
})
