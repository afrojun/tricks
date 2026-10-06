import { describe, expect, test } from 'vitest'
import { type RoundSummary, type View, type ViewPhase, viewFor } from '../engine'
import { Table, card, cards } from '../engine/testing'
import { cardText } from '../../../kit/cards'
import { headline, hint, listNames, newCards, passButton, passedWay, sortHand, stillChoosing, trickTaken } from './text'

const NAMES = ['Asha', 'Bheki', 'Chan', 'Devi']

/** The view of `seat` in this game, with the seats named. */
function named(t: Table, seat: number | null): View {
  const view = viewFor(t.game, seat)
  return { ...view, seats: view.seats.map((s, i) => ({ ...s, name: NAMES[i] })) }
}

function phaseOf<K extends ViewPhase['kind']>(view: View, kind: K): Extract<ViewPhase, { kind: K }> {
  if (view.phase.kind !== kind) throw new Error(`expected ${kind}, got ${view.phase.kind}`)
  return view.phase as Extract<ViewPhase, { kind: K }>
}

/** Every heart and spade to one seat would be lopsided; this deal gives each seat a mix. */
const HANDS = [
  '2c 3c 4c 5c 2d 3d 4d 2s 3s 4s 2h 3h 4h',
  '6c 7c 8c 5d 6d 7d 5s 6s 7s 5h 6h 7h 8h',
  '9c 10c Jc 8d 9d 10d 8s 9s 10s 9h 10h Jh Qh',
  'Qc Kc Ac Jd Qd Kd Ad Js Qs Ks As Kh Ah',
]

const summary = (over: Partial<RoundSummary>): RoundSummary => ({ roundNumber: 1, reason: 'normal', points: [0, 0, 0, 26], scoresAfter: [0, 0, 0, 26], moon: null, ...over })

describe('the hand', () => {
  test('is grouped clubs, diamonds, spades, hearts, so the colours alternate, highest first', () => {
    expect(sortHand(cards('2h Qs 10c Ad 3c Ah 2s Kd')).map(cardText)).toEqual(['10♣', '3♣', 'A♦', 'K♦', 'Q♠', '2♠', 'A♥', '2♥'])
  })
})

describe('passing', () => {
  test('one button names the direction', () => {
    expect(passButton('left')).toBe('Pass left')
    expect(passButton('right')).toBe('Pass right')
    expect(passButton('across')).toBe('Pass across')
  })

  test('the table says which way cards went this round, or that there was no pass', () => {
    expect(['left', 'right', 'across', 'none'].map((d) => passedWay(d as View['direction']))).toEqual(['Passed left', 'Passed right', 'Passed across', 'No passing'])
  })

  test('says who is still choosing, the viewer as you', () => {
    const t = new Table().deal(HANDS)
    t.do(2, { type: 'choosePass', cards: cards('Qh Jh 10h') })
    const view = named(t, 1)
    expect(stillChoosing(view, phaseOf(view, 'passing'))).toEqual([0, 1, 3])
    expect(listNames(view, [0, 1, 3])).toBe('Asha, you and Devi')
    expect(listNames(view, [1, 3])).toBe('you and Devi')
    expect(listNames(view, [3])).toBe('Devi')
  })

  test('the hint names the player the cards go to, then who the table is waiting on', () => {
    const t = new Table().deal(HANDS)
    const before = named(t, 1)
    expect(hint(before, 0)).toEqual({ text: 'Choose three cards to pass to Chan.', mine: true })
    expect(hint(before, 2)).toEqual({ text: 'Choose 1 more card to pass to Chan.', mine: true })
    expect(hint(before, 3)).toEqual({ text: 'Tap Pass left to give them to Chan.', mine: true })
    t.do(1, { type: 'choosePass', cards: cards('8h 7h 6h') })
    expect(hint(named(t, 1), 0)).toEqual({ text: 'Waiting for Asha, Chan and Devi to choose.', mine: false })
  })

  test('cards passed to the viewer are new until the viewer plays a card', () => {
    const t = new Table().deal(HANDS)
    // Left: each seat gives to the next, so Bheki (1) receives Asha's (0) cards.
    t.pass(['2h 3h 4h', '8h 7h 6h', 'Qh Jh 10h', 'Ah Kh As'])
    const fresh = named(t, 1)
    expect(newCards(phaseOf(fresh, 'playing')).map(cardText)).toEqual(['2♥', '3♥', '4♥'])
    // Asha leads the two of clubs; Bheki has still to play.
    t.play('2c')
    expect(newCards(phaseOf(named(t, 1), 'playing')).map(cardText)).toEqual(['2♥', '3♥', '4♥'])
    t.play('8c')
    expect(newCards(phaseOf(named(t, 1), 'playing'))).toEqual([])
  })

  test('nothing is new in a round without passing', () => {
    const t = new Table({ passing: 'none' }).deal(HANDS)
    expect(newCards(phaseOf(named(t, 1), 'playing'))).toEqual([])
  })
})

describe('play', () => {
  test('your turn, the opening lead, and someone else to play', () => {
    const t = new Table({ passing: 'none' }).deal(HANDS)
    expect(hint(named(t, 0), 0)).toEqual({ text: 'Your turn to lead the two of clubs.', mine: true })
    expect(hint(named(t, 2), 0)).toEqual({ text: 'Asha to play.', mine: false })
    t.play('2c')
    expect(hint(named(t, 1), 0)).toEqual({ text: 'Your turn. Tap a card or drag it onto the table.', mine: true })
    t.play('8c 10c Ac')
    t.endPause()
    expect(hint(named(t, 3), 0)).toEqual({ text: 'Your turn to lead. Tap a card or drag it onto the table.', mine: true })
  })

  test('who took a trick, and what it was worth', () => {
    const view = named(new Table(), 1)
    expect(trickTaken(view, 0, [card('2c'), card('3c'), card('Qs'), card('4h')])).toBe('Asha takes 14 points')
    expect(trickTaken(view, 1, [card('2c'), card('3h'), card('5c'), card('4c')])).toBe('You take 1 point')
    expect(trickTaken(view, 2, cards('2c 3c 4c 5c'))).toBe('Chan takes it')
  })

  test('a trick with the jack of diamonds counts it when the rules do', () => {
    const t = new Table({ jackOfDiamonds: true })
    expect(trickTaken(named(t, 1), 3, cards('2d 3d Jd 4h'))).toBe('Devi takes −9 points')
  })
})

describe('the round result', () => {
  const view = named(new Table(), 1)

  test('a normal round names who has the fewest points', () => {
    expect(headline(view, summary({ scoresAfter: [12, 30, 40, 22] }))).toBe('Asha has the fewest points, 12.')
    expect(headline(view, summary({ scoresAfter: [12, 12, 40, 22] }))).toBe('Asha and you have the fewest points, 12.')
  })

  test('a moon names the shooter and how it scored', () => {
    expect(headline(view, summary({ reason: 'moon', moon: 2 }))).toBe('Chan shot the moon: everyone else takes 26.')
    expect(headline(view, summary({ reason: 'moon', moon: 1 }))).toBe('You shot the moon: everyone else takes 26.')
    const off = { ...view, rules: { ...view.rules, moon: 'shooterSubtracts' as const } }
    expect(headline(off, summary({ reason: 'moon', moon: 2 }))).toBe('Chan shot the moon and takes off 26.')
    expect(headline(off, summary({ reason: 'moon', moon: 1 }))).toBe('You shot the moon and take off 26.')
  })

  test('an accusation names who, the rule and the card, and who takes 26', () => {
    const challenge = (challenger: number, accused: number, guilty: boolean, rule: string | null, c: string) =>
      headline(view, summary({ reason: 'challenge', challenge: { challenger, accused, guilty, rule, card: card(c) } }))
    expect(challenge(1, 0, true, 'followSuit', '5d')).toBe('You caught Asha not following suit with 5♦. Asha takes 26; nobody else scores.')
    expect(challenge(2, 1, true, 'heartsLead', '3h')).toBe('Chan caught you leading a heart before hearts were broken with 3♥. You take 26; nobody else scores.')
    expect(challenge(3, 2, true, 'firstTrickPoints', 'Qs')).toBe('Devi caught Chan playing points on the first trick with Q♠. Chan takes 26; nobody else scores.')
    expect(challenge(0, 3, false, null, '9c')).toBe('Asha accused Devi, but Devi played by the rules. Asha takes 26; nobody else scores.')
    expect(challenge(1, 3, false, null, '9c')).toBe('You accused Devi, but Devi played by the rules. You take 26; nobody else scores.')
  })
})
