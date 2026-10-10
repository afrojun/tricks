import { describe, expect, test } from 'vitest'
import { type Card, SUIT_NAME, cardText, sameCard } from './cards'
import { type CoachBasis, type Note, REVIEW_MOMENTS, baselineCoach } from './coach'
import { brokenRules, legalCards } from './integrity'
import { HONEST, type Mind } from './mind'
import type { Memory } from './module'
import { type Seat, type TableState, type TableView, emptySeats, tableView } from './table'
import { collectCards } from './testing'
import { followSuit, ledSuit } from './tricks'

// ── A toy game: two seats, follow suit, and a computer that names every card in sight ──

interface ToyGame extends TableState {
  hands: Card[][]
  trick: { seat: Seat; card: Card }[]
  turn: Seat
}
interface ToyView extends TableView {
  phase: { kind: 'playing'; hand: Card[]; trick: { seat: Seat; card: Card }[]; turn: Seat; others?: Card[][] }
}
type ToyAction = { type: 'playCard'; card: Card } | { type: 'tick' }
type ToyReason = { code: 'lead'; card: Card; sight: Card[] } | { code: 'follow'; card: Card } | { code: 'only'; card: Card }

const c = (text: string): Card => ({ suit: ({ c: 'clubs', h: 'hearts', s: 'spades', d: 'diamonds' } as const)[text.slice(-1) as 'c'], rank: text.slice(0, -1) })
const hand = (text: string) => text.split(' ').map(c)
const or = (cards: readonly Card[]) => (cards.length < 2 ? cards.map(cardText).join('') : `${cards.slice(0, -1).map(cardText).join(', ')} or ${cardText(cards[cards.length - 1])}`)
const RANK = ['2', '3', '4', '5', '9', 'Q']
const lowest = (cards: readonly Card[]) => [...cards].sort((a, b) => RANK.indexOf(a.rank) - RANK.indexOf(b.rank))[0]

/** Seat 1 holds the marked card, the Q♠, and has not played it. */
const MARKED = c('Qs')

function game(hands: string[], trick: [Seat, string][], turn: Seat): ToyGame {
  return {
    formatVersion: 1,
    playerCount: 2,
    seats: emptySeats(2).map((s, i) => ({ ...s, name: i === 0 ? 'You' : 'Them', kind: i === 0 ? 'human' : 'ai' })),
    host: 0,
    waiting: [],
    aiActAt: null,
    aiSalt: 7,
    phase: { kind: 'playing' },
    hands: hands.map(hand),
    trick: trick.map(([seat, card]) => ({ seat, card: c(card) })),
    turn,
  }
}

/** The toy's view: the viewer's own hand, the trick and the turn. A leaky one also shows the other hands. */
function viewFor(g: ToyGame, seat: Seat | null, _memory: Memory = 'table', leaky = false): ToyView {
  const others = leaky ? g.hands.filter((_, s) => s !== seat) : undefined
  const hand = seat === null ? [] : g.hands[seat]
  return { ...tableView(g, seat), phase: { kind: 'playing', hand, trick: g.trick, turn: g.turn, ...(others ? { others } : {}) } }
}

const legal = (view: ToyView) => legalCards(view.phase.hand, (card) => followSuit(card, ledSuit(view.phase.trick)))

/** The computer's minds and seats it was asked with. */
let asked: { seat: Seat | null; mind: Mind }[] = []

const toy: CoachBasis<ToyView, ToyAction, ToyReason> = {
  decide(view, mind) {
    asked.push({ seat: view.seat, mind })
    if (view.phase.turn !== view.seat) return null
    const can = legal(view)
    const card = lowest(can)
    const reason: ToyReason =
      can.length === 1 ? { code: 'only', card } : view.phase.trick.length === 0 ? { code: 'lead', card, sight: collectCards(view) } : { code: 'follow', card }
    return { action: { type: 'playCard', card }, reason }
  },
  phrases: {
    lead: (r) => `Of the cards in sight, ${or(r.sight)}, ${cardText(r.card)} is the lowest.`,
    follow: (r) => `${cardText(r.card)} follows suit cheaply.`,
    only: (r) => `${cardText(r.card)} is the only card you may play.`,
  },
  asked: (view) => `You may play ${or(legal(view))}.`,
  line: (view) => (view.phase.trick.length === 0 ? null : `On the table: ${view.phase.trick.map((p) => cardText(p.card)).join(', ')}.`),
  name: (action) => (action.type === 'playCard' ? `Play ${cardText(action.card)}` : 'Continue'),
  cards: (action) => (action.type === 'playCard' ? [action.card] : []),
  breaks(view, action) {
    if (action.type !== 'playCard' || view.phase.turn !== view.seat) return null
    const led = ledSuit(view.phase.trick)
    if (brokenRules(view.phase.hand, followSuit(action.card, led)).length === 0) return null
    return `${cardText(action.card)} does not follow ${SUIT_NAME[led!].toLowerCase()}, and you hold some.`
  },
  risk: 'Anyone who notices can say so.',
  when: (view) => (view.phase.trick.length === 0 ? 'Leading' : 'Following'),
  hinted: (action) => action.type === 'playCard',
  // 2♣ and 3♣ are equals here.
  asGood: (_, advised, taken) => advised.type === 'playCard' && taken.type === 'playCard' && [advised.card, taken.card].every((x) => x.suit === 'clubs' && ['2', '3'].includes(x.rank)),
  stake: (view) => (view.phase.trick.length === 0 ? 2 : 1),
}

const coach = baselineCoach(toy)
const play = (text: string): ToyAction => ({ type: 'playCard', card: c(text) })

// Seat 0 leads; seat 0 follows a club; seat 1 is to play.
const LEAD = game(['2c 9c 4h', '3c Qs 5h'], [], 0)
const FOLLOW = game(['2c 9c 4h', 'Qs 5h'], [[1, '3c']], 0)
const WAIT = game(['9c 4h', '3c Qs 5h'], [[0, '2c']], 1)
const you = (g: ToyGame, leaky = false) => viewFor(g, 0, 'full', leaky)

describe('the baseline coach', () => {
  test('the situation: what the player is asked, and the game’s line', () => {
    expect(coach.situation(you(LEAD))).toEqual({ tone: 'info', title: 'Your move', body: 'You may play 2♣, 9♣ or 4♥.' })
    expect(coach.situation(you(FOLLOW))).toEqual({ tone: 'info', title: 'Your move', body: 'You may play 2♣ or 9♣. On the table: 3♣.' })
    expect(baselineCoach({ ...toy, line: undefined }).situation(you(FOLLOW))?.body).toBe('You may play 2♣ or 9♣.')
  })

  test('the advice: the honest computer’s choice, named, with the phrase for its reason', () => {
    expect(coach.advise(you(FOLLOW))).toEqual({
      action: play('2c'),
      note: { tone: 'suggest', title: 'Play 2♣', body: '2♣ follows suit cheaply.', cards: [c('2c')] },
    })
    expect(coach.advise(you(LEAD))?.note.body).toBe('Of the cards in sight, 2♣, 9♣ or 4♥, 2♣ is the lowest.')
  })

  test('nothing to decide: no situation and no advice', () => {
    expect(coach.situation(you(WAIT))).toBeNull()
    expect(coach.advise(you(WAIT))).toBeNull()
    expect(coach.situation(viewFor(LEAD, null))).toBeNull()
  })

  test('one warning, for an action that breaks a rule; never for the advice', () => {
    const v = you(FOLLOW)
    expect(coach.check(v, play('4h'))).toEqual({
      tone: 'warn',
      rule: 'illegal',
      title: 'That breaks the rules',
      body: '4♥ does not follow clubs, and you hold some. Anyone who notices can say so.',
      cards: [c('4h')],
    })
    expect(coach.check(v, play('9c'))).toBeNull()
    expect(coach.check(v, { type: 'tick' })).toBeNull()
    for (const g of [LEAD, FOLLOW, WAIT]) {
      const advice = coach.advise(you(g))
      if (advice) expect(coach.check(you(g), advice.action)).toBeNull()
    }
  })

  test('no narration and no topics', () => {
    expect(coach.narrate({ type: 'cardPlayed' }, you(FOLLOW))).toBeNull()
    expect(coach.topicsFor(you(FOLLOW), null)).toEqual([])
    expect(coach.topicsFor(you(FOLLOW), { type: 'dealt' })).toEqual([])
  })

  const review = (decisions: { view: ToyView; advised: ToyAction | null; taken: ToyAction }[], basis = toy) =>
    baselineCoach(basis).review({ decisions, summary: null, dealt: [], you: 0, view: you(FOLLOW) })

  test('the review lists the rule-breaking plays, then the moments against the hint, each with the hint and its reason', () => {
    expect(
      review([
        { view: you(LEAD), advised: play('2c'), taken: play('4h') },
        { view: you(FOLLOW), advised: play('2c'), taken: play('9c') },
        { view: you(FOLLOW), advised: play('2c'), taken: play('4h') },
      ]),
    ).toEqual([
      { tone: 'warn', title: 'Following: a rule broken', body: '4♥ does not follow clubs, and you hold some.', cards: [c('4h')] },
      {
        tone: 'suggest',
        title: 'Leading: you chose “Play 4♥”',
        body: 'The hint was “Play 2♣”. Of the cards in sight, 2♣, 9♣ or 4♥, 2♣ is the lowest.',
        cards: [c('2c')],
      },
      { tone: 'suggest', title: 'Following: you chose “Play 9♣”', body: 'The hint was “Play 2♣”. 2♣ follows suit cheaply.', cards: [c('2c')] },
    ])
  })

  test('the review keeps the moments with most at stake, in the order they came', () => {
    const lead = { view: you(LEAD), advised: play('2c'), taken: play('9c') }
    const follow = { view: you(FOLLOW), advised: play('2c'), taken: play('9c') }
    const notes = review([follow, lead, follow, lead, follow])
    expect(notes).toHaveLength(REVIEW_MOMENTS)
    // Both leads, at stake 2, and the first follow.
    expect(notes.map((n) => n.title.split(':')[0])).toEqual(['Following', 'Leading', 'Leading'])
  })

  test('a choice as good as the hint, or one the hint never makes, is not a moment; a round of the hint’s choices says so', () => {
    const notes = review([
      { view: you(FOLLOW), advised: play('2c'), taken: play('2c') },
      { view: you(FOLLOW), advised: play('2c'), taken: play('3c') },
      { view: you(FOLLOW), advised: play('2c'), taken: { type: 'tick' } },
    ])
    expect(notes).toEqual([{ tone: 'info', title: 'You followed the hint', body: 'Every choice this round was the hint’s, or one just as good.' }])
    expect(review([{ view: you(WAIT), advised: null, taken: { type: 'tick' } }])).toEqual([])
    // Without the game's hooks every other action is a moment, of equal weight.
    const bare = { ...toy, hinted: undefined, asGood: undefined, stake: undefined }
    expect(review([{ view: you(FOLLOW), advised: play('2c'), taken: play('3c') }], bare).map((n) => n.title)).toEqual(['Following: you chose “Play 3♣”'])
  })
})

describe('the baseline coach is honest', () => {
  /** Everything the coach says at this moment, and in a review of every card the player could have played. */
  function said(g: ToyGame, leaky: boolean): Note[] {
    const v = you(g, leaky)
    const plays = v.phase.hand.map((card) => ({ type: 'playCard', card }) as const)
    const decisions = plays.map((taken) => ({ view: v, advised: coach.advise(v)?.action ?? null, taken }))
    return [
      coach.situation(v),
      coach.advise(v)?.note ?? null,
      ...[...plays, { type: 'tick' } as const].map((a) => coach.check(v, a)),
      coach.narrate({ type: 'cardPlayed' }, v),
      ...coach.review({ decisions, summary: null, dealt: [g.hands], you: 0, view: v }),
    ].filter((n): n is Note => n !== null)
  }
  const mentions = (notes: Note[], card: Card) => notes.some((n) => `${n.title} ${n.body}`.includes(cardText(card)) || (n.cards ?? []).some((x) => sameCard(x, card)))

  test('given a view that hides a marked card, no note mentions it', () => {
    for (const g of [LEAD, FOLLOW, WAIT]) {
      expect(g.hands[1].some((x) => sameCard(x, MARKED))).toBe(true)
      expect(mentions(said(g, false), MARKED)).toBe(false)
    }
  })

  test('the same check finds it when the view shows it', () => {
    expect(mentions(said(LEAD, true), MARKED)).toBe(true)
  })

  test('the computer is asked only with the honest mind, and only for the player’s own view', () => {
    asked = []
    for (const g of [LEAD, FOLLOW, WAIT]) said(g, false)
    expect(asked.length).toBeGreaterThan(0)
    expect(asked.every((a) => a.seat === 0 && a.mind === HONEST)).toBe(true)
  })
})
