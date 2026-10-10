/**
 * Spades' drills: one moment each, dealt the same way every time. The cards that matter are named, the rest
 * dealt from a fixed seed, and the calls and cards before the moment are played through the engine as written.
 */
import { cardText, cardsFrom, completeDeal } from '../../kit/cards'
import type { Note } from '../../kit/coach'
import { type Seat, allSeats, nextSeat, settle } from '../../kit/table'
import type { DecisionRecord, Drill, DrillTable, Verdict } from '../../practice/contract'
import { rng } from '../../practice/rng'
import { wouldWin } from './ai/read'
import { type Action, type Card, type Game, RANKS, type View, createDeck, handSize, seatsToAct } from './engine'

type SpadesDrill = Drill<Game, Action, View, Note>
type Table = DrillTable<Game, Action>

const cards = (text: string): Card[] => cardsFrom(text, RANKS)

/** Each seat holding the cards named for it, the rest of its hand dealt from `seed`, with `dealer` dealing. */
function deal(t: Table, given: readonly string[], seed: number, dealer: Seat): void {
  t.patch((game, ctx) => {
    if (game.phase.kind !== 'calling') throw new Error(`a drill deals before calling, not in ${game.phase.kind}`)
    const count = game.playerCount
    const hands = completeDeal(
      given.map((text) => (text ? cards(text) : [])),
      createDeck(game.rules.jokers),
      handSize(count),
      rng(seed).next,
    )
    game.dealer = dealer
    game.phase = { ...game.phase, hands, calls: allSeats(count).map(() => null), looked: allSeats(count).map(() => true), turn: nextSeat(dealer, count) }
    game.waiting = []
    settle(game, ctx, seatsToAct(game), seatsToAct(game))
    return game
  })
}

/** Each seat calls in turn, from the dealer's left: a number, or 0 for Nil. */
function call(t: Table, ...calls: number[]): void {
  for (const tricks of calls) {
    const phase = t.game.phase
    if (phase.kind !== 'calling') throw new Error(`expected calling, not ${phase.kind}`)
    t.act(phase.turn, { type: 'call', tricks })
  }
}

/** Cards played in turn, each by whoever's turn it is; a trick's pause runs out first. */
function play(t: Table, text: string): void {
  for (const card of cards(text)) {
    for (let guard = 0; t.game.phase.kind === 'trickPause' && guard < 5; guard++) t.tick()
    const phase = t.game.phase
    if (phase.kind !== 'playing') throw new Error(`expected a card to be played, not ${phase.kind}`)
    t.act(phase.turn, { type: 'playCard', card })
  }
}

const passed = (note: Omit<Note, 'tone'>): Verdict<Note> => ({ passed: true, note: { tone: 'suggest', ...note } })
const missed = (note: Omit<Note, 'tone'>): Verdict<Note> => ({ passed: false, note: { tone: 'warn', ...note } })

/** The player's first card since the drill began. */
function firstPlay(decisions: readonly DecisionRecord<View, Action>[]): { view: View; card: Card } | null {
  const d = decisions.find((d) => d.taken.type === 'playCard')
  return d && d.taken.type === 'playCard' ? { view: d.view, card: d.taken.card } : null
}

const myTurn = (view: View) => view.phase.kind === 'playing' && view.phase.turn === view.seat

/** An opponent's ace of clubs is winning, and you have no clubs. */
const trump: SpadesDrill = {
  id: 'trump',
  title: 'Trump it',
  summary: 'With none of the suit led, a spade wins the trick.',
  playerCount: 4,
  arrange(t) {
    deal(t, ['As 9s 4s Kh 8h 5h Kd Qd 10d 7d 6d 3d 2d', 'Kc', '2c', 'Ac'], 1, 0)
    call(t, 3, 3, 3, 4)
    play(t, 'Kc 2c Ac')
  },
  brief: {
    tone: 'info',
    title: 'Spades are trump',
    body: 'You must follow the suit led if you can. With none of it you may play any card, and a spade beats every card of another suit: that is trumping.',
    cards: cards('4s'),
    topic: 'tricks',
  },
  guide(view) {
    if (!myTurn(view)) return null
    return { tone: 'info', title: 'You have no clubs', body: 'Your side needs tricks, and the A♣ is winning for the other side. Any spade beats it: the lowest will do.' }
  },
  verdict(_view, decisions) {
    const play = firstPlay(decisions)
    if (!play) return null
    if (play.card.suit === 'spades') return passed({ title: 'Trumped', body: `${cardText(play.card)} beats the A♣: the trick is yours.`, cards: [play.card] })
    return missed({ title: 'The trick got away', body: `${cardText(play.card)} cannot beat the A♣. With no clubs, any spade would have won it.`, cards: [play.card] })
  },
}

/** Your lead, spades not yet broken, holding spades and other suits. */
const spadesLead: SpadesDrill = {
  id: 'spadesLead',
  title: 'Leading spades',
  summary: 'No spade may be led until one has been played.',
  playerCount: 4,
  arrange(t) {
    deal(t, ['As Ks Qs 2c 3c 4c 5c 2d 3d 4d 2h 3h 4h', '', '', ''], 2, 3)
    call(t, 4, 3, 3, 3)
  },
  brief: {
    tone: 'info',
    title: 'Spades are not broken yet',
    body: 'Nobody may lead a spade until one has been played on another suit, which “breaks” spades. A hand of nothing but spades is the exception. You lead the first trick.',
    topic: 'tricks',
  },
  guide(view) {
    if (!myTurn(view) || view.phase.kind !== 'playing' || view.phase.current.length > 0) return null
    return { tone: 'info', title: 'Your lead', body: 'Lead anything but a spade. Your high spades will win tricks later, once spades are broken.' }
  },
  verdict(_view, decisions) {
    const play = firstPlay(decisions)
    if (!play) return null
    if (play.card.suit !== 'spades') return passed({ title: 'Spades kept back', body: `Leading ${cardText(play.card)} breaks no rule.`, cards: [play.card] })
    return missed({ title: 'Spades were not broken', body: 'No spade had been played yet, and you held other suits, so a spade could not be led. An opponent who notices can challenge you, and your side is set.', cards: [play.card] })
  },
}

/** You called Nil, and a heart is led that you can play under. */
const nil: SpadesDrill = {
  id: 'nil',
  title: 'Playing Nil',
  summary: 'Called Nil: play your highest card that still loses.',
  playerCount: 4,
  arrange(t) {
    deal(t, ['Jh 9h 4h 2h 2s 3s 4c 5c 6c 2d 3d 4d 5d', '10h', '3h', '5h'], 3, 0)
    call(t, 3, 4, 3, 0)
    play(t, '10h 3h 5h')
  },
  brief: {
    tone: 'info',
    title: 'Nil: take no tricks',
    body: 'You called Nil: 100 if you take no tricks, and −100 if you take any. Every high card you keep is a danger, so play under the trick with the highest card that still loses.',
    topic: 'nil',
  },
  guide(view) {
    if (!myTurn(view)) return null
    return { tone: 'info', title: 'The 10♥ is winning', body: 'Play a heart below the 10♥: the highest of them, so the high cards leave your hand while they are safe.' }
  },
  verdict(_view, decisions) {
    const play = firstPlay(decisions)
    if (!play) return null
    const phase = play.view.phase
    const wins = phase.kind === 'playing' && wouldWin(play.view, phase.current, play.view.seat!, play.card)
    if (!wins) return passed({ title: 'Under the trick', body: `${cardText(play.card)} loses to the 10♥, and your Nil stands.`, cards: [play.card] })
    return missed({ title: 'Nil broken', body: `${cardText(play.card)} wins the trick, and a Nil that takes a trick costs 100. A lower heart would have lost it.`, cards: [play.card] })
  },
}

export const SPADES_DRILLS: readonly SpadesDrill[] = [trump, spadesLead, nil]
