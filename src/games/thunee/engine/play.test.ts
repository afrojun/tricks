import { describe, expect, test } from 'vitest'
import { type SeatInfo, replaceableSeats } from '../../../kit/table'
import { seatsToAct, untimedSeats } from './apply'
import { availableActions } from './available'
import { CLASSIC_APP_OVERRIDES, type RuleOverrides } from './rules'
import { Table, card } from './testing'
import type { Game } from './types'
import { viewFor } from './view'

// Dealer 0: seat 1 is trumper (team 1), seat 2 leads. Teams: 0+2 count, 1+3 trump.
const D1 = ['Jh 9h Ks Qs 10c Qd', 'Js 9s As 10s Kd Qc', 'Jc 9c Ac Kc Ah 10h', 'Jd 9d Ad 10d Kh Qh']
// Seat 1 holds six spades and wins every trick.
const SWEEP = ['10d Kd Qd 10c Kc Qc', 'Js 9s As 10s Ks Qs', '10h Kh Qh Jc 9c Ac', 'Jh 9h Ah Jd 9d Ad']
// Seat 1 can win all six leading spades then the Jack of hearts.
const THUNEE = ['10d Kd Qd 10c Kc Qc', 'Js 9s As 10s Ks Jh', 'Qs 9h Ah Jc 9c Ac', 'Jd 9d Ad 10h Kh Qh']

const start = (overrides: RuleOverrides = {}, hands = D1) =>
  new Table(4, { redealIfNoTrumps: false, ...overrides }).deal(hands).toPlay('spades')

const playOf = (game: Game) => {
  if (game.phase.kind !== 'playing' && game.phase.kind !== 'trickPause') throw new Error(game.phase.kind)
  return game.phase.play
}
const result = (game: Game) => {
  if (game.phase.kind !== 'roundResult' && game.phase.kind !== 'gameOver') throw new Error(game.phase.kind)
  return game.phase.summary
}
const can = (t: Table, seat: number) => availableActions(viewFor(t.game, seat))

// Seat 1 trumps clubs, but the counting team (0 and 2) holds every high card.
const COUNTERS = ['Jh 9h Ah Jc 9c Ac', 'Kc Qc Kd Qd Kh Qh', 'Js 9s As Jd 9d Ad', 'Ks Qs 10d 10h 10s 10c']
const COUNTERS_SWEEP = 'Js Qs Ah Kd  9s Ks 9h Qd  As 10s Jh Kh  Jd 10d Jc Qh  9c Kc 9d 10c  Ac Qc Ad 10h'
/** The first five tricks of SWEEP, all won by seat 1. */
const FIVE = 'Qh Jh Qc Qs  Ks Kh Ad Kc  10s 10h 9d Kd  As Jc Jd 10d  9s 9c 9h 10c'
/** D1 played out legally: team 0 takes one trick worth 44. */
const D1_FULL = 'Jc Qh 10c Qc  9c Kh Qd 10s  Js 10h 10d Qs  9s Ah Ad Ks  As Ac 9d 9h  Kd Kc Jd Jh'

describe('playing a trick', () => {
  test('the player to the trumper’s right leads, and trump is revealed after the first card', () => {
    const t = start()
    expect(t.game.phase).toMatchObject({ kind: 'playing', turn: 2 })
    expect(viewFor(t.game, 0).phase).toMatchObject({ trump: null, trumpRevealed: false })
    expect(viewFor(t.game, 1).phase).toMatchObject({ trump: 'spades' })
    t.play('Jc')
    expect(viewFor(t.game, 0).phase).toMatchObject({ trump: 'spades', trumpRevealed: true })
    expect(t.events).toContainEqual({ type: 'trumpRevealed', suit: 'spades' })
  })

  test('out-of-turn plays and cards not in hand are rejected', () => {
    const t = start()
    expect(t.try(0, { type: 'playCard', card: card('Jh') })).toBe('notYourTurn')
    expect(t.try(2, { type: 'playCard', card: card('Jh') })).toBe('cardNotInHand')
  })

  test('a completed trick pauses, then its winner leads; plays during the pause are rejected', () => {
    const t = start().play('Jc Qh 10c Qc')
    expect(t.game.phase.kind).toBe('trickPause')
    expect(t.events).toContainEqual({ type: 'trickWon', seat: 2, points: 44 })
    const before = t.game
    expect(t.try(2, { type: 'playCard', card: card('9c') })).toBe('wrongPhase')
    expect(t.game).toBe(before)
    t.advance(1999)
    expect(t.game.phase.kind).toBe('trickPause')
    t.advance(1)
    expect(t.game.phase).toMatchObject({ kind: 'playing', turn: 2 })
  })

  test('an illegal play is accepted and recorded, but never shown in a view', () => {
    const t = start().play('Jc Qh Jh') // seat 0 holds the 10 of clubs
    const record = playOf(t.game).current[2]
    expect(record).toMatchObject({ seat: 0, broke: ['renege'] })
    expect(record.handBefore).toHaveLength(6)
    const seen = JSON.stringify(viewFor(t.game, 1))
    expect(seen).not.toContain('broke')
    expect(seen).not.toContain('handBefore')
    expect(can(t, 0).legal).toEqual([])
    t.play('Qc').endPause()
    expect(can(t, 2).play).toHaveLength(5)
  })
})

describe('challenges', () => {
  test('challenging a cheat gives the challenger’s team four balls and ends the round', () => {
    const t = start().play('Jc Qh Jh').do(1, { type: 'challengePlay', seat: 0 })
    expect(result(t.game)).toMatchObject({
      reason: 'challenge',
      winner: 1,
      balls: 4,
      ballsAfter: [0, 4],
      challenge: { challenger: 1, accused: 0, kind: 'play', guilty: true, card: card('Jh') },
    })
  })

  test('challenging an honest player gives the accused’s team four balls', () => {
    const t = start().play('Jc Qh').do(0, { type: 'challengePlay', seat: 3 })
    expect(result(t.game)).toMatchObject({ winner: 1, balls: 4, challenge: { guilty: false, card: card('Qh') } })
  })

  test('a cheat from an earlier trick is still caught later in the round', () => {
    const t = start().play('Jc Qh Jh Qc  9c Kh').do(3, { type: 'challengePlay', seat: 0 })
    expect(result(t.game)).toMatchObject({ winner: 1, challenge: { guilty: true, card: card('Jh') } })
  })

  test('teammates and players who have not played cannot be challenged', () => {
    const t = start().play('Jc')
    expect(can(t, 0).challengePlay).toEqual([])
    expect(can(t, 1).challengePlay).toEqual([2])
    expect(t.try(0, { type: 'challengePlay', seat: 2 })).toBe('notAllowed')
    expect(t.try(1, { type: 'challengePlay', seat: 0 })).toBe('notAllowed')
  })
})

describe('jodhi', () => {
  test('a claim opens for the winning team after a trick and closes when the next card is led', () => {
    const t = start().play('Jc Qh 10c Qc')
    expect(playOf(t.game).jodhiOpenFor).toBe(0)
    expect(can(t, 1).claimJodhi).toEqual([])
    t.do(0, { type: 'claimJodhi', suit: 'spades', withJack: false })
    expect(playOf(t.game).jodhiClaims[0]).toMatchObject({ seat: 0, points: 40, valid: true })
    expect(t.try(0, { type: 'claimJodhi', suit: 'spades', withJack: false })).toBe('notAllowed')
    t.endPause()
    expect(can(t, 2).claimJodhi).toHaveLength(4) // still open before the lead
    t.play('9c')
    expect(t.try(2, { type: 'claimJodhi', suit: 'clubs', withJack: false })).toBe('notAllowed')
  })

  test('values: 40 and 50 in trump, 20 and 30 elsewhere', () => {
    const t = start().play('Jc Qh 10c Qc')
    t.do(0, { type: 'claimJodhi', suit: 'spades', withJack: true })
    t.do(0, { type: 'claimJodhi', suit: 'hearts', withJack: false })
    t.do(2, { type: 'claimJodhi', suit: 'clubs', withJack: true })
    expect(playOf(t.game).jodhiClaims.map((j) => j.points)).toEqual([50, 20, 30])
    // Seat 0 holds K+Q of spades but not the Jack; has no K+Q of hearts. Seat 2 holds K+J of clubs, no Queen.
    expect(playOf(t.game).jodhiClaims.map((j) => j.valid)).toEqual([false, false, false])
  })

  /** D1's first trick, won by seat 2 for team 0, with timers off and seat 2 (and any others given) changed. */
  const wonBySeatTwo = (changes: Record<number, Partial<SeatInfo>> = { 2: { standIn: true } }, timers = false) => {
    const t = start()
    t.game = { ...t.game, rules: { ...t.game.rules, timers }, seats: t.game.seats.map((s, i) => ({ ...s, ...changes[i] })) }
    return t.play('Jc Qh 10c Qc')
  }

  test('without timers, a computer’s lead waits with no deadline for its partner to call Jodhi or say no', () => {
    const t = wonBySeatTwo()
    expect(t.game.phase).toMatchObject({ kind: 'trickPause', deadline: null })
    expect(seatsToAct(t.game)).toEqual([0])
    expect(untimedSeats(t.game)).toEqual([0])
    expect(can(t, 0).pass).toBe(true)
    expect(can(t, 1).pass).toBe(false)
    expect(t.try(2, { type: 'pass' })).toBe('notAllowed')
    t.advance(60_000) // the clock alone does not end it
    expect(t.game.phase.kind).toBe('trickPause')
    t.do(0, { type: 'pass' })
    expect(t.game.phase).toMatchObject({ kind: 'playing', turn: 2 })
  })

  test('calling a Jodhi answers the wait', () => {
    const t = wonBySeatTwo()
    t.do(0, { type: 'claimJodhi', suit: 'spades', withJack: false })
    expect(t.game.phase).toMatchObject({ kind: 'playing', turn: 2 })
    expect(playOf(t.game).jodhiClaims).toMatchObject([{ seat: 0, suit: 'spades' }])
  })

  test('no wait with timers on, for a person leading, or for a computer partner', () => {
    const timed = (t: Table) => t.game.phase.kind === 'trickPause' && typeof t.game.phase.deadline === 'number'
    expect(timed(wonBySeatTwo({ 2: { standIn: true } }, true))).toBe(true)
    expect(timed(wonBySeatTwo({}))).toBe(true)
    expect(timed(wonBySeatTwo({ 0: { kind: 'ai' }, 2: { kind: 'ai' } }))).toBe(true)
    expect(seatsToAct(wonBySeatTwo({}).game)).toEqual([])
  })

  test('traditional timing: only the team’s first and third tricks open a claim', () => {
    const t = start().play('Jc Qh 10c Qc  9c Kh Qd 10s') // team 1's first trick
    expect(playOf(t.game).jodhiOpenFor).toBe(1)
    t.play('Js 10h 10d Qs') // second
    expect(playOf(t.game).jodhiOpenFor).toBeNull()
    t.play('9s Ah Ad Ks') // third
    expect(playOf(t.game).jodhiOpenFor).toBe(1)
  })

  test('any-trick timing opens a claim after every trick won', () => {
    const t = start({ jodhiTiming: 'anyTrick' }).play('Jc Qh 10c Qc  9c Kh Qd 10s  Js 10h 10d Qs')
    expect(playOf(t.game).jodhiOpenFor).toBe(1)
  })

  test('in-hand claims need the cards still in hand; dealt claims count cards already played', () => {
    // Seat 3 was dealt K+Q of hearts but has played both by the time team 1 wins a trick.
    const claim = (overrides: RuleOverrides) =>
      start(overrides).play('Jc Qh 10c Qc  9c Kh Qd 10s').do(3, { type: 'claimJodhi', suit: 'hearts', withJack: false })
    expect(playOf(claim({ jodhiCards: 'inHand' }).game).jodhiClaims[0].valid).toBe(false)
    expect(playOf(claim({ jodhiCards: 'dealt' }).game).jodhiClaims[0].valid).toBe(true)
  })

  test('challenging a false claim wins four balls; challenging a true one loses them', () => {
    const lie = start().play('Jc Qh 10c Qc').do(2, { type: 'claimJodhi', suit: 'clubs', withJack: true })
    lie.do(1, { type: 'challengeJodhi', claim: 0 })
    expect(result(lie.game)).toMatchObject({ winner: 1, balls: 4, challenge: { kind: 'jodhi', guilty: true, suit: 'clubs' } })

    const truth = start().play('Jc Qh 10c Qc').do(0, { type: 'claimJodhi', suit: 'spades', withJack: false })
    expect(truth.try(2, { type: 'challengeJodhi', claim: 0 })).toBe('notAllowed') // teammate
    truth.do(3, { type: 'challengeJodhi', claim: 0 })
    expect(result(truth.game)).toMatchObject({ winner: 0, balls: 4, challenge: { guilty: false } })
  })
})

describe('normal scoring', () => {
  test('traditional: losing the last trick costs the counting team ten', () => {
    const t = start().play(D1_FULL).endPause()
    const summary = result(t.game)
    expect(summary).toMatchObject({ reason: 'normal', winner: 1, balls: 1, cardPoints: [44, 260], tricksWon: [1, 5] })
    expect(summary.normal).toEqual({
      countingTeam: 0,
      target: 105,
      total: 34,
      lines: [
        { label: 'cards', value: 44 },
        { label: 'lastTrick', value: -10 },
        { label: 'call', value: 0 },
        { label: 'jodhi', value: 0 },
        { label: 'opponentJodhi', value: -0 },
      ],
    })
    expect(t.events).toContainEqual({ type: 'roundScored', summary })
  })

  test('bonus setting: losing the last trick costs nothing', () => {
    const t = start({ lastTrick: 'bonus' }).play(D1_FULL).endPause()
    expect(result(t.game).normal).toMatchObject({ total: 44 })
  })

  test('the call and Jodhi claims move points to and from the counting team', () => {
    const t = new Table(4, { redealIfNoTrumps: false }).deal(D1)
    t.do(2, { type: 'call', amount: 10 }).do(1, { type: 'call', amount: 30 }).advance(10_000)
    t.do(1, { type: 'chooseTrump', choice: 'spades' }).advance(5000)
    t.play('Jc Qh 10c Qc').do(0, { type: 'claimJodhi', suit: 'spades', withJack: false })
    t.play('9c Kh Qd 10s').do(3, { type: 'claimJodhi', suit: 'hearts', withJack: false })
    t.play('Js 10h 10d Qs  9s Ah Ad Ks  As Ac 9d 9h  Kd Kc Jd Jh').endPause()
    // 44 cards − 10 last trick + 30 call + 40 own Jodhi − 20 opposing Jodhi = 84
    expect(result(t.game)).toMatchObject({ winner: 1, balls: 1, callAmount: 30, normal: { total: 84 } })
  })

  test('the counting team wins one ball without a call and two when a call was made', () => {
    const noCall = new Table(4, { redealIfNoTrumps: false }).deal(COUNTERS).toPlay('clubs').play(COUNTERS_SWEEP).endPause()
    expect(result(noCall.game)).toMatchObject({ winner: 0, balls: 1, tricksWon: [6, 0], normal: { countingTeam: 0, total: 314 } })

    const called = new Table(4, { redealIfNoTrumps: false }).deal(COUNTERS)
    called.do(0, { type: 'call', amount: 10 }).do(1, { type: 'call', amount: 20 }).advance(10_000)
    called.do(1, { type: 'chooseTrump', choice: 'clubs' }).advance(5000).play(COUNTERS_SWEEP).endPause()
    expect(result(called.game)).toMatchObject({ winner: 0, balls: 2, callAmount: 20 })
  })

  test('card points across both teams always total 304', () => {
    const summary = result(start().play(D1_FULL).endPause().game)
    expect(summary.cardPoints[0] + summary.cardPoints[1]).toBe(304)
  })
})

describe('double', () => {
  test('available only on your turn in the sixth trick after your team won the first five', () => {
    const t = start({}, SWEEP).play('Qh Jh Qc Qs')
    t.endPause()
    expect(can(t, 1).callDouble).toBe(false)
    const five = start({}, SWEEP).play(FIVE).endPause()
    expect(can(five, 1).callDouble).toBe(true)
    expect(can(five, 3).callDouble).toBe(false) // not seat 3's turn yet
    expect(five.try(3, { type: 'callDouble' })).toBe('notAllowed')
  })

  test('succeeds for two balls when the caller wins the last trick', () => {
    const t = start({}, SWEEP).play(FIVE).endPause().do(1, { type: 'callDouble' }).play('Js Ac Ah Qd').endPause()
    expect(result(t.game)).toMatchObject({ reason: 'double', winner: 1, balls: 2, double: { caller: 1, success: true } })
  })

  test('fails for four balls to the opponents when the caller does not win the last trick', () => {
    const t = start({}, SWEEP).play(FIVE).play('Js Ac').do(3, { type: 'callDouble' }).play('Ah Qd').endPause()
    expect(result(t.game)).toMatchObject({ reason: 'double', winner: 0, balls: 4, double: { caller: 3, success: false } })
  })

  test('refused on corner house and when the setting is off', () => {
    const corner = start({}, SWEEP)
    corner.game = { ...corner.game, balls: [0, 11] }
    expect(can(corner.play(FIVE).endPause(), 1).callDouble).toBe(false)
    expect(can(start({ double: false }, SWEEP).play(FIVE).endPause(), 1).callDouble).toBe(false)
  })
})

describe('khanaak', () => {
  const withJodhi = (overrides: RuleOverrides = {}) =>
    start(overrides, SWEEP).play('Qh Jh Qc Qs').do(1, { type: 'claimJodhi', suit: 'spades', withJack: true })

  test('needs a Jodhi claim by the caller’s team', () => {
    expect(can(start({}, SWEEP).play(FIVE).endPause(), 1).callKhanaak).toBe(false)
    const t = withJodhi().play('Ks Kh Ad Kc  10s 10h 9d Kd  As Jc Jd 10d  9s 9c 9h 10c').endPause()
    expect(can(t, 1).callKhanaak).toBe(true)
  })

  const callIt = (overrides: RuleOverrides) =>
    withJodhi(overrides)
      .play('Ks Kh Ad Kc  10s 10h 9d Kd  As Jc Jd 10d  9s 9c 9h 10c')
      .endPause()
      .do(1, { type: 'callKhanaak' })
      .play('Js Ac Ah Qd')
      .endPause()

  test('strict: lost when the calling team won every trick', () => {
    const t = callIt({})
    expect(result(t.game)).toMatchObject({ reason: 'khanaak', winner: 0, balls: 4, khanaak: { success: false, jodhi: 50 } })
  })

  test('simple: succeeds for three balls when the opponents’ cards are worth less than Jodhi plus ten', () => {
    const t = callIt({ khanaak: 'simple' })
    expect(result(t.game)).toMatchObject({ winner: 1, balls: 3, khanaak: { success: true, backward: false, opponentPoints: 0 } })
  })

  test('a Khanaak call raises the target to 13 only under that setting', () => {
    expect(viewFor(callIt({ khanaak: 'simple', khanaakRaisesTarget: true }).game, 0).ballsTarget).toBe(13)
    expect(viewFor(callIt({ khanaak: 'simple' }).game, 0).ballsTarget).toBe(12)
  })

  test('strict: a backward Khanaak by the counting team succeeds for six balls', () => {
    const t = new Table(4, { redealIfNoTrumps: false }).deal(COUNTERS).toPlay('clubs')
    t.play('Js Qs Ah Kd').do(0, { type: 'claimJodhi', suit: 'clubs', withJack: true }) // a bluff worth 50
    t.play('As 10s 9h Qc') // seat 1 trumps: team 1's only trick, worth 43
    t.play('Kc 9s 10c Jc  9c Qd 9d 10d  Ac Kh Ad 10h').endPause()
    t.do(0, { type: 'callKhanaak' }).play('Jh Qh Jd Ks').endPause()
    expect(result(t.game)).toMatchObject({
      reason: 'khanaak',
      winner: 0,
      balls: 6,
      khanaak: { caller: 0, success: true, backward: true, jodhi: 50, opponentPoints: 43 },
    })
  })

  test('strict: lost when the caller does not win the last trick', () => {
    const t = new Table(4, { redealIfNoTrumps: false }).deal(COUNTERS).toPlay('clubs')
    t.play('Js Qs Ah Kd').do(0, { type: 'claimJodhi', suit: 'clubs', withJack: true })
    t.play('As 10s 9h Qc  Kc 9s 10c Jc  9c Qd 9d 10d  Ac Kh Ad 10h').endPause()
    // Seat 0 leads the Jack of hearts; seat 2 calls on its own turn but seat 0's Jack wins the trick.
    t.play('Jh Qh').do(2, { type: 'callKhanaak' }).play('Jd Ks').endPause()
    expect(result(t.game)).toMatchObject({ winner: 1, balls: 4, khanaak: { caller: 2, success: false } })
  })
})

describe('thunee', () => {
  const callThunee = (overrides: RuleOverrides = {}, hands = THUNEE) => {
    const t = new Table(4, { redealIfNoTrumps: false, ...overrides }).deal(hands).advance(10_000)
    return t.do(1, { type: 'chooseTrump', choice: 'spades' }).do(1, { type: 'callThunee' })
  }
  const SIX = 'Js Qs Jd 10d  9s 9h 9d Kd  As Ah Ad Qd  10s Jc 10h 10c  Ks 9c Kh Kc  Jh Ac Qh Qc'

  test('traditional: the caller leads and their first card sets trump', () => {
    const t = callThunee()
    expect(t.game.phase).toMatchObject({ kind: 'playing', turn: 1, play: { trump: null } })
    t.play('Js')
    expect(playOf(t.game)).toMatchObject({ trump: 'spades', trumpRevealed: true })
  })

  test('winning all six tricks earns four balls', () => {
    const t = callThunee().play(SIX).endPause()
    expect(result(t.game)).toMatchObject({ reason: 'thunee', winner: 1, balls: 4, thunee: { caller: 1, success: true } })
  })

  test('losing a trick to an opponent ends the round at once for four balls', () => {
    // Seat 1 leads the 9 of hearts and seat 2 beats it with the Jack.
    const hands = ['Jd 9d Ad 10d Kd Qd', 'Js 9s As 10s Ks 9h', 'Jh Ah 10h Kh Qh Qs', 'Jc 9c Ac 10c Kc Qc']
    const t = callThunee({}, hands).play('9h Jh Jc Jd').endPause()
    expect(result(t.game)).toMatchObject({ winner: 0, balls: 4, thunee: { success: false, partnerCatch: false }, tricksWon: [1, 0] })
  })

  test('traditional: a partner winning a trick is a catch worth eight balls', () => {
    // Seat 1 leads the King of diamonds, making diamonds trump; partner seat 3 holds the Jack.
    const t = callThunee({}, D1).play('Kd 10h Jd Qd').endPause()
    expect(result(t.game)).toMatchObject({ winner: 0, balls: 8, thunee: { success: false, partnerCatch: true } })
  })

  test('team setting: a partner winning a trick keeps the Thunee alive', () => {
    const t = callThunee({ thuneeWinner: 'team' }, D1).play('Kd 10h Jd Qd').endPause()
    expect(t.game.phase).toMatchObject({ kind: 'playing', turn: 3 })
  })

  test('no Jodhi, Double or Khanaak under Thunee', () => {
    const t = callThunee().play('Js Qs Jd 10d')
    expect(can(t, 1).claimJodhi).toEqual([])
    t.play('9s 9h 9d Kd  As Ah Ad Qd  10s Jc 10h 10c  Ks 9c Kh Kc').endPause()
    expect(can(t, 1)).toMatchObject({ callDouble: false, callKhanaak: false })
  })
})

describe('between rounds', () => {
  test('old bug: Thunee in round 2 is judged on round 2 only', () => {
    const t = start().play(D1_FULL).endPause() // team 0 won a trick in round 1
    expect(result(t.game).tricksWon).toEqual([1, 5])
    t.deal(THUNEE, t.game.dealer)
    const trumper = (t.game.dealer + 1) % 4
    t.advance(10_000)
    // Whoever trumps, seat 1 calls Thunee and leads.
    t.do(trumper, { type: 'chooseTrump', choice: 'lastCard' }).do(1, { type: 'callThunee' })
    t.play('Js Qs Jd 10d  9s 9h 9d Kd  As Ah Ad Qd  10s Jc 10h 10c  Ks 9c Kh Kc  Jh Ac Qh Qc').endPause()
    expect(result(t.game)).toMatchObject({ reason: 'thunee', thunee: { caller: 1, success: true }, tricksWon: [0, 6] })
  })

  test('old bug: nothing carries over into the next round', () => {
    const t = start().play('Jc Qh 10c Qc').do(0, { type: 'claimJodhi', suit: 'spades', withJack: false })
    t.play(D1_FULL.split('  ').slice(1).join(' ')).endPause().do(0, { type: 'nextRound' })
    expect(t.game.roundNumber).toBe(2)
    expect(t.game.phase).toMatchObject({ kind: 'calling', call: null, passed: [], preselect: null })
    expect(JSON.stringify(t.game.phase)).not.toContain('jodhi')
  })

  test('old bug: the announced winner is the team that reached the target', () => {
    for (const overrides of [{}, CLASSIC_APP_OVERRIDES]) {
      const t = start(overrides)
      t.game = { ...t.game, balls: [3, 11] }
      t.play(D1_FULL).endPause()
      expect(t.game.phase).toMatchObject({ kind: 'gameOver', winner: 1 })
      expect(t.game.balls).toEqual([3, 12])
      expect(t.events).toContainEqual({ type: 'gameOver', winner: 1 })
    }
  })

  test('traditional: the dealer keeps the deal while their team is behind', () => {
    const t = start().play(D1_FULL).endPause() // dealer 0's team loses: 0-1
    expect(t.game.dealer).toBe(0)
    const ahead = start()
    ahead.game = { ...ahead.game, balls: [2, 0] }
    expect(ahead.play(D1_FULL).endPause().game.dealer).toBe(1)
  })

  test('always setting: the deal passes to the right every round', () => {
    expect(start({ dealerRotation: 'always' }).play(D1_FULL).endPause().game.dealer).toBe(1)
  })

  test('only seated humans advance the round; only the host starts a rematch', () => {
    const t = start().play(D1_FULL).endPause()
    expect(t.try(null, { type: 'nextRound' })).toBe('notSeated')
    expect(t.try(2, { type: 'rematch' })).toBe('wrongPhase')
    const over = start()
    over.game = { ...over.game, balls: [0, 11], khanaakCalled: true }
    over.play(D1_FULL).endPause()
    expect(over.try(1, { type: 'rematch' })).toBe('notHost')
    over.do(0, { type: 'rematch' })
    expect(over.game).toMatchObject({ balls: [0, 0], roundNumber: 1, khanaakCalled: false, lastRoundWinner: null })
    expect(over.game.phase.kind).toBe('calling')
  })
})

describe('who the table waits on', () => {
  test('the trumper choosing trump and the seat to play, from when the wait began; nobody while a clock runs', () => {
    const t = new Table(4, { redealIfNoTrumps: false }).deal(D1)
    expect(t.game.waiting).toEqual([]) // calling has a deadline
    t.advance(10_000)
    expect(t.game.waiting).toEqual([{ seat: 1, since: t.now }])
    t.do(1, { type: 'chooseTrump', choice: 'spades' })
    expect(t.game.waiting).toEqual([]) // the Thunee window has a deadline
    t.advance(5000)
    const began = t.now
    expect(t.game.waiting).toEqual([{ seat: 2, since: began }])
    expect(viewFor(t.game, 0).waiting).toEqual([{ seat: 2, since: began }])
    t.now += 1000
    t.play('Jc')
    expect(t.game.waiting).toEqual([{ seat: 3, since: began + 1000 }])
    t.play('Qh 10c Qc')
    expect(t.game.waiting).toEqual([]) // the trick pause has a deadline
  })

  test('a seat still to play keeps its wait when something else happens', () => {
    const t = start().play('Jc Qh 10c Qc').endPause() // seat 2 won and leads
    const began = t.now
    t.now += 30_000
    t.do(0, { type: 'claimJodhi', suit: 'spades', withJack: false })
    expect(t.game.waiting).toEqual([{ seat: 2, since: began }])
  })
})

describe('stalled seats', () => {
  test('the host may hand over a disconnected seat, and the player reclaims it', () => {
    const t = start()
    expect(t.try(0, { type: 'replaceWithAi', seat: 2 })).toBe('notAllowed')
    t.do('system', { type: 'setConnected', seat: 2, connected: false })
    expect(t.try(1, { type: 'replaceWithAi', seat: 2 })).toBe('notHost')
    t.do(0, { type: 'replaceWithAi', seat: 2 })
    expect(t.game.seats[2].standIn).toBe(true)
    expect(t.game.aiActAt).not.toBeNull() // seat 2 is to lead
    t.do(2, { type: 'reclaimSeat' })
    expect(t.game.seats[2].standIn).toBe(false)
    expect(t.game.aiActAt).toBeNull()
  })

  test('a connected player can be replaced only after holding the turn for a minute', () => {
    const t = start() // seat 2 to lead
    t.now += 60_000
    expect(t.try(0, { type: 'replaceWithAi', seat: 2 })).toBe('notAllowed')
    t.now += 1
    expect(t.try(0, { type: 'replaceWithAi', seat: 3 })).toBe('notAllowed') // not the seat being waited on
    t.do(0, { type: 'replaceWithAi', seat: 2 })
    expect(t.game.seats[2].standIn).toBe(true)
  })
})

describe('review fixes', () => {
  test('no Jodhi claim opens after the sixth trick, even with any-trick timing', () => {
    const t = start({ jodhiTiming: 'anyTrick', jodhiCards: 'dealt' }).play(D1_FULL)
    expect(t.game.phase.kind).toBe('trickPause')
    expect(playOf(t.game).jodhiOpenFor).toBeNull()
    expect(t.try(3, { type: 'claimJodhi', suit: 'hearts', withJack: false })).toBe('notAllowed')
  })

  test('first-card trump makes the Thunee caller lead, whatever the leader setting', () => {
    const t = new Table(4, { redealIfNoTrumps: false, thuneeLeader: 'afterCaller' }).deal(D1).advance(10_000)
    t.do(1, { type: 'chooseTrump', choice: 'spades' }).do(1, { type: 'callThunee' })
    expect(t.game.phase).toMatchObject({ kind: 'playing', turn: 1 })
  })

  test('the host role returns to its owner when they reconnect', () => {
    const t = start()
    t.do('system', { type: 'setConnected', seat: 0, connected: false })
    expect(viewFor(t.game, 1).host).toBe(1)
    t.do('system', { type: 'setConnected', seat: 0, connected: true })
    expect(viewFor(t.game, 1).host).toBe(0)
  })

  test('anyone seated may hand a stalled host seat to the computer', () => {
    const t = start() // dealer 0, seat 2 leads
    t.play('Jc Qh') // now seat 0, the host, is to play
    expect(t.game.phase).toMatchObject({ kind: 'playing', turn: 0 })
    t.now += 60_001
    expect(replaceableSeats(viewFor(t.game, 3), t.now)).toEqual([0])
    expect(t.try(3, { type: 'replaceWithAi', seat: 2 })).toBe('notHost')
    t.do(3, { type: 'replaceWithAi', seat: 0 })
    expect(t.game.seats[0].standIn).toBe(true)
  })
})

describe('what a view remembers', () => {
  const afterThree = () => start().play('Jc Qh 10c Qc  9c Kh Qd 10s  Js 10h 10d Qs')

  test('a player’s view carries the cards of the last trick only, and who won the earlier ones', () => {
    const t = afterThree()
    const phase = viewFor(t.game, 0).phase
    if (phase.kind !== 'trickPause') throw new Error(phase.kind)
    expect(phase.tricks.map((trick) => trick.winner)).toEqual([2, 1, 1])
    expect(phase.tricks.map((trick) => trick.plays.length)).toEqual([0, 0, 4])
    expect(JSON.stringify(viewFor(t.game, null))).not.toContain('"rank":"J","suit":"clubs"') // trick 1's lead
  })

  test('full memory, used only for computer players on the server, keeps every trick', () => {
    const phase = viewFor(afterThree().game, 0, 'full').phase
    if (phase.kind !== 'trickPause') throw new Error(phase.kind)
    expect(phase.tricks.map((trick) => trick.plays.length)).toEqual([4, 4, 4])
  })

  test('what a player may do is the same with either memory', () => {
    const t = afterThree().endPause().play('9s')
    for (const seat of [0, 1, 2, 3]) {
      expect(availableActions(viewFor(t.game, seat))).toEqual(availableActions(viewFor(t.game, seat, 'full')))
    }
    expect(can(t, 0).challengePlay).toEqual([1, 3])
  })
})

// Seat 1 trumps the first trick and then claims a diamond Jodhi it cannot have.
const claimed = () => {
  const t = new Table(4, { redealIfNoTrumps: false }).deal(D1).toPlay('spades').play('Ah Qh 9h 10s')
  return t.do(1, { type: 'claimJodhi', suit: 'diamonds', withJack: false })
}

describe('saved state for computer players', () => {
  test('every deal draws a salt that no view carries', () => {
    const a = new Table(4, {}, 1).do(0, { type: 'start' }).game
    const b = new Table(4, {}, 2).do(0, { type: 'start' }).game
    expect(Number.isInteger(a.aiSalt)).toBe(true)
    expect(a.aiSalt).not.toBe(b.aiSalt)
    for (const seat of [0, 1, null]) expect(JSON.stringify(viewFor(a, seat))).not.toContain('aiSalt')
  })

  test('a Jodhi claim records how many tricks had been played, and views show it', () => {
    const t = claimed()
    const phase = viewFor(t.game, 0).phase
    if (phase.kind !== 'trickPause') throw new Error(phase.kind)
    expect(phase.jodhiClaims[0]).toMatchObject({ seat: 1, suit: 'diamonds', trick: 1 })
  })
})
