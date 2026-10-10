import { describe, expect, test } from 'vitest'
import { cardId, cardText, hasCard, sameCard } from '../../../kit/cards'
import { HONEST } from '../../../kit/mind'
import { same } from '../../../kit/testing'
import { trickWinner } from '../../../kit/tricks'
import { decide } from '../ai/choose'
import type { Reason } from '../ai/reasons'
import {
  type Action,
  type Card,
  type Game,
  JACK_OF_DIAMONDS,
  QUEEN_OF_SPADES,
  type RuleOverrides,
  type View,
  availableActions,
  createDeck,
  isPointCard,
  penaltyPoints,
  strength,
  viewFor,
} from '../engine'
import { Table, card, cards } from '../engine/testing'
import { heartsBasis, heartsCoach } from '.'

const you = (game: Game, seat = 0): View => viewFor(game, seat, 'full')
const play = (c: string): Action => ({ type: 'playCard', card: card(c) })
const RISK = 'If anyone notices, they can challenge you: the round ends at once, and you take 26 points.'

/** A card as the advice may name it: by its face, or for the two cards with a name of their own, in words. */
const named = (body: string, c: Card) =>
  body.includes(cardText(c)) ||
  (c.suit === 'spades' && c.rank === 'Q' && body.includes('queen of spades')) ||
  (c.suit === 'clubs' && c.rank === '2' && body.includes('two of clubs'))

/** What a reason carries besides its card, as the advice must say it. */
function carried(reason: Reason, view: View): string[] {
  const phase = view.phase
  const led = phase.kind === 'playing' && phase.current.length > 0 ? phase.current[0].card.suit : null
  switch (reason.code) {
    case 'duck':
      return [cardText(reason.under)]
    case 'stopMoon':
      return [view.seats[reason.shooter].name]
    case 'dumpQueen':
    case 'dumpHighSpade':
    case 'dumpHeart':
    case 'dumpHigh':
      return [`You hold no ${led}`]
    case 'leadLow':
      return reason.higher === 0 ? ['nothing higher in its suit is still out'] : ['still out']
    default:
      return []
  }
}

const isLowSpade = (c: Card) => c.suit === 'spades' && strength(c) < strength(QUEEN_OF_SPADES)

/**
 * The claims a phrase makes beyond naming its cards, checked against the game as the engine has it:
 * what is on the table, who has taken what, and which cards the player keeps.
 */
function checkClaims(reason: Reason, view: View, body: string): void {
  const phase = view.phase
  switch (reason.code) {
    case 'firstTrickHigh': {
      // Safe to win: no heart and no queen of spades on this trick so far, and the first-trick rule is in force.
      if (phase.kind !== 'playing') throw new Error(phase.kind)
      expect(phase.current.some((p) => isPointCard(p.card)), body).toBe(false)
      expect(phase.tricks.length === 0 && !view.rules.pointsOnFirstTrick, body).toBe(true)
      return
    }
    case 'stopMoon': {
      // The shooter has taken every point so far; the card beats what is down; the trick holds points to take.
      if (phase.kind !== 'playing') throw new Error(phase.kind)
      const taken = [0, 1, 2, 3].map((seat) => penaltyPoints(phase.tricks.filter((t) => t.winner === seat).flatMap((t) => t.plays.map((p) => p.card))))
      expect(taken.every((p, seat) => seat === reason.shooter || p === 0) && taken[reason.shooter] >= 13, body).toBe(true)
      expect(trickWinner([...phase.current, { seat: view.seat!, card: reason.card }], { trump: null, strength }), body).toBe(view.seat)
      expect(penaltyPoints(phase.current.map((p) => p.card)), body).toBeGreaterThan(0)
      return
    }
    case 'pass': {
      if (phase.kind !== 'passing') throw new Error(phase.kind)
      const passed = reason.picks.map((p) => p.card)
      const kept = phase.hand.filter((c) => !hasCard(passed, c))
      const highest = reason.picks.filter((p) => p.why === 'highCard').map((p) => p.card)
      const plain = highest.filter((c) => !isLowSpade(c))
      if (plain.length > 0) {
        // "The highest cards left in your hand" only when nothing kept outranks them; otherwise each card kept above them has its reason given.
        const above = kept.filter((c) => strength(c) > Math.min(...plain.map(strength)))
        if (body.includes('left in your hand')) expect(above.map(cardText), body).toEqual([])
        for (const c of above) {
          const why = isLowSpade(c)
            ? 'Spades below the queen are passed last'
            : sameCard(c, QUEEN_OF_SPADES)
              ? 'the queen of spades stays'
              : sameCard(c, JACK_OF_DIAMONDS) && view.rules.jackOfDiamonds
                ? 'The jack of diamonds stays'
                : null
          expect(why, `${cardText(c)} is kept above a card passed as the highest: ${body}`).not.toBeNull()
          expect(body).toContain(why)
        }
      }
      if (highest.some(isLowSpade)) {
        // "With nothing else to spare": everything kept is a spade below the queen, or a card the pass protects.
        const spare = kept.filter((c) => !isLowSpade(c) && !sameCard(c, QUEEN_OF_SPADES) && !(view.rules.jackOfDiamonds && sameCard(c, JACK_OF_DIAMONDS)))
        expect(spare.map(cardText), body).toEqual([])
      }
      return
    }
    default:
      return
  }
}

/** Plays whole games in which every seat follows the honest player, asking the coach at every decision. */
function honestGames(overrides: RuleOverrides, seeds: number, ask: (view: View, reason: Reason, action: Action) => void): void {
  for (let seed = 1; seed <= seeds; seed++) {
    const t = new Table({ gameEndsAt: 50, ...overrides }, seed)
    t.do(0, { type: 'start' })
    for (let guard = 0; guard < 5000 && t.game.phase.kind !== 'gameOver'; guard++) {
      const phase = t.game.phase
      if (phase.kind === 'trickPause') t.endPause()
      else if (phase.kind === 'roundResult') t.do(0, { type: 'nextRound' })
      else {
        const seat = phase.kind === 'passing' ? phase.chosen.findIndex((c) => c === null) : phase.kind === 'playing' ? phase.turn : null
        if (seat === null) throw new Error(`stuck in ${phase.kind}`)
        const view = you(t.game, seat)
        const decision = decide(view, HONEST)!
        ask(view, decision.reason, decision.action)
        t.do(seat, decision.action)
      }
    }
    expect(t.game.phase.kind).toBe('gameOver')
  }
}

describe('Hearts’ coach puts every reason into words', () => {
  test('in whole games, the hint is the honest player’s move, named, with what its reason carries, in sentence case and plain words', () => {
    const seen = new Set<string>()
    for (const overrides of [{}, { jackOfDiamonds: true }, { pointsOnFirstTrick: true }] satisfies RuleOverrides[]) {
      honestGames(overrides, 6, (view, reason, action) => {
        const advice = heartsCoach.advise(view)!
        const situation = heartsCoach.situation(view)!
        const body = advice.note.body
        // Checked at every decision, so without expect's cost.
        const fail = (what: string) => {
          throw new Error(`${reason.code}: ${what}: ${body}`)
        }
        if (!same(advice.action, action)) fail(`the hint is ${JSON.stringify(advice.action)}, not ${JSON.stringify(action)}`)
        for (const c of reason.code === 'pass' ? reason.picks.map((p) => p.card) : [reason.card]) if (!named(body, c)) fail(`${cardText(c)} is not named`)
        for (const words of carried(reason, view)) if (!body.includes(words)) fail(`"${words}" is not said`)
        checkClaims(reason, view, body)
        if (!same(advice.note.cards, action.type === 'choosePass' ? action.cards : action.type === 'playCard' ? [action.card] : [])) fail('the cards shown are not the move’s')
        if (heartsCoach.check(view, action) !== null) fail('the hint is warned against')
        for (const line of [situation.title, situation.body, advice.note.title, body]) {
          if (!/^[A-Z0-9]/.test(line) || /\bbid/i.test(line)) fail(`"${line}" is not in sentence case and plain words`)
        }
        seen.add(reason.code)
      })
    }
    // Every reason the honest player gives; a cheat's `renege` is never advised.
    expect([...seen].sort()).toEqual(
      ['pass', 'openingLead', 'onlyCard', 'firstTrickHigh', 'fishForQueen', 'leadLow', 'leadLeastBad', 'duck', 'winClean', 'playLow', 'stopMoon', 'takeJack', 'dumpQueen', 'dumpHighSpade', 'dumpHeart', 'dumpHigh'].sort(),
    )
  })
})

// Hands before the pass: seat 0 holds clubs, hearts and the queen of spades.
const DEAL = [
  '2c 9c Kc 3h 7h Ah Qs 4s 5d 6d 7d 8d 9d',
  '3c 4c 5c 6c 7c 2h 4h 5h 6h 2s 3s 5s 2d',
  '8c 10c Jc Qc 8h 9h 10h Jh 6s 7s 8s 3d 4d',
  'Ac Kh Qh 9s 10s Js Ks As 10d Jd Qd Kd Ad',
]
// Seat 0 holds the two of clubs and leads; seat 1 then holds clubs; seat 3 has none.
const NO_PASS = [
  '2c 9c Kc 3h 7h Ah Qs 4s 5d 6d 7d 8d 9d',
  '3c 4c 5c 6c 7c 2h 4h 5h 6h 2s 3s 5s 2d',
  '8c 10c Jc Qc Ac 8h 9h 10h Jh 6s 7s 8s 3d',
  'Kh Qh 9s 10s Js Ks As 4d 10d Jd Qd Kd Ad',
]

describe('Hearts’ situation', () => {
  test('passing: what to choose, and where cards come from', () => {
    const t = new Table().deal(DEAL)
    expect(heartsCoach.situation(you(t.game))).toEqual({
      tone: 'info',
      title: 'Your move',
      body: 'Pick three cards to pass to P1, on your left. P3, on your right, will pass you three cards.',
    })
    t.do(0, { type: 'choosePass', cards: availableActions(you(t.game)).pass.slice(0, 3) })
    expect(heartsCoach.situation(you(t.game))).toBeNull()
    expect(heartsCoach.advise(you(t.game))).toBeNull()
  })

  test('the opening lead, a lead before hearts are broken, following suit, and the first trick with none of the suit', () => {
    const t = new Table({ passing: 'none' }).deal(NO_PASS)
    expect(heartsCoach.situation(you(t.game))?.body).toBe('You hold the two of clubs, so you lead it to the first trick.')
    t.play('2c')
    expect(heartsCoach.situation(you(t.game, 1))?.body).toBe('Clubs were led and you hold some, so you must follow suit. P0 is winning with 2♣. This trick holds no points so far.')
    t.play('3c 8c')
    expect(heartsCoach.situation(you(t.game, 3))?.body).toBe(
      'You hold no clubs, so you may play any card except a heart or the queen of spades, which may not be played to the first trick. P2 is winning with 8♣. This trick holds no points so far.',
    )
    t.play('4d')
    // Seat 2 took the trick with the 8♣ and leads, with hearts not broken.
    expect(heartsCoach.situation(you(t.endPause().game, 2))?.body).toBe('You lead the second trick. Hearts are not broken yet, so you may not lead one.')
  })

  test('nothing to decide: no situation, no hint', () => {
    const t = new Table({ passing: 'none' }).deal(NO_PASS)
    for (const seat of [1, 2, 3]) {
      expect(heartsCoach.situation(you(t.game, seat))).toBeNull()
      expect(heartsCoach.advise(you(t.game, seat))).toBeNull()
    }
  })
})

describe('Hearts’ one warning: a card that breaks a rule', () => {
  test('not following suit', () => {
    const t = new Table({ passing: 'none' }).deal(NO_PASS).play('2c 3c 8c 4d').endPause()
    // Seat 2 leads the 10♣; seat 3 has no clubs; seat 0 holds the 9♣ and K♣.
    t.play('10c 10d')
    const v = you(t.game)
    expect(heartsCoach.check(v, play('5d'))).toEqual({
      tone: 'warn',
      rule: 'illegal',
      title: 'That breaks the rules',
      body: `5♦ does not follow clubs, and you hold 9♣ and K♣: whoever can follow suit must. ${RISK}`,
      cards: [card('5d')],
    })
    expect(heartsCoach.check(v, play('9c'))).toBeNull()
    expect(heartsCoach.check(v, heartsCoach.advise(v)!.action)).toBeNull()
  })

  test('a point card on the first trick, and a heart led before hearts are broken', () => {
    const first = new Table({ passing: 'none' }).deal(NO_PASS).play('2c 3c 8c')
    expect(heartsCoach.check(you(first.game, 3), play('Kh'))?.body).toBe(`K♥ is a point card, and none may be played to the first trick while you hold anything else. ${RISK}`)
    const lead = first.play('4d').endPause()
    expect(heartsCoach.check(you(lead.game, 2), play('8h'))?.body).toBe(`Hearts are not broken yet, so 8♥ may not be led while you hold another suit. ${RISK}`)
  })

  test('the review names each rule broken, then each move against the hint, with its reason', () => {
    const t = new Table({ passing: 'none' }).deal(NO_PASS).play('2c 3c 8c')
    const v = you(t.game, 3)
    const hint = heartsCoach.advise(v)!
    const notes = heartsCoach.review({
      decisions: [
        { view: v, advised: hint.action, taken: play('Kh') },
        { view: v, advised: hint.action, taken: play('Ad') },
      ],
      summary: null,
      dealt: [],
      you: 3,
      view: v,
    })
    expect(notes[0]).toEqual({ tone: 'warn', title: 'Trick 1: a rule broken', body: 'K♥ is a point card, and none may be played to the first trick while you hold anything else.', cards: [card('Kh')] })
    expect(notes.slice(1)).toEqual([{ tone: 'suggest', title: 'Trick 1: you chose “Play A♦”', body: `The hint was “${hint.note.title}”. ${hint.note.body}`, cards: hint.note.cards }])
  })

  test('in the review, touching cards are as good as each other, unless the card between them is on the table and one wins', () => {
    // Seat 1 follows the 2♣ with the 9♣; seat 2 holds the 8♣ and 10♣, and the 7♣ under them.
    const t = new Table({ passing: 'none' })
      .deal([
        '2c 3c 4c 2d 3d 4d 5d 2h 3h 4h 5h 2s 3s',
        '9c 5c 6c 6d 7d 8d 9d 6h 7h 8h 9h 4s 5s',
        '8c 10c 7c 10d Jd Qd Kd 10h Jh Qh Kh 6s 7s',
        'Jc Qc Kc Ac Ad Ah 8s 9s 10s Js Qs Ks As',
      ])
      .play('2c 9c')
    const v = you(t.game, 2)
    expect(heartsBasis.asGood!(v, play('8c'), play('10c'))).toBe(false)
    expect(heartsBasis.asGood!(v, play('7c'), play('8c'))).toBe(true)
  })

  test('with cheating off the card is refused, so there is nothing to warn about', () => {
    const t = new Table({ passing: 'none', allowCheating: false }).deal(NO_PASS).play('2c 3c 8c')
    expect(heartsCoach.check(you(t.game, 3), play('Kh'))).toBeNull()
  })
})

/** `hands` where given, and the rest of the deck in order to the seats left null. */
function fill(hands: (string | null)[]): string[] {
  const used = new Set(hands.flatMap((h) => (h === null ? [] : cards(h).map(cardId))))
  const rest = createDeck().filter((c) => !used.has(cardId(c)))
  return hands.map((h) => h ?? rest.splice(0, 13).map((c) => `${c.rank}${c.suit[0]}`).join(' '))
}

/** The honest advice for a seat, with its reason, its claims checked. */
function advised(t: Table, seat: number) {
  const view = you(t.game, seat)
  const decision = decide(view, HONEST)!
  const body = heartsCoach.advise(view)!.note.body
  checkClaims(decision.reason, view, body)
  return { reason: decision.reason, body }
}

/** The trick just completed. */
function lastTrick(t: Table) {
  if (t.game.phase.kind !== 'trickPause') throw new Error(t.game.phase.kind)
  return t.game.phase.play.tricks[t.game.phase.play.tricks.length - 1]
}

describe('Hearts’ phrases claim only what the decision establishes', () => {
  test('the first trick: no points so far, the rule and its exception, and no promise that none will come', () => {
    // Seat 3 holds nothing but hearts, so it may play one to the first trick.
    const t = new Table({ passing: 'none', allowCheating: false }).deal([
      '2c 2s 3s 4s 5s 6s 7s 8s 9s 10s Js Qs Ks',
      '3c 4c 5c 6c 7c 8c 9c 10c Jc Qc Kc Ac As',
      '2d 3d 4d 5d 6d 7d 8d 9d 10d Jd Qd Kd Ad',
      '2h 3h 4h 5h 6h 7h 8h 9h 10h Jh Qh Kh Ah',
    ])
    t.play('2c')
    const { reason, body } = advised(t, 1)
    expect(reason).toEqual({ code: 'firstTrickHigh', card: card('Ac') })
    expect(body).toBe(
      'Nobody may play a heart or the queen of spades to the first trick unless they hold nothing else, so it is almost always safe to win. Get rid of your highest club, A♣.',
    )
    t.play('Ac Ad')
    // The exception the phrase states: a hand of nothing but hearts may play one, and the ace takes it.
    expect(availableActions(you(t.game, 3)).legal.map(cardText)).toContain('A♥')
    t.play('Ah')
    expect(lastTrick(t).winner).toBe(1)
    expect(penaltyPoints(lastTrick(t).plays.map((p) => p.card))).toBe(1)
  })

  test('stopping a moon: the card beats what is down, and only if it holds are the points taken from the shooter', () => {
    // Seat 3 takes the queen of spades, which breaks hearts; seat 0 wins a trick with no points and leads a heart.
    const t = new Table({ passing: 'none', queenBreaksHearts: true }).deal([
      '2c 5c 6c 7c 2s 4s 5s 6s Ad 5d 6d 7d 2h',
      '3c 8c 9c Qs 7s 8s 3d 8d 9d 3h 5h 7h 8h',
      '4c 10c Jc 3s 9s 10s 4d 10d Jd 4h 9h 10h Jh',
      'Ac Qc Kc As Js Ks 2d Qd Kd 6h Qh Kh Ah',
    ])
    t.play('2c 3c 4c Ac  As 2s Qs 3s  2d Ad 3d 4d  2h')
    const { reason, body } = advised(t, 1)
    expect(reason).toEqual({ code: 'stopMoon', card: card('3h'), shooter: 3 })
    expect(body).toBe('P3 has taken every point so far and could shoot the moon. 3♥ beats what is on the table: if it holds, you take this trick’s points, and they can no longer take all 26.')
    // The shooter, still to play, overtakes it.
    t.play('3h 4h 6h')
    expect(lastTrick(t).winner).toBe(3)
  })

  test('passing the highest cards left once the spades below the queen are kept', () => {
    const t = new Table().deal(fill(['Js 10s 9s 8s 7s 2c 3c 4c 5c 2d 3d 4d 5d', null, null, null]))
    const { reason, body } = advised(t, 0)
    expect(reason).toEqual({ code: 'pass', picks: cards('5d 5c 4d').map((c) => ({ card: c, why: 'highCard' })) })
    expect(body).toBe('Spades below the queen are passed last: they let you play under her when spades are led. Of the rest, 5♦, 5♣ and 4♦ are the highest, the likeliest to win tricks you do not want.')
  })

  test('passing a spade below the queen only when nothing else is left to spare', () => {
    // Eleven spades keep the queen; the club empties a suit; the five of hearts is the only other card.
    const t = new Table().deal(fill(['2s 3s 4s 5s 6s 7s 8s 9s 10s Js Qs 5h 4c', null, null, null]))
    const { reason, body } = advised(t, 0)
    expect(reason).toEqual({
      code: 'pass',
      picks: [
        { card: card('4c'), why: 'shortSuit' },
        { card: card('5h'), why: 'highCard' },
        { card: card('Js'), why: 'highCard' },
      ],
    })
    expect(body).toBe(
      'Passing 4♣ empties your clubs: unless you are passed some, you can throw away a bad card whenever clubs are led. Spades below the queen are passed last: they hide her. With five or more spades the queen of spades stays, hidden among them. Of the rest, 5♥ is the highest, the likeliest to win tricks you do not want. With nothing else to spare, J♠ goes too.',
    )
  })

  test('the highest card left, when nothing kept outranks it', () => {
    const t = new Table().deal(fill(['Qs Ks 3s 2c 3c 4c 5c 6d 7d 8d 9d 10d 2h', null, null, null]))
    const { reason, body } = advised(t, 0)
    expect(reason.code === 'pass' && reason.picks.map((p) => p.why)).toEqual(['queenOfSpades', 'highSpade', 'highCard'])
    expect(body).toBe('With fewer than five spades the queen of spades is hard to hide, and she is 13 points. K♠ could win a trick with the queen of spades in it. 10♦ is the highest card left in your hand, the likeliest to win tricks you do not want.')
  })
})
