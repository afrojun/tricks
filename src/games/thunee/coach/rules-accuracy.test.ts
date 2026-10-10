/** Each case is a rule the coach once stated wrongly (review checkpoint B). */
import { describe, expect, test } from 'vitest'
import { type Game, type RoundSummary, type View, viewFor } from '../engine'
import { Table, card } from '../engine/testing'
import { advise } from './advise'
import { check } from './check'
import { narrate } from './narrate'
import { review } from './review'
import { situation } from './situation'
import { TOPICS, topicsFor } from './topics'
import { trickLabel } from './words'

const you = (game: Game, seat = 0): View => viewFor(game, seat, 'full')
const four = (hands: string[]) => new Table(4, { redealIfNoTrumps: false }).deal(hands)
const text = (n: { title: string; body: string } | null | undefined) => (n ? `${n.title} ${n.body}` : '')
const topic = (id: keyof typeof TOPICS) => TOPICS[id].paragraphs.join(' ')

// Trump spades. Seat 2 leads clubs, seat 3 trumps with the J♠; seat 0 has no clubs, holds Q♠ and hearts.
const UNDER = ['Qs Jh 9h Ah 10h Kh', '9s As 10s Ks Qh Jd', 'Jc 9c Ac 10c Kc Qc', 'Js 9d Ad 10d Kd Qd']
const THUNEE = ['10d Kd Qd 10c Kc Qc', 'Js 9s As 10s Ks Jh', 'Qs 9h Ah Jc 9c Ac', 'Jd 9d Ad 10h Kh Qh']
const thunee = () => {
  const t = four(THUNEE).advance(10_000)
  return t.do(1, { type: 'chooseTrump', choice: 'spades' }).do(1, { type: 'callThunee' }).advance(10_000)
}
const summary = (over: Partial<RoundSummary>): RoundSummary => ({
  roundNumber: 1,
  reason: 'normal',
  winner: 1,
  balls: 1,
  ballsAfter: [0, 1],
  trumper: 1,
  trump: 'spades',
  callAmount: 0,
  cardPoints: [80, 224],
  tricksWon: [2, 4],
  ...over,
})

describe('scoring words', () => {
  test("the other side's Jodhi is taken away, not added", () => {
    const s = summary({ normal: { countingTeam: 0, lines: [{ label: 'cards', value: 80 }, { label: 'lastTrick', value: -10 }, { label: 'opponentJodhi', value: -40 }], total: 30, target: 105 } })
    const said = text(review({ decisions: [], summary: s, dealt: [], you: 0, view: you(four(UNDER).game) })[0])
    expect(said).toContain('−40')
    expect(said).not.toContain('+40')
    expect(said).toMatch(/trumping side/)
  })

  test('two-player warnings use 125', () => {
    const t = new Table(2, { redealIfNoTrumps: false }).deal(['Kh Qh Ks Qs 10c Qd', 'Js 9s As 10s Kd Qc'])
    expect(check(you(t.game), { type: 'call', amount: 104 })?.body).toContain('125')
  })

  test('the topics name both targets', () => {
    expect(topic('counting')).toContain('125')
    expect(topic('calling')).toContain('125')
  })
})

describe('undercutting', () => {
  const t = () => four(UNDER).toPlay('spades').play('Jc Js')

  test('the topic explains it', () => {
    expect(topic('following')).toMatch(/lower than a trump already/)
  })

  test('the situation does not say anything goes', () => {
    expect(text(situation(you(t().game)))).toMatch(/except a trump lower than J♠/)
  })

  test('the warning explains the undercut, not follow-suit', () => {
    const body = check(you(t().game), { type: 'playCard', card: card('Qs') })?.body ?? ''
    expect(body).toMatch(/lower than J♠/)
    expect(body).not.toMatch(/must follow/)
  })

  test('the review calls it an undercut, not a failure to follow', () => {
    const v = you(t().game)
    const notes = review({ decisions: [{ view: v, advised: null, taken: { type: 'playCard', card: card('Qs') } }], summary: summary({ normal: { countingTeam: 0, lines: [], total: 0, target: 105 } }), dealt: [], you: 0, view: v })
    const said = notes.map(text).join(' ')
    expect(said).not.toMatch(/did not follow/)
    expect(said).toMatch(/under/)
  })

  test('being caught for it is described as an illegal trump, not as not following suit', () => {
    const v = you(t().game)
    const s = summary({ reason: 'challenge', challenge: { challenger: 1, accused: 0, kind: 'play', guilty: true, card: card('Qs') } })
    const said = text(review({ decisions: [{ view: v, advised: null, taken: { type: 'playCard', card: card('Qs') } }], summary: s, dealt: [], you: 0, view: v })[0])
    expect(said).not.toMatch(/not following suit/)
  })
})

describe('the last trick', () => {
  test('two players: the twelfth trick, and not introduced halfway', () => {
    expect(TOPICS.lastTrick.paragraphs.join(' ')).toMatch(/twelfth/)
    const t = new Table(2, { redealIfNoTrumps: false }).deal(['Jh 9h Ks Qs 10c Qd', 'Js 9s As 10s Kd Qc']).toPlay('spades')
    t.autoPlay('trickPause')
    for (let i = 0; i < 4; i++) t.endPause().autoPlay('trickPause')
    // Five tricks done in the first half of twelve.
    const v = you(t.endPause().game)
    expect(topicsFor(v, null)).not.toContain('lastTrick')
  })
})

describe('Thunee', () => {
  test('the caller is never told to stop their own Thunee', () => {
    const t = thunee()
    expect(text(narrate({ type: 'thuneeCalled', seat: 1 }, you(t.game, 1)))).not.toMatch(/stop it/)
  })

  test("the caller's partner is warned off taking a trick", () => {
    const t = thunee()
    expect(text(narrate({ type: 'thuneeCalled', seat: 1 }, you(t.game, 3)))).toMatch(/8 balls/)
  })

  test('opponents are told one trick stops it', () => {
    const t = thunee()
    expect(text(narrate({ type: 'thuneeCalled', seat: 1 }, you(t.game, 0)))).toMatch(/stop/)
  })

  test('tricks are counted toward six, not toward 105', () => {
    const t = thunee().play('Js Qs Jd 10d')
    const said = text(narrate({ type: 'trickWon', seat: 1, points: 72 }, you(t.endPause().game)))
    expect(said).not.toContain('105')
    expect(said).toMatch(/1 of 6/)
  })

  test('the risk names the partner-catch penalty', () => {
    const t = four(THUNEE).advance(10_000).do(1, { type: 'chooseTrump', choice: 'spades' })
    const a = advise(you(t.game, 2))!
    expect(a.note.body).toMatch(/8 balls/)
    expect(a.note.title).toBe('No Thunee')
    expect(check(you(t.game, 2), { type: 'callThunee' })?.body).toMatch(/8 balls/)
  })

  test('the topic says who may not call it', () => {
    expect(topic('thunee')).toMatch(/six cards of one suit/)
  })
})

describe('special calls', () => {
  test('Khanaak names both sides and the caller winning the last trick', () => {
    const t = four(UNDER)
    const said = text(narrate({ type: 'khanaakCalled', seat: 1 }, you(t.game, 0)))
    expect(said).toMatch(/card points/)
    expect(said.match(/the other side/g)?.length ?? 0).toBeLessThan(2)
    expect(topic('khanaak')).toMatch(/card points/)
    expect(topic('khanaak')).toMatch(/four-player/)
  })

  test('Double and Jodhi have their limits', () => {
    expect(topic('double')).toMatch(/four-player/)
    expect(topic('double')).toMatch(/Thunee/)
    expect(topic('jodhi')).toMatch(/Thunee/)
  })
})

describe('advice', () => {
  test('before trump is revealed a lead is not called "outside trump"', () => {
    const t = four(['Jh 9h Ks Qs 10c Qd', 'Js 9s As 10s Kd Jc', '9c Ac Kc Qc Ah 10h', 'Jd 9d Ad 10d Kh Qh']).toPlay('spades')
    const a = advise(you(t.game, 2))!
    expect(a.note.body).not.toMatch(/outside trump/)
  })

  test('a strong hand that has been outcalled is not called weak', () => {
    const t = four(['Jh Jd Qs Qc 10c 10d', 'Ks Kc 9s 9c Kd Qd', 'Js Ah 10h As Ac Jc', '9h 9d Ad 10s Kh Qh'])
    t.do(0, { type: 'call', amount: 10 }).do(1, { type: 'call', amount: 20 }).do(0, { type: 'call', amount: 30 }).do(1, { type: 'call', amount: 40 })
    const a = advise(you(t.game))!
    expect(a.action).toEqual({ type: 'pass' })
    expect(a.note.body).toMatch(/up to 30/)
    expect(a.note.body).not.toMatch(/not strong enough/)
  })

  test('a points warning does not assume the trick is already lost', () => {
    const t = four(['Jh 9h Ks Qs 10c Qd', 'Js 9s As 10s Kd Qc', 'Jc 9c Ac Kc Ah 10h', 'Jd 9d Ad 10d Kh Qh']).toPlay('spades').play('Jc Qh 10c Qc  9c Kh Qd 10s  Js')
    expect(check(you(t.game, 2), { type: 'playCard', card: card('Ah') })?.body).toMatch(/if they keep/)
  })
})

describe('wording', () => {
  test('two-player tricks are numbered within their half, and say which half', () => {
    expect(trickLabel(4, 1, 2)).toBe('trick 3')
    expect(trickLabel(2, 2, 0)).toBe('trick 1 of the second half')
  })

  test('the round-over line does not point the wrong way', () => {
    const t = four(UNDER)
    expect(text(narrate({ type: 'roundScored', summary: summary({}) }, you(t.game)))).not.toMatch(/below/)
  })
})
