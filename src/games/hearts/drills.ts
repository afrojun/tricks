/**
 * Hearts' drills: one moment each, dealt the same way every time. The cards that matter are named,
 * the rest dealt from a fixed seed, and the tricks before the moment are played through the engine
 * as written. A drill has no passing, so its round starts at the two of clubs.
 */
import { cardText, cardsFrom, completeDeal, hasCard, sameCard } from '../../kit/cards'
import type { Note } from '../../kit/coach'
import { settle } from '../../kit/table'
import type { DecisionRecord, Drill, DrillTable, Verdict } from '../../practice/contract'
import { rng } from '../../practice/rng'
import { type Action, type Card, type Game, type View, HAND_SIZE, QUEEN_OF_SPADES, RANKS, TWO_OF_CLUBS, availableActions, createDeck, seatsToAct } from './engine'

type HeartsDrill = Drill<Game, Action, View, Note>
type Table = DrillTable<Game, Action>

const cards = (text: string): Card[] => cardsFrom(text, RANKS)

/** No passing: the drill's round starts with the cards as dealt. */
const NO_PASSING: readonly Action[] = [{ type: 'setRules', overrides: { passing: 'none' } }]

/** Each seat holding the cards named for it, the rest of its thirteen dealt from `seed`. */
function deal(t: Table, given: readonly string[], seed: number): void {
  t.patch((game, ctx) => {
    const phase = game.phase
    if (phase.kind !== 'playing' || phase.play.tricks.length > 0) throw new Error(`a drill deals before the first card, not in ${phase.kind}`)
    const hands = completeDeal(
      given.map((text) => (text ? cards(text) : [])),
      createDeck(),
      HAND_SIZE,
      rng(seed).next,
    )
    phase.play.hands = hands
    phase.turn = hands.findIndex((h) => hasCard(h, TWO_OF_CLUBS))
    settle(game, ctx, seatsToAct(game), seatsToAct(game))
    return game
  })
}

/** Lets a trick's pause run out. */
function endPause(t: Table): void {
  for (let guard = 0; t.game.phase.kind === 'trickPause' && guard < 5; guard++) t.tick()
}

/** Cards played in turn, each by whoever's turn it is; a trick's pause runs out first. */
function play(t: Table, text: string): void {
  for (const card of cards(text)) {
    endPause(t)
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

const isPoints = (c: Card) => c.suit === 'hearts' || sameCard(c, QUEEN_OF_SPADES)

/** Void in clubs on the first trick, holding hearts and the queen of spades. */
const firstTrick: HeartsDrill = {
  id: 'firstTrick',
  title: 'The first trick',
  summary: 'No hearts and no queen of spades on the first trick.',
  playerCount: 4,
  lobby: NO_PASSING,
  arrange(t) {
    deal(t, ['Qs As 7s 3s Ah Kh 9h 4h Kd Jd 8d 5d 2d', '2c', '9c', 'Kc'], 1)
    play(t, '2c 9c Kc')
  },
  brief: {
    tone: 'info',
    title: 'Nothing to follow with',
    body: 'Whoever holds the 2♣ leads it, and everyone must follow with a club if they can. With no club you may play any other card, except that on the first trick nobody may play a heart or the Q♠, unless they hold nothing else.',
    cards: cards('2c'),
    topic: 'firstTrick',
  },
  guide(view) {
    if (!myTurn(view)) return null
    return {
      tone: 'info',
      title: 'You have no clubs',
      body: 'Play any card but a heart or the Q♠. A high spade or diamond is a good one to be rid of: it could win you a trick full of points later.',
    }
  },
  verdict(_view, decisions) {
    const play = firstPlay(decisions)
    if (!play) return null
    if (hasCard(availableActions(play.view).legal, play.card))
      return passed({ title: 'A clean first trick', body: `${cardText(play.card)} breaks no rule. Hearts and the Q♠ must wait for the second trick.`, cards: [play.card] })
    return missed({
      title: 'Not on the first trick',
      body: `${cardText(play.card)} ${isPoints(play.card) ? 'carries points, and points may not be played to the first trick' : 'breaks a rule'} while you hold other cards. An opponent who notices can accuse you, and you take 26.`,
      cards: [play.card],
    })
  },
}

/** You won the first trick, and lead the second with hearts not yet broken. */
const leadingHearts: HeartsDrill = {
  id: 'leadingHearts',
  title: 'Leading hearts',
  summary: 'No heart may be led until one has been played.',
  playerCount: 4,
  lobby: NO_PASSING,
  arrange(t) {
    deal(t, ['Ac 3c Ah Qh 10h 6h 2h Kd 4d 3d 7s 5s 2s', '2c', '5c', '9c'], 2)
    play(t, '2c 5c 9c Ac')
    endPause(t)
  },
  brief: {
    tone: 'info',
    title: 'Hearts are not broken yet',
    body: 'Nobody may lead a heart until a heart has been played on another suit, which "breaks" hearts, unless their hand holds nothing but hearts. You won the first trick, so you lead the next.',
    topic: 'heartsBroken',
  },
  guide(view) {
    if (!myTurn(view) || view.phase.kind !== 'playing' || view.phase.current.length > 0) return null
    return { tone: 'info', title: 'Your lead', body: 'Lead anything but a heart. A low card is safest: someone else will have to win the trick.' }
  },
  verdict(_view, decisions) {
    const play = firstPlay(decisions)
    if (!play) return null
    if (play.card.suit !== 'hearts') return passed({ title: 'Hearts kept back', body: `Leading ${cardText(play.card)} breaks no rule. Once someone plays a heart on another suit, you may lead hearts too.`, cards: [play.card] })
    return missed({ title: 'Hearts were not broken', body: 'No heart had been played yet, and you held other suits, so a heart could not be led. An opponent who notices can accuse you, and you take 26.', cards: [play.card] })
  },
}

/** Clubs led again, after you showed you have none, and you hold the queen of spades. */
const dumpQueen: HeartsDrill = {
  id: 'dumpQueen',
  title: 'Give away the queen',
  summary: 'With none of the suit led, pass the Q♠ to someone else.',
  playerCount: 4,
  lobby: NO_PASSING,
  arrange(t) {
    deal(t, ['Qs 9s 4s Kh 8h 5h Kd Qd 10d 7d 6d 3d 2d', '2c', 'Ac Kc', '4c 6c'], 3)
    play(t, '2c Ac 4c Kd  Kc 6c')
  },
  brief: {
    tone: 'info',
    title: 'The queen is 13 points',
    body: 'The Q♠ costs whoever takes it 13 points, half of everything in the round. When a suit you do not hold is led, you may play any card, so that is the moment to give the queen to someone else.',
    cards: cards('Qs'),
    topic: 'queen',
  },
  guide(view) {
    if (!myTurn(view) || view.phase.kind !== 'playing') return null
    const led = view.phase.current[0]?.card
    if (!led || view.phase.hand.some((c) => c.suit === led.suit)) return null
    return { tone: 'suggest', title: 'You have no clubs', body: 'You may play anything. Play the Q♠: someone else takes the trick, and the 13 points with it.', cards: cards('Qs') }
  },
  verdict(_view, decisions) {
    const play = firstPlay(decisions)
    if (!play) return null
    if (sameCard(play.card, QUEEN_OF_SPADES)) return passed({ title: 'Queen given away', body: 'You could not win a trick of clubs, so the 13 points go to whoever takes it.', cards: [play.card] })
    return missed({
      title: 'The queen is still yours',
      body: `With no clubs, the Q♠ could have gone on this trick. Kept, it may be you who takes it later.${play.card.suit === 'hearts' ? ` And the ${cardText(play.card)} you played gives the trick's winner a point.` : ''}`,
      cards: cards('Qs'),
    })
  },
}

export const HEARTS_DRILLS: readonly HeartsDrill[] = [firstTrick, leadingHearts, dumpQueen]
