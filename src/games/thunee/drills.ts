/**
 * Thunee's drills: one moment each, dealt the same way every time. Each deal is stacked, and what
 * comes before the moment is played through the engine as written.
 */
import { cardsFrom } from '../../kit/cards'
import { settle } from '../../kit/table'
import type { DecisionRecord, Drill, DrillTable, Verdict } from '../../practice/contract'
import type { Note } from './coach/note'
import { card, named, sentence, who } from './coach/words'
import {
  type Action,
  type Card,
  type Game,
  type RoundSummary,
  type Seat,
  type Suit,
  type View,
  type ViewPlaying,
  CARD_POINTS,
  RANKS,
  availableActions,
  holdsJodhi,
  next,
  seatsFrom,
  seatsToAct,
  teamOf,
  untimedSeats,
} from './engine'

type ThuneeDrill = Drill<Game, Action, View, Note>
type Table = DrillTable<Game, Action>

const cards = (text: string): Card[] => cardsFrom(text, RANKS)

// ── Arranging ────────────────────────────────────────────────────────────

/** Each seat's six cards, the first four dealt before calling and the last two after trump, from this dealer. */
function deal(t: Table, hands: readonly string[], dealer: Seat): void {
  t.patch((game, ctx) => {
    const phase = game.phase
    if (phase.kind !== 'calling') throw new Error(`a drill deals before calling, not in ${phase.kind}`)
    const six = hands.map(cards)
    const order = seatsFrom(next(dealer, game.playerCount), game.playerCount)
    game.dealer = dealer
    game.phase = { ...phase, hands: six.map((h) => h.slice(0, 4)), stock: order.flatMap((s) => six[s].slice(4)), defaultTrumper: next(dealer, game.playerCount) }
    // A new default trumper changes who may call.
    settle(game, ctx, seatsToAct(game), untimedSeats(game))
    return game
  })
}

/** Nobody calls, the dealer's right chooses `trump`, and everyone but `deciding` lets the Thunee window pass. */
function toPlay(t: Table, trump: Suit, deciding: Seat | null = null): void {
  while (t.game.phase.kind === 'calling') t.act(seatsToAct(t.game)[0], { type: 'pass' })
  const phase = t.game.phase
  if (phase.kind !== 'trumpSelection') throw new Error(`expected trump to be chosen, not ${phase.kind}`)
  t.act(phase.trumper, { type: 'chooseTrump', choice: trump })
  for (let waiting = seatsToAct(t.game); t.game.phase.kind === 'thuneeWindow'; waiting = seatsToAct(t.game)) {
    const seat = waiting.find((s) => s !== deciding)
    if (seat === undefined) return
    t.act(seat, { type: 'pass' })
  }
}

/** Cards played in turn, each by whoever's turn it is. A trick's pause runs out first; one that waits on a Jodhi must be answered in the script. */
function play(t: Table, text: string): void {
  for (const c of cards(text)) {
    for (let guard = 0; t.game.phase.kind === 'trickPause' && guard < 5; guard++) t.tick()
    const phase = t.game.phase
    if (phase.kind !== 'playing') throw new Error(`expected a card to be played, not ${phase.kind}`)
    t.act(phase.turn, { type: 'playCard', card: c })
  }
}

// ── Reading the moment ───────────────────────────────────────────────────

function inPlay(view: View): ViewPlaying | null {
  const phase = view.phase
  return phase.kind === 'playing' || phase.kind === 'trickPause' ? phase : null
}

function summaryOf(view: View): RoundSummary | null {
  const phase = view.phase
  return phase.kind === 'roundResult' || phase.kind === 'gameOver' ? phase.summary : null
}

const myTurn = (view: View, phase: ViewPlaying) => phase.kind === 'playing' && phase.turn === view.seat

const passed = (note: Omit<Note, 'tone'>): Verdict<Note> => ({ passed: true, note: { tone: 'suggest', ...note } })
const missed = (note: Omit<Note, 'tone'>): Verdict<Note> => ({ passed: false, note: { tone: 'warn', ...note } })

/** The first decision the player took when `could` was open to them that was not `did`. */
function passedUp(decisions: readonly DecisionRecord<View, Action>[], could: (view: View) => boolean, did: (action: Action) => boolean) {
  return decisions.find((d) => could(d.view) && !did(d.taken)) ?? null
}

/** A side's card points from the tricks it has won, from the player's full memory. */
function cardPoints(phase: ViewPlaying, team: number): number {
  return phase.tricks.filter((t) => teamOf(t.winner) === team).reduce((sum, t) => sum + t.plays.reduce((s, p) => s + CARD_POINTS[p.card.rank], 0), 0)
}

function jodhiPointsOf(phase: ViewPlaying, team: number): number {
  return phase.jodhiClaims.filter((j) => teamOf(j.seat) === team).reduce((sum, j) => sum + j.points, 0)
}

// ── The drills ───────────────────────────────────────────────────────────

/** You lead the J♣, your side's first trick, holding the K♠ and Q♠. */
const jodhi: ThuneeDrill = {
  id: 'jodhi',
  title: 'Call a Jodhi',
  summary: 'Hold a king and queen, win a trick, and call it.',
  playerCount: 4,
  arrange(t) {
    deal(t, ['Jc Ks Qs 9d Ad 10d', 'Qc 9s 10s Jd Kd Qh', 'Ac 10c As Js Qd Kh', 'Kc 9c Jh 9h Ah 10h'], 2)
    toPlay(t, 'hearts')
  },
  brief: {
    tone: 'info',
    title: 'A king and queen together',
    body: 'You hold the K♠ and Q♠: a Jodhi, worth 20 to your side. You may call it right after your side wins its first trick, or its third, and before the next card is led. Win this trick, then call it.',
    cards: cards('Ks Qs'),
    topic: 'jodhi',
  },
  guide(view) {
    const phase = inPlay(view)
    if (!phase) return null
    if (availableActions(view).claimJodhi.includes('spades'))
      return { tone: 'suggest', title: 'Call Jodhi now', body: 'Your side has won its first trick. Call Jodhi in spades before the next card is led.', cards: cards('Ks Qs'), topic: 'jodhi' }
    if (myTurn(view, phase) && phase.tricks.length === 0 && phase.current.length === 0)
      return { tone: 'info', title: 'Win the first trick', body: 'Lead the J♣. The jack is the highest card of its suit: only a trump can beat it, and the trumper’s side would have to hold no clubs to play one.', cards: cards('Jc') }
    return null
  },
  verdict(view, decisions) {
    const decision = decisions.find((d) => d.taken.type === 'claimJodhi')
    const claim = decision?.taken
    if (decision && claim?.type === 'claimJodhi') {
      const hand = inPlay(decision.view)?.hand ?? []
      if (!holdsJodhi(hand, claim.suit, claim.withJack))
        return missed({
          title: 'A false Jodhi',
          body: `You do not hold the king and queen of ${claim.suit}${claim.withJack ? ' and the jack' : ''}, so an opponent could challenge it and win 4 balls. Your Jodhi was the K♠ and Q♠, without the jack.`,
          cards: cards('Ks Qs'),
        })
      return passed({ title: 'Jodhi called', body: 'Your side gains 20 points this round. A Jodhi in trump is worth 40, and holding the jack as well adds 10 more.', cards: cards('Ks Qs') })
    }
    // Leading on, or saying no, is what lets the chance pass.
    const missedIt = passedUp(decisions, (v) => availableActions(v).claimJodhi.includes('spades'), (a) => a.type !== 'playCard' && a.type !== 'pass')
    if (missedIt) return missed({ title: 'The chance passed', body: 'Once the next card is led, a Jodhi can no longer be called for that trick. Call it as soon as your side has won the trick.' })
    const first = inPlay(view)?.tricks[0]
    if (first && teamOf(first.winner) !== teamOf(view.seat!))
      return missed({ title: 'The other side won the trick', body: `${who(view, first.winner)} took the first trick, so there was no Jodhi to call yet. Lead the J♣, the highest club.`, cards: cards('Jc') })
    if (summaryOf(view)) return missed({ title: 'The round ended first', body: 'The round was over before your side won a trick to call the Jodhi on.' })
    return null
  },
}

/**
 * The last trick: your side has called a Jodhi in trump with the jack, 50, and the other side has
 * only 44 in cards. You play last, with the J♥.
 */
const khanaak: ThuneeDrill = {
  id: 'khanaak',
  title: 'Call Khanaak',
  summary: 'Win the last trick on the strength of your Jodhi.',
  playerCount: 4,
  arrange(t) {
    deal(t, ['Jh Kh Qh As 9c 10d', 'Qs Kc Kd 10c 9h Ah', 'Js Jc Jd 9s 10h Ad', 'Ks Qc Qd 10s Ac 9d'], 3)
    toPlay(t, 'hearts')
    play(t, 'Qs Js Ks As')
    t.act(0, { type: 'claimJodhi', suit: 'hearts', withJack: true })
    play(t, 'Jc Qc 9c Kc  Jd Qd 10d Kd')
    // Partner leads next, after your side's third trick: the pause waits on your Jodhi, and you have none left to call.
    if (t.game.phase.kind === 'trickPause' && seatsToAct(t.game).includes(0)) t.act(0, { type: 'pass' })
    play(t, '9s 10s Qh 10c  Kh 9h 10h Ac  Ah Ad 9d')
  },
  brief: {
    tone: 'info',
    title: 'The last trick, after your Jodhi',
    body: 'Your side called a Jodhi in trump with the jack: 50. Before you play to the last trick you may call Khanaak, if your side has lost a trick and your Jodhi plus 10 is more than the other side’s points. Win the trick yourself and it is worth 3 balls; fail and the other side gets 4.',
    cards: cards('Jh'),
    topic: 'khanaak',
  },
  guide(view) {
    const phase = inPlay(view)
    if (!phase || !myTurn(view, phase) || !availableActions(view).callKhanaak) return null
    const team = teamOf(view.seat!)
    const ours = jodhiPointsOf(phase, team)
    const theirs = cardPoints(phase, 1 - team) + jodhiPointsOf(phase, 1 - team)
    return {
      tone: 'suggest',
      title: 'Call Khanaak, then play',
      body: `Your side’s Jodhi is ${ours}, and the other side has ${theirs}. ${ours} plus 10 is more than ${theirs}, and your ${card(phase.hand[0])} wins this trick. Call Khanaak first, then play it.`,
      cards: phase.hand,
      topic: 'khanaak',
    }
  },
  verdict(view) {
    const summary = summaryOf(view)
    if (!summary) return null
    const k = summary.khanaak
    if (k?.success && k.caller === view.seat) return passed({ title: 'Khanaak made', body: `Jodhi ${k.jodhi} plus 10 beat ${k.opponentPoints}, and you won the last trick: ${summary.balls} balls to your side.` })
    if (k) return missed({ title: 'Khanaak failed', body: 'The call needs you to win the last trick yourself.' })
    return missed({ title: 'No call', body: `You won the last trick, but the round was scored as usual, for ${summary.balls} ball${summary.balls === 1 ? '' : 's'}. Called first, Khanaak would have been worth 3.` })
  },
}

/** Five hearts with the J, 9 and A, and the J♠: every trick is yours. */
const thunee: ThuneeDrill = {
  id: 'thunee',
  title: 'Call Thunee',
  summary: 'Spot a hand that wins every trick, and call it.',
  playerCount: 4,
  arrange(t) {
    deal(t, ['Jh 9h Ah 10h Kh Js', 'Qh 9s As Jd 9d Jc', '9c Ac 10s Ks Ad 10d', 'Qs Kd Qd 10c Kc Qc'], 1)
    toPlay(t, 'clubs', 0)
  },
  brief: {
    tone: 'info',
    title: 'Win all six tricks',
    body: 'Once everyone has six cards, anyone may call Thunee: a promise to win every trick alone. Winning all six is worth 4 balls. Look at your hand: can anyone beat it?',
    cards: cards('Jh 9h Ah 10h Kh Js'),
    topic: 'thunee',
  },
  guide(view) {
    const phase = view.phase
    if (phase.kind === 'thuneeWindow' && availableActions(view).callThunee)
      return {
        tone: 'suggest',
        title: 'A sure Thunee',
        body: 'Lead the J♥ and hearts become trump. Only the Q♥ is missing, and it must fall to your jack. After that your trumps and the J♠ cannot be beaten. Call Thunee.',
        cards: cards('Jh Js'),
        topic: 'thunee',
      }
    const play = inPlay(view)
    if (!play || play.thunee?.caller !== view.seat || !myTurn(view, play) || play.current.length > 0) return null
    if (play.tricks.length === 0) return { tone: 'info', title: 'Lead the J♥', body: 'The first card you lead becomes trump. Lead the J♥ and hearts are trump.', cards: cards('Jh') }
    return { tone: 'info', title: 'Keep leading high', body: 'Lead your highest card each time, so nobody can win a trick.' }
  },
  verdict(view, decisions) {
    if (passedUp(decisions, (v) => availableActions(v).callThunee, (a) => a.type === 'callThunee'))
      return missed({ title: 'A Thunee left uncalled', body: 'With the J♥ led first, hearts were trump and nothing could beat your hand. Calling Thunee would have won 4 balls.', cards: cards('Jh 9h Ah 10h Kh Js') })
    const summary = summaryOf(view)
    if (!summary) return null
    if (summary.thunee?.success) return passed({ title: 'Thunee made', body: 'Six tricks out of six: 4 balls to your side.' })
    return missed({ title: 'The Thunee was stopped', body: 'Lead the J♥ first, so hearts are trump, then your highest card each time.' })
  },
}

/** The player on your right (seat 1) trumped your A♥ while holding a heart, then led one. */
const challenge: ThuneeDrill = {
  id: 'challenge',
  title: 'Catch a cheat',
  summary: 'An opponent did not follow suit. Prove it.',
  playerCount: 4,
  arrange(t) {
    deal(t, ['Ah Jd 9d Ac 10c Kc', '10h 9s Jc 9c Kd Qd', 'Kh Jh Ad 10d Qc Qs', 'Qh 9h Js As 10s Ks'], 2)
    toPlay(t, 'spades')
    play(t, 'Ah 9s Kh Qh  10h Jh 9h')
  },
  brief: {
    tone: 'info',
    title: 'Watch what they play',
    body: 'Everyone must follow the suit led if they can. A player who does not can be challenged: if you are right your side wins 4 balls, and if you are wrong the other side does. Only challenge what you can prove.',
    topic: 'challenge',
  },
  guide(view) {
    const phase = inPlay(view)
    if (!phase || !myTurn(view, phase) || !availableActions(view).challengePlay.includes(1)) return null
    const name = who(view, 1)
    return {
      tone: 'suggest',
      title: `${name} broke the rules`,
      body: `In the first trick ${named(view, 1)} trumped your A♥ with the 9♠. Now they have led the 10♥, so they held a heart then and had to play it. Challenge ${name}.`,
      cards: cards('9s 10h'),
      seats: [1],
      topic: 'challenge',
    }
  },
  verdict(view, decisions) {
    const name = who(view, 1)
    const summary = summaryOf(view)
    const c = summary?.challenge
    if (c && c.challenger === view.seat) {
      if (c.guilty) return passed({ title: 'Caught', body: `${name} held the 10♥ when the A♥ was led. A correct challenge wins your side 4 balls.` })
      return missed({ title: 'A wrong challenge', body: `${who(view, c.accused)} played by the rules, so the other side wins 4 balls. It was ${named(view, 1)} who broke them.` })
    }
    const could = (v: View) => availableActions(v).challengePlay.includes(1)
    if (passedUp(decisions, could, (a) => a.type === 'challengePlay'))
      return missed({ title: 'A broken rule went by', body: `${sentence(named(view, 1))} trumped the A♥ while holding the 10♥. A challenge then would have won 4 balls.`, cards: cards('9s 10h') })
    return null
  },
}

export const THUNEE_DRILLS: readonly ThuneeDrill[] = [jodhi, khanaak, thunee, challenge]
