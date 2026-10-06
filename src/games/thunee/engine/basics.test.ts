import { describe, expect, test } from 'vitest'
import { CARD_POINTS, RANKS, cardId, createDeck, pointsOf, rankStrength, shuffle } from './cards'
import { ballsTarget, winningTeam } from './predicates'
import { CLASSIC_APP, TRADITIONAL, diffRules, resolveRules } from './rules'
import { next, partnerOf, seatsFrom, teamOf } from './seats'
import { card, cards, seededRng } from './testing'
import { isLegalPlay, trickWinner } from './tricks'

describe('cards', () => {
  test('the deck has 24 unique cards worth 304 points', () => {
    const deck = createDeck()
    expect(new Set(deck.map(cardId)).size).toBe(24)
    expect(pointsOf(deck)).toBe(304)
    expect(CARD_POINTS).toEqual({ J: 30, '9': 20, A: 11, '10': 10, K: 3, Q: 2 })
  })

  test('ranks run J > 9 > A > 10 > K > Q', () => {
    const strengths = RANKS.map(rankStrength)
    expect(strengths).toEqual([...strengths].sort((a, b) => b - a))
    expect(RANKS).toEqual(['J', '9', 'A', '10', 'K', 'Q'])
  })

  test('shuffle is a deterministic permutation for a seeded rng', () => {
    const a = shuffle(createDeck(), seededRng(7))
    const b = shuffle(createDeck(), seededRng(7))
    const c = shuffle(createDeck(), seededRng(8))
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
    expect(new Set(a.map(cardId)).size).toBe(24)
  })
})

describe('rules', () => {
  test('no overrides resolves to Traditional', () => {
    expect(resolveRules({})).toEqual(TRADITIONAL)
  })

  test('a rule set round-trips through its diff from Traditional', () => {
    expect(resolveRules(diffRules(CLASSIC_APP))).toEqual(CLASSIC_APP)
    expect(diffRules(TRADITIONAL)).toEqual({})
  })

  test('the target rises to 13 only when the setting is on and a Khanaak was called', () => {
    expect(ballsTarget(TRADITIONAL, true)).toBe(12)
    expect(ballsTarget(CLASSIC_APP, false)).toBe(12)
    expect(ballsTarget(CLASSIC_APP, true)).toBe(13)
  })

  test('two to clear requires a two-ball lead at the target', () => {
    const rules = resolveRules({ twoToClear: true })
    expect(winningTeam([12, 11], 12, rules)).toBeNull()
    expect(winningTeam([13, 11], 12, rules)).toBe(0)
    expect(winningTeam([12, 11], 12, TRADITIONAL)).toBe(0)
    expect(winningTeam([11, 11], 12, TRADITIONAL)).toBeNull()
  })
})

describe('seats', () => {
  test('play runs to the right and teams are by parity', () => {
    expect([0, 1, 2, 3].map((s) => next(s, 4))).toEqual([1, 2, 3, 0])
    expect([0, 1].map((s) => next(s, 2))).toEqual([1, 0])
    expect([0, 1, 2, 3].map(teamOf)).toEqual([0, 1, 0, 1])
    expect(partnerOf(1, 4)).toBe(3)
    expect(partnerOf(1, 2)).toBeNull()
    expect(seatsFrom(2, 4)).toEqual([2, 3, 0, 1])
  })
})

describe('tricks', () => {
  const plays = (text: string) => cards(text).map((c, seat) => ({ seat, card: c }))

  test('the highest card of the led suit wins when no trump is played', () => {
    expect(trickWinner(plays('10h Jh 9h Jd'), 'spades')).toBe(1)
    expect(trickWinner(plays('Qh Jd Jc Js'), null)).toBe(0)
  })

  test('any trump beats the led suit and the highest trump wins', () => {
    expect(trickWinner(plays('Jh Qs 9h Ks'), 'spades')).toBe(3)
    expect(trickWinner(plays('Qs Js 9h 9s'), 'spades')).toBe(1)
  })

  test('following suit is required when able', () => {
    const hand = cards('Jh 9c')
    expect(isLegalPlay(card('9c'), hand, cards('Ah'), 'spades', TRADITIONAL)).toBe(false)
    expect(isLegalPlay(card('Jh'), hand, cards('Ah'), 'spades', TRADITIONAL)).toBe(true)
    expect(isLegalPlay(card('9c'), hand, [], 'spades', TRADITIONAL)).toBe(true)
    expect(isLegalPlay(card('9c'), cards('9c Qd'), cards('Ah'), 'spades', TRADITIONAL)).toBe(true)
  })

  test('undercutting is illegal unless the hand is all trumps, when the restriction is on', () => {
    const trick = cards('Ah Js') // hearts led, already trumped with the Jack
    expect(isLegalPlay(card('Qs'), cards('Qs 9c'), trick, 'spades', TRADITIONAL)).toBe(false)
    expect(isLegalPlay(card('Qs'), cards('Qs Ks'), trick, 'spades', TRADITIONAL)).toBe(true)
    expect(isLegalPlay(card('9c'), cards('Qs 9c'), trick, 'spades', TRADITIONAL)).toBe(true)
    expect(isLegalPlay(card('Qs'), cards('Qs 9c'), trick, 'spades', CLASSIC_APP)).toBe(true)
    // Overtrumping is always fine.
    expect(isLegalPlay(card('Js'), cards('Js 9c'), cards('Ah Qs'), 'spades', TRADITIONAL)).toBe(true)
  })
})
