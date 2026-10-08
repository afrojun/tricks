/** The coach names a broken rule as the engine judges it: from the same excuses, so the two cannot disagree. */
import { describe, expect, test } from 'vitest'
import { type Card, type Game, type PlayRecord, type RoundSummary, type View, availableActions, hasCard, sameCard, viewFor } from '../engine'
import { Table, card, seededRng } from '../engine/testing'
import { thuneePractice } from '../practice'
import { PracticeGame } from '../../../practice/game'
import { inPlay } from '../ai/suspicion'
import { check, illegalKind } from './check'
import { review } from './review'

const you = (game: Game, seat = 0): View => viewFor(game, seat, 'full')
const four = (hands: string[]) => new Table(4, { redealIfNoTrumps: false }).deal(hands).toPlay('spades')
const play = (c: string) => ({ type: 'playCard', card: card(c) }) as const
const summary: RoundSummary = {
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
  normal: { countingTeam: 0, lines: [], total: 80, target: 105 },
}
/** What the review says of one rule-breaking play by the player. */
const reviewed = (view: View, c: string) => review({ decisions: [{ view, advised: null, taken: play(c) }], summary, dealt: [], you: 0, view }).map((n) => n.body)

// Trump spades; seat 2 leads, then 3, 0, 1.
// Seat 2 leads clubs and seat 3 trumps with the J♠. Seat 0 holds no clubs, the Q♠ and hearts.
const UNDER = ['Qs Jh 9h Ah 10h Kh', '9s As 10s Ks Qh Jd', 'Jc 9c Ac 10c Kc Qc', 'Js 9d Ad 10d Kd Qd']
// Seat 2 leads the K♥ and seat 3 trumps with the J♠. Seat 0 holds hearts and the Q♠.
const BOTH = ['Qs Ah 10h Qh Jc 9c', '9s As 10s Ks Jh 9h', 'Kh Jd 9d Ad 10d Kd', 'Js Qd Kc Qc Ac 10c']

describe('the coach judges a broken rule by the engine’s excuses', () => {
  test('a card off the suit led, from a hand that holds it, fails to follow', () => {
    const v = you(four(BOTH).play('Kh Qd').game)
    expect(illegalKind(inPlay(v)!, card('Jc'), v.rules)).toBe('follow')
    expect(check(v, play('Jc'))?.body).toBe('Hearts were led and you hold A♥, 10♥ and Q♥, so you must follow suit. If an opponent notices, they can challenge and win 4 balls.')
    expect(reviewed(v, 'Jc')).toContain('You did not follow hearts when you could have. Nobody challenged this time, but a challenge would have cost your side 4 balls.')
  })

  test('a trump under a higher one, from a hand with another suit, undercuts', () => {
    const v = you(four(UNDER).play('Jc Js').game)
    expect(illegalKind(inPlay(v)!, card('Qs'), v.rules)).toBe('undercut')
    expect(check(v, play('Qs'))?.body).toBe('You may not play a trump lower than J♠ already in this trick while you hold cards of another suit. If an opponent notices, they can challenge and win 4 balls.')
    expect(reviewed(v, 'Qs')).toContain('You played a trump under a higher trump while holding cards of another suit. Nobody challenged this time, but a challenge would have cost your side 4 balls.')
  })

  test('a low trump on another suit, from a hand that holds that suit, breaks both rules and is named a failure to follow', () => {
    const v = you(four(BOTH).play('Kh Js').game)
    expect(illegalKind(inPlay(v)!, card('Qs'), v.rules)).toBe('follow')
    expect(check(v, play('Qs'))?.body).toMatch(/^Hearts were led and you hold A♥, 10♥ and Q♥, so you must follow suit\./)
    expect(reviewed(v, 'Qs')).toContain('You did not follow hearts when you could have. Nobody challenged this time, but a challenge would have cost your side 4 balls.')
  })

  test('over seeded practice games, every rule the player breaks is the one the engine records first', () => {
    const named = { follow: 0, undercut: 0 }
    for (const players of [2, 4] as const) {
      for (let seed = 1; seed <= 12; seed++) {
        const p = PracticeGame.start(thuneePractice, players, seed, 'You')
        const random = seededRng(seed)
        for (let step = 0; step < 3000 && p.game.phase.kind !== 'gameOver'; step++) {
          if (p.paused()) p.continueTrick()
          else if (p.game.phase.kind === 'roundResult') p.act({ type: 'nextRound' }, null)
          else {
            const view = p.coachView()
            const phase = view.phase
            const can = availableActions(view)
            const cheats = can.play.filter((c) => !hasCard(can.legal, c))
            if (phase.kind === 'playing' && phase.turn === 0 && cheats.length > 0 && random() < 0.6) {
              const chosen = cheats[Math.floor(random() * cheats.length)]
              p.act({ type: 'playCard', card: chosen }, null)
              const record = recorded(p.game, chosen)
              if (record === null) continue
              expect(record.broke.length, JSON.stringify(record)).toBeGreaterThan(0)
              const kind = illegalKind(phase, chosen, view.rules)
              expect(kind).toBe(record.broke[0] === 'renege' ? 'follow' : 'undercut')
              named[kind]++
            } else {
              const advice = thuneePractice.coach.advise(view)
              if (advice) p.act(advice.action, advice.action)
              else p.advance(p.nextIn() ?? 1000, false)
            }
          }
        }
      }
    }
    expect(named.follow).toBeGreaterThan(20)
    expect(named.undercut).toBeGreaterThan(0)
  })
})

/** The engine's record of the player's play of `c` this round, if the round is still in play. */
function recorded(game: Game, c: Card): PlayRecord | null {
  const phase = game.phase
  if (phase.kind !== 'playing' && phase.kind !== 'trickPause') return null
  const plays = [...phase.play.tricks.flatMap((t) => t.plays), ...phase.play.current]
  return plays.find((r) => r.seat === 0 && sameCard(r.card, c)) ?? null
}
