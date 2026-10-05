import { describe, expect, test } from 'vitest'
import { cardId } from '../../../kit/cards'
import { HONEST } from '../../../kit/mind'
import { availableActions } from '../engine/available'
import { type Card, createDeck } from '../engine/cards'
import { VOID } from '../engine/deals'
import type { RuleOverrides } from '../engine/rules'
import { Table, card, cards } from '../engine/testing'
import type { View } from '../engine/types'
import { viewFor } from '../engine/view'
import { chooseAction, decide, fallbackAction } from './choose'

const text = (c: Card) => `${c.rank}${c.suit[0]}`

/** `hands` where given, and the rest of the deck in order to the seats left null. */
function fill(hands: (string | null)[]): string[] {
  const used = new Set(hands.flatMap((h) => (h === null ? [] : cards(h).map(cardId))))
  const rest = createDeck().filter((c) => !used.has(cardId(c)))
  return hands.map((h) => h ?? rest.splice(0, 13).map(text).join(' '))
}

/** The decision of the seat to play, once any trick pause is over. */
const decideFor = (t: Table, seat?: number) => decide(viewFor(t.endPause().game, seat ?? t.turn, 'full'), HONEST)
const noPass = (hands: string[], overrides: RuleOverrides = {}) => new Table({ passing: 'none', ...overrides }).deal(hands)

/**
 * Seat 1 takes the first trick with its only club and leads from low spades,
 * hearts and two low diamonds; seat 2 holds the queen of spades.
 */
const H = [
  '2c 3c 4c 5c 6c 7c 8c 9c 10d Jd Qd Kd Ad',
  'Ac 2s 3s 4s 2d 3d 2h 3h 4h 5h 6h 7h 8h',
  '10c Jc Qs 5s 6s 7s 8s 4d 5d 6d 7d 9h 10h',
  'Qc Kc As Ks Js 10s 9s 8d 9d Jh Qh Kh Ah',
]
/** Seat 0 holds every club; seat 1 the ace and king of spades; seat 2 hearts; seat 3 the queen. */
const DISCARDS = [
  '2c 3c 4c 5c 6c 7c 8c 9c 10c Jc Qc Kc Ac',
  'As Ks 2s 3s 4s 5s Ad Kd Qd Jd 10d 9d 8d',
  '2h 3h 4h 5h 6h 7h 8h 2d 3d 4d 5d 6d 7d',
  'Qs Js 10s 9s 8s 7s 6s 9h 10h Jh Qh Kh Ah',
]
/** Seat 2 wins two club tricks, the second with a heart thrown on it, and leads holding the queen and the top hearts. */
const K = [
  '2c 5c 6c 7c 8c 2d 3d 4d 2s 3s 4s 5s 6s',
  '2h 3h 4h 5h 6h 7h 8h 9h 10h 7d 8d 9d 10d',
  'Ac Kc Qs Ah Kh Jd Qd Kd Ad 7s 8s 9s 10s',
  '3c 4c 9c 10c Jc Qc 5d 6d Js Ks As Jh Qh',
]
/** Seat 3 takes the queen and then a heart: every point so far. Seat 0 holds the ace and three of hearts. */
const L = [
  '2c 5c 6c 7c 2d 4d 6d 7d 3h Ah 2s 3s 4s',
  '3c 8c 9c Qs 2h 4h 5h 6h 7h 5s 6s 7s 8s',
  '4c 10c Jc 3d 5d 8d 9d 10d 8h 9h 9s 10s Js',
  'Ac Kc Qc Kd Qd Jd Ad Kh Qh Jh 10h Ks As',
]
/** L with seat 0's seven of diamonds and seat 3's king swapped, so seat 0 can beat the jack. */
const JACK = [
  '2c 5c 6c 7c 2d 4d 6d Kd 3h Ah 2s 3s 4s',
  L[1],
  L[2],
  'Ac Kc Qc 7d Qd Jd Ad Kh Qh Jh 10h Ks As',
]

describe('passing', () => {
  const passOf = (hand: string, overrides: RuleOverrides = {}) => decide(viewFor(new Table(overrides).deal(fill([hand, null, null, null])).game, 0, 'full'), HONEST)

  test('the queen and the top spades go when there are too few spades to hide them, then the highest card', () => {
    expect(passOf('Qs Ks 3s 2c 3c 4c 5c 6d 7d 8d 9d 10d 2h')).toEqual({
      action: { type: 'choosePass', cards: cards('Qs Ks 10d') },
      reason: {
        code: 'pass',
        picks: [
          { card: card('Qs'), why: 'queenOfSpades' },
          { card: card('Ks'), why: 'highSpade' },
          { card: card('10d'), why: 'highCard' },
        ],
      },
    })
  })

  test('five spades keep the queen; the top hearts go first', () => {
    expect(passOf('Qs Ks 5s 3s 2s Ah Kh 2c 3c 4c 6d 7d 8d')?.reason).toEqual({
      code: 'pass',
      picks: [
        { card: card('Ah'), why: 'highHeart' },
        { card: card('Kh'), why: 'highHeart' },
        { card: card('Ks'), why: 'highCard' },
      ],
    })
  })

  test('short clubs and diamonds are emptied, the shortest suit first and each highest first', () => {
    expect(passOf('9c Kd 3d 2s 4s 5s 6s 7s 2h 3h 4h 5h 6h')?.reason).toEqual({
      code: 'pass',
      picks: [
        { card: card('9c'), why: 'shortSuit' },
        { card: card('Kd'), why: 'shortSuit' },
        { card: card('3d'), why: 'shortSuit' },
      ],
    })
  })

  test('the jack of diamonds is kept when it counts, and low spades are passed last', () => {
    const hand = 'Jd 2d 9c 2s 4s 5s 6s 7s 2h 3h 4h 5h 6h'
    expect(passOf(hand)?.action).toEqual({ type: 'choosePass', cards: cards('9c Jd 2d') })
    expect(passOf(hand, { jackOfDiamonds: true })?.reason).toEqual({
      code: 'pass',
      picks: [
        { card: card('9c'), why: 'shortSuit' },
        { card: card('6h'), why: 'highCard' },
        { card: card('5h'), why: 'highCard' },
      ],
    })
  })

  test('earlier priorities fill the three places first', () => {
    expect(passOf('Qs As Ah Kh Qh 2c 3c 4c 5c 2d 3d 4d 5d')?.action).toEqual({ type: 'choosePass', cards: cards('Qs As Ah') })
  })

  test('nothing to choose once chosen', () => {
    const t = new Table().deal(VOID)
    const choice = chooseAction(viewFor(t.game, 0, 'full'), HONEST)!
    t.do(0, choice)
    expect(decide(viewFor(t.game, 0, 'full'), HONEST)).toBeNull()
  })
})

describe('the first trick', () => {
  test('the two of clubs leads', () => {
    expect(decideFor(noPass(VOID))).toEqual({ action: { type: 'playCard', card: card('2c') }, reason: { code: 'openingLead', card: card('2c') } })
  })

  test('the highest club, since no points can fall', () => {
    expect(decideFor(noPass(VOID).play('2c 4d'))?.reason).toEqual({ code: 'firstTrickHigh', card: card('Jc') })
    expect(decideFor(noPass(VOID).play('2c 4d 9c'))?.reason).toEqual({ code: 'firstTrickHigh', card: card('Ac') })
  })

  test('void in clubs: the highest card, from the shorter suit, keeping the spades that hide the queen', () => {
    // Seat 1 holds 4d 5d 6d 7d and 4s 5s 6s 7s Qs; the queen and hearts may not be played to the first trick.
    expect(decideFor(noPass(VOID).play('2c'))?.reason).toEqual({ code: 'dumpHigh', card: card('7d') })
  })

  test('with points allowed on the first trick, it is played as any other', () => {
    const points = { pointsOnFirstTrick: true }
    expect(decideFor(noPass(VOID, points).play('2c'))?.reason).toEqual({ code: 'dumpQueen', card: card('Qs') })
    expect(decideFor(noPass(VOID, points).play('2c 4d'))?.reason).toEqual({ code: 'playLow', card: card('9c') })
    expect(decideFor(noPass(VOID, points).play('2c 4d 9c'))?.reason).toEqual({ code: 'winClean', card: card('Ac') })
  })
})

describe('leading', () => {
  test('the lowest spade below the queen while she is out', () => {
    expect(decideFor(noPass(H).play('2c Ac Jc Kc'))?.reason).toEqual({ code: 'fishForQueen', card: card('2s') })
    // Seat 3 holds the ace and king as well, and still fishes with the ten.
    expect(decideFor(noPass(H).play('2c Ac Jc Kc  2s 5s 9s Ad'))?.reason).toEqual({ code: 'fishForQueen', card: card('10s') })
  })

  test('a low card from the suit where the most of what is out is higher', () => {
    // Seat 3 has taken the queen. It holds sure winners in clubs and spades, and 8d 9d under four of the ten diamonds out.
    const t = noPass(H).play('2c Ac Jc Kc  2s Qs As Ad')
    expect(decideFor(t)?.reason).toEqual({ code: 'leadLow', card: card('8d'), higher: 4 })
  })

  test('never the queen of spades or a sure heart while anything else is left', () => {
    const t = noPass(K).play('2c 7d Kc 3c  Ac 4c 5c 10h')
    expect(decideFor(t)?.reason).toEqual({ code: 'leadLow', card: card('7s'), higher: 3 })
  })

  test('with only the queen and sure hearts left, a heart', () => {
    const t = noPass(K).play('2c 7d Kc 3c  Ac 4c 5c 10h').endPause()
    const view = viewFor(t.game, 2, 'full')
    if (view.phase.kind !== 'playing') throw new Error(view.phase.kind)
    const cornered: View = { ...view, phase: { ...view.phase, hand: cards('Qs Ah Kh') } }
    expect(decide(cornered, HONEST)?.reason).toEqual({ code: 'leadLeastBad', card: card('Kh') })
  })
})

describe('following', () => {
  test('the highest card that stays under the winner', () => {
    const t = noPass(H).play('2c Ac Jc Kc  2s 5s 9s Ad  8d')
    expect(decideFor(t)?.reason).toEqual({ code: 'playLow', card: card('10d') })
    expect(decideFor(t.play('10d'))?.reason).toEqual({ code: 'duck', card: card('3d'), under: card('10d') })
    expect(decideFor(t.play('3d'))?.reason).toEqual({ code: 'duck', card: card('7d'), under: card('10d') })
  })

  test('when every card wins and others are still to play, the lowest, keeping the queen back', () => {
    expect(decideFor(noPass(H).play('2c Ac Jc Kc  2s'))?.reason).toEqual({ code: 'playLow', card: card('5s') })
  })
})

describe('void in the suit led', () => {
  const points = { pointsOnFirstTrick: true }

  test('the ace or king of spades while the queen is out, then the highest heart, then the queen herself', () => {
    expect(decideFor(noPass(DISCARDS, points).play('2c'))?.reason).toEqual({ code: 'dumpHighSpade', card: card('As') })
    expect(decideFor(noPass(DISCARDS, points).play('2c As'))?.reason).toEqual({ code: 'dumpHeart', card: card('8h') })
    expect(decideFor(noPass(DISCARDS, points).play('2c As 8h'))?.reason).toEqual({ code: 'dumpQueen', card: card('Qs') })
  })

  test('the highest card when nothing else applies', () => {
    expect(decideFor(noPass(H).play('2c Ac Jc Kc  2s 5s 9s'))?.reason).toEqual({ code: 'dumpHigh', card: card('Ad') })
  })

  test('points go even to a seat that has taken every point so far: holding them back costs more than the rare moon', () => {
    // Seat 0 takes the ace of spades, a heart and the queen on the first trick: 14 points, all of them.
    expect(decideFor(noPass(DISCARDS, points).play('2c As 8h Qs  3c Ad'))?.reason).toEqual({ code: 'dumpHeart', card: card('7h') })
  })
})

describe('stopping a moon', () => {
  // Seat 3 wins the first trick, then the queen thrown on its diamond, then a heart thrown on another.
  const shooting = () => noPass(L).play('2c 3c 4c Ac  Kd 2d Qs 3d  Qd 4d 2h 5d')

  test('a cheap trick with points is taken from a seat that has every point so far', () => {
    expect(decideFor(shooting().play('Kh'))).toEqual({
      action: { type: 'playCard', card: card('Ah') },
      reason: { code: 'stopMoon', card: card('Ah'), shooter: 3 },
    })
  })

  test('a seat with every point but fewer than half is not yet a threat', () => {
    // The same, but seat 1 throws a heart instead of the queen: seat 3 has one point.
    const t = noPass(L).play('2c 3c 4c Ac  Kd 2d 2h 3d  Qd 4d 4h 5d  Kh')
    expect(decideFor(t)?.reason).toEqual({ code: 'duck', card: card('3h'), under: card('Kh') })
  })
})

describe('the jack of diamonds', () => {
  const led = (overrides: RuleOverrides) => noPass(JACK, overrides).play('2c 3c 4c Ac  Jd')

  test('won when the trick holds no other points', () => {
    expect(decideFor(led({ jackOfDiamonds: true }))?.reason).toEqual({ code: 'takeJack', card: card('Kd') })
    expect(decideFor(led({}))?.reason).toEqual({ code: 'duck', card: card('6d'), under: card('Jd') })
  })

  test('never thrown away while anything else can be', () => {
    // Seat 1, void in clubs on the first trick, left with the jack as its highest card.
    const thrown = (overrides: RuleOverrides) => {
      const view = viewFor(noPass(DISCARDS, overrides).play('2c').game, 1, 'full')
      if (view.phase.kind !== 'playing') throw new Error(view.phase.kind)
      return decide({ ...view, phase: { ...view.phase, hand: cards('Jd 2d 3s') } }, HONEST)?.reason
    }
    expect(thrown({})).toEqual({ code: 'dumpHigh', card: card('Jd') })
    expect(thrown({ jackOfDiamonds: true })).toEqual({ code: 'dumpHigh', card: card('3s') })
  })
})

describe('every decision', () => {
  test('is the same for the same view, and for the hand in any order', () => {
    const t = noPass(H).play('2c Ac Jc Kc  2s Qs As Ad').endPause()
    const view = viewFor(t.game, 3, 'full')
    if (view.phase.kind !== 'playing') throw new Error(view.phase.kind)
    const once = decide(view, HONEST)
    expect(decide(structuredClone(view), HONEST)).toEqual(once)
    expect(decide({ ...view, phase: { ...view.phase, hand: [...view.phase.hand].reverse() } }, HONEST)).toEqual(once)
  })

  test('nothing to decide is nothing chosen, and the fallback is the plainest legal action', () => {
    const t = noPass(VOID)
    expect(decide(viewFor(t.game, 1, 'full'), HONEST)).toBeNull()
    expect(chooseAction(viewFor(t.game, 1, 'full'), HONEST)).toBeNull()
    expect(fallbackAction(viewFor(t.game, 1, 'full'))).toBeNull()
    expect(fallbackAction(viewFor(t.game, 0, 'full'))).toEqual({ type: 'playCard', card: card('2c') })
    const passing = new Table().deal(VOID)
    expect(fallbackAction(viewFor(passing.game, 2, 'full'))).toEqual({ type: 'choosePass', cards: availableActions(viewFor(passing.game, 2)).pass.slice(0, 3) })
    expect(decide(viewFor(noPass(VOID).play('2c 4d 9c Ac').game, 3, 'full'), HONEST)).toBeNull()
  })
})
