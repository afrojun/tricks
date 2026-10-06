import { describe, expect, test } from 'vitest'
import { cardText } from '../../../kit/cards'
import { HONEST } from '../../../kit/mind'
import { decide } from '../ai/choose'
import type { Reason } from '../ai/reasons'
import { type Action, type Card, type Game, type RuleOverrides, type View, availableActions, viewFor } from '../engine'
import { Table, card } from '../engine/testing'
import { heartsCoach } from '.'

const you = (game: Game, seat = 0): View => viewFor(game, seat, 'full')
const play = (c: string): Action => ({ type: 'playCard', card: card(c) })
const RISK = 'If anyone notices, they can accuse you: the round ends at once, and you take 26 points.'

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
      return [`You have no ${led}`]
    case 'leadLow':
      return reason.higher === 0 ? ['Nothing still out'] : ['still out']
    default:
      return []
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
  test('in whole games, the hint is the honest player’s move, named, with what its reason carries', () => {
    const seen = new Set<string>()
    for (const overrides of [{}, { jackOfDiamonds: true }, { pointsOnFirstTrick: true }] satisfies RuleOverrides[]) {
      honestGames(overrides, 6, (view, reason, action) => {
        const advice = heartsCoach.advise(view)!
        expect(advice.action).toEqual(action)
        const where = `${reason.code}: ${advice.note.body}`
        if (reason.code === 'pass') for (const pick of reason.picks) expect(named(advice.note.body, pick.card), where).toBe(true)
        else expect(named(advice.note.body, reason.card), where).toBe(true)
        for (const words of carried(reason, view)) expect(advice.note.body, where).toContain(words)
        expect(advice.note.cards).toEqual(action.type === 'choosePass' ? action.cards : action.type === 'playCard' ? [action.card] : [])
        expect(heartsCoach.check(view, action), where).toBeNull()
        expect(heartsCoach.situation(view)?.body).not.toBe('')
        seen.add(reason.code)
      })
    }
    // Every reason the honest player gives; a cheat's `renege` is never advised.
    expect([...seen].sort()).toEqual(
      ['pass', 'openingLead', 'onlyCard', 'firstTrickHigh', 'fishForQueen', 'leadLow', 'leadLeastBad', 'duck', 'winClean', 'playLow', 'stopMoon', 'takeJack', 'dumpQueen', 'dumpHighSpade', 'dumpHeart', 'dumpHigh'].sort(),
    )
  }, 60_000)

  test('every phrase is in sentence case and plain words', () => {
    honestGames({ jackOfDiamonds: true }, 2, (view) => {
      for (const note of [heartsCoach.situation(view), heartsCoach.advise(view)?.note]) {
        for (const line of [note!.title, note!.body]) {
          expect(line).toMatch(/^[A-Z0-9]/)
          expect(line).not.toMatch(/\bbid/i)
        }
      }
    })
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
      body: 'Choose three cards to pass to the left. You will be passed three from the right.',
    })
    t.do(0, { type: 'choosePass', cards: availableActions(you(t.game)).pass.slice(0, 3) })
    expect(heartsCoach.situation(you(t.game))).toBeNull()
    expect(heartsCoach.advise(you(t.game))).toBeNull()
  })

  test('the opening lead, a lead before hearts are broken, following suit, and the first trick with none of the suit', () => {
    const t = new Table({ passing: 'none' }).deal(NO_PASS)
    expect(heartsCoach.situation(you(t.game))?.body).toBe('You hold the two of clubs, so you lead it to the first trick.')
    t.play('2c')
    expect(heartsCoach.situation(you(t.game, 1))?.body).toBe('Clubs were led and you have some, so you must follow suit. P0 is winning with 2♣. This trick holds no points so far.')
    t.play('3c 8c')
    expect(heartsCoach.situation(you(t.game, 3))?.body).toBe(
      'You have no clubs, so you may play any card except a heart or the queen of spades, which may not be played to the first trick. P2 is winning with 8♣. This trick holds no points so far.',
    )
    t.play('4d')
    // Seat 2 took the trick with the 8♣ and leads, with hearts not broken.
    expect(heartsCoach.situation(you(t.endPause().game, 2))?.body).toBe('You lead trick 2. Hearts are not broken yet, so you may not lead one.')
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

  test('the review names each rule broken, and nothing else', () => {
    const t = new Table({ passing: 'none' }).deal(NO_PASS).play('2c 3c 8c')
    const v = you(t.game, 3)
    const notes = heartsCoach.review({
      decisions: [
        { view: v, advised: play('4d'), taken: play('Kh') },
        { view: v, advised: play('4d'), taken: play('Ad') },
      ],
      summary: null,
      dealt: [],
      you: 3,
      view: v,
    })
    expect(notes).toEqual([{ tone: 'warn', title: 'A rule broken', body: 'K♥ is a point card, and none may be played to the first trick while you hold anything else.', cards: [card('Kh')] }])
  })

  test('with cheating off the card is refused, so there is nothing to warn about', () => {
    const t = new Table({ passing: 'none', allowCheating: false }).deal(NO_PASS).play('2c 3c 8c')
    expect(heartsCoach.check(you(t.game, 3), play('Kh'))).toBeNull()
  })
})
