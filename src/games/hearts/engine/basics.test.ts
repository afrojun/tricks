import { describe, expect, test } from 'vitest'
import { SUITS, cardId } from '../../../kit/cards'
import { JACK_OF_DIAMONDS, QUEEN_OF_SPADES, RANKS, createDeck, isPointCard, penaltyPoints, strength, trickPoints } from './cards'
import { OMNIBUS, OMNIBUS_OVERRIDES, STANDARD, diffRules, passDirection, passTarget, resolveRules } from './rules'
import { card, cards } from './testing'

describe('cards', () => {
  test('the deck has 52 unique cards, thirteen in each suit', () => {
    const deck = createDeck()
    expect(new Set(deck.map(cardId)).size).toBe(52)
    for (const suit of SUITS) expect(deck.filter((c) => c.suit === suit)).toHaveLength(13)
  })

  test('in each suit the ace is high and the two is low', () => {
    expect(RANKS).toEqual(['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'])
    const strengths = cards('Ah Kh Qh Jh 10h 9h 8h 7h 6h 5h 4h 3h 2h').map(strength)
    expect(strengths).toEqual([...strengths].sort((a, b) => b - a))
    expect(new Set(strengths).size).toBe(13)
    expect(strength(card('2c'))).toBeLessThan(strength(card('3c')))
  })

  test('each heart is a point and the queen of spades thirteen: 26 in all', () => {
    expect(penaltyPoints(cards('2h Ah'))).toBe(2)
    expect(penaltyPoints([QUEEN_OF_SPADES])).toBe(13)
    expect(penaltyPoints(cards('Ks As Jd 2c'))).toBe(0)
    expect(penaltyPoints(createDeck())).toBe(26)
    expect(createDeck().filter(isPointCard)).toHaveLength(14)
    expect(isPointCard(JACK_OF_DIAMONDS)).toBe(false)
  })

  test('the jack of diamonds is worth -10 to whoever takes it, only under its rule', () => {
    const trick = cards('Jd 5h Qs 2d')
    expect(trickPoints(trick, STANDARD)).toBe(14)
    expect(trickPoints(trick, OMNIBUS)).toBe(4)
    expect(trickPoints(createDeck(), OMNIBUS)).toBe(16)
  })
})

describe('house rules', () => {
  test('Standard is the default', () => {
    expect(STANDARD).toEqual({
      allowCheating: true,
      gameEndsAt: 100,
      passing: 'rotating',
      moon: 'othersAdd',
      jackOfDiamonds: false,
      queenBreaksHearts: false,
      pointsOnFirstTrick: false,
    })
    expect(resolveRules({})).toEqual(STANDARD)
  })

  test('a preset stores only its differences; Omnibus adds the jack of diamonds', () => {
    expect(OMNIBUS_OVERRIDES).toEqual({ jackOfDiamonds: true })
    expect(diffRules(OMNIBUS)).toEqual(OMNIBUS_OVERRIDES)
    expect(diffRules(STANDARD)).toEqual({})
    const custom = resolveRules({ moon: 'shooterSubtracts', gameEndsAt: 50 })
    expect(resolveRules(diffRules(custom))).toEqual(custom)
  })

  test('rotating passes left, right, across, then not at all, and round again', () => {
    const rounds = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => passDirection(STANDARD, n))
    expect(rounds).toEqual(['left', 'right', 'across', 'none', 'left', 'right', 'across', 'none'])
  })

  test('the other passing rules: always left, or never', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      expect(passDirection(resolveRules({ passing: 'left' }), n)).toBe('left')
      expect(passDirection(resolveRules({ passing: 'none' }), n)).toBe('none')
    }
  })

  test('before the first round, the direction is the first round’s', () => {
    expect(passDirection(STANDARD, 0)).toBe('left')
  })

  test('seats run clockwise, so passing left gives to the next seat', () => {
    expect([0, 1, 2, 3].map((s) => passTarget(s, 'left'))).toEqual([1, 2, 3, 0])
    expect([0, 1, 2, 3].map((s) => passTarget(s, 'right'))).toEqual([3, 0, 1, 2])
    expect([0, 1, 2, 3].map((s) => passTarget(s, 'across'))).toEqual([2, 3, 0, 1])
  })
})
