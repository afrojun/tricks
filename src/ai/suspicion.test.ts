import { describe, expect, test } from 'vitest'
import { chanceOfVoid, noticeOdds } from '../kit/integrity'
import { type Persona, viewFor } from '../engine'
import { Table, cards } from '../engine/testing'
import { mood } from './read'
import { VOID_DOUBT, chooseChallenge, findProofs, findSignals } from './suspicion'

// Dealer 0: seat 1 is trumper (spades), seat 2 leads. Teams: 0+2 count, 1+3 trump.
// Seat 1 holds one club (Qc); seat 0 holds Qd.
const D1 = ['Jh 9h Ks Qs 10c Qd', 'Js 9s As 10s Kd Qc', 'Jc 9c Ac Kc Ah 10h', 'Jd 9d Ad 10d Kh Qh']
const start = (hands = D1, players: 2 | 4 = 4) => new Table(players, { redealIfNoTrumps: false }).deal(hands).toPlay('spades')

/** Seat 1 trumps a 45-point club trick it should have followed, then leads its club at once. */
const clumsy = () => start().play('Kc Qh 10c Js').endPause().play('Qc')
/** Seat 1 discards on a cheap club trick it loses, then holds its club until trick 6. */
const patient = () => start().play('Kc Qh 10c Kd  Qd 10s 10h Jd  As Ah Kh Qs  9s Ac 10d Ks  Js 9c Ad Jh  Qc')
/** Seat 1 trumps the first trick, then claims a diamond Jodhi; seat 0 holds the Qd. */
const falseJodhi = () => start().play('Ah Qh 9h 10s').do(1, { type: 'claimJodhi', suit: 'diamonds', withJack: false })

const rate = (t: Table, seat: number, persona: Persona, salts = 2000) => {
  let caught = 0
  for (let salt = 1; salt <= salts; salt++) if (chooseChallenge(viewFor(t.game, seat, 'full'), { persona, salt })) caught++
  return caught / salts
}

describe('proofs', () => {
  test('a renege shown up on the next trick, after winning a big trick the observer led, is certain to be noticed', () => {
    const view = viewFor(clumsy().game, 2, 'full')
    const proofs = findProofs(view)
    expect(proofs).toHaveLength(1)
    expect(proofs[0]).toMatchObject({ id: 'renege:1:0:1', accused: 1, claim: null, gap: 0 })
    expect(proofs[0].salience).toBeCloseTo(1.3 * 1.3 * 1.2)
    for (let salt = 1; salt <= 50; salt++) {
      expect(chooseChallenge(view, { persona: 'straight', salt })).toEqual({ type: 'challengePlay', seat: 1 })
    }
  })

  test('a renege held back until trick 6 is usually missed, even by Sharp', () => {
    const t = patient()
    const proofs = findProofs(viewFor(t.game, 2, 'full'))
    expect(proofs).toHaveLength(1)
    expect(proofs[0]).toMatchObject({ id: 'renege:1:0:5', accused: 1, gap: 4 })
    expect(proofs[0].salience).toBeCloseTo(1.2)
    expect(noticeOdds(0.95, 4, 1.2)).toBeCloseTo(0.285)
    // No hunch adds to this: seat 1 has two signals (cut:1, void:1:1) and seat 3 one, short of Sharp's three,
    // and Straight has no hunches.
    const sharp = rate(t, 2, 'sharp')
    expect(sharp).toBeGreaterThan(0.24)
    expect(sharp).toBeLessThan(0.33)
    const straight = rate(t, 2, 'straight')
    expect(straight).toBeGreaterThan(0.14)
    expect(straight).toBeLessThan(0.22)
  })

  test('partners are never accused, and a fair round holds no proof', () => {
    expect(findProofs(viewFor(clumsy().game, 3, 'full'))).toEqual([])
    const fair = start().play('Jc Qh 10c Qc  9c Kh Qd 10s')
    for (const seat of [0, 1, 2, 3]) expect(findProofs(viewFor(fair.game, seat, 'full'))).toEqual([])
  })

  test('a Jodhi disproved by the observer’s own hand stands out; an observer without the card sees nothing', () => {
    const t = falseJodhi()
    const proofs = findProofs(viewFor(t.game, 0, 'full'))
    expect(proofs).toEqual([{ id: 'jodhi:0:Q-diamonds', accused: 1, rule: null, claim: 0, gap: 0, salience: 1.5 }])
    expect(findProofs(viewFor(t.game, 2, 'full'))).toEqual([])
    for (let salt = 1; salt <= 50; salt++) {
      expect(chooseChallenge(viewFor(t.game, 0, 'full'), { persona: 'sharp', salt })).toEqual({ type: 'challengeJodhi', claim: 0 })
    }
    const straight = rate(t, 0, 'straight')
    expect(straight).toBeGreaterThan(0.85)
    expect(straight).toBeLessThan(0.95)
  })

  test('an undercut is proved when the player later shows a plain card, only under the undercut rule', () => {
    // Seat 2 leads a diamond; seat 0 trumps with Ks; seat 1 undercuts with Qs while holding clubs,
    // then follows seat 0's heart lead with Jc.
    const UNDERCUT = ['Ks Jh 9h Ah 10h Kh', 'Qs Js Jc 9c Ac 10s', 'Jd 9d Ad 10d Kd Qd', 'Qh Kc Qc 10c 9s As']
    const moves = (t: Table) => t.deal(UNDERCUT).toPlay('spades').play('Jd Qh Ks Qs').endPause().play('Jh Jc')
    const proofs = findProofs(viewFor(moves(new Table(4, { redealIfNoTrumps: false })).game, 2, 'full'))
    expect(proofs).toHaveLength(1)
    expect(proofs[0]).toMatchObject({ id: 'undercut:1:0:1', accused: 1, gap: 0 })
    expect(proofs[0].salience).toBeCloseTo(1.3 * 1.2 * 1.2)
    const free = moves(new Table(4, { redealIfNoTrumps: false, undercutRestriction: false }))
    expect(findProofs(viewFor(free.game, 2, 'full'))).toEqual([])
  })

  test('a void shown in one half proves nothing about a card played in the next', () => {
    const view = viewFor(clumsy().game, 2, 'full')
    const phase = view.phase
    if (phase.kind !== 'playing') throw new Error(phase.kind)
    // The same cards, but the reveal now falls in a later half with a fresh hand
    // (history() labels the current trick with phase.half; the cheat trick keeps half 1).
    expect(findProofs({ ...view, phase: { ...phase, half: 2 } })).toEqual([])
  })

  const claimsOf = (t: Table) => {
    const phase = t.game.phase
    if (phase.kind !== 'playing' && phase.kind !== 'trickPause') throw new Error(phase.kind)
    return phase.play.jodhiClaims
  }

  test('a Jodhi card another seat plays after the claim proves it false, with the tricks in between as the gap', () => {
    // Seat 1 trumps trick 1 (no hearts) and claims clubs; Qc is its own but Kc is seat 2's, played in trick 3.
    const t = start()
      .play('10h Qh 9h Js')
      .do(1, { type: 'claimJodhi', suit: 'clubs', withJack: false })
      .play('As 9c Jd Ks  10s Kc Ad Qs')
    expect(claimsOf(t).map((c) => c.valid)).toEqual([false])
    expect(findProofs(viewFor(t.game, 0, 'full'))).toEqual([{ id: 'jodhi:0:K-clubs', accused: 1, rule: null, claim: 0, gap: 1, salience: 1 }])
  })

  test('a Jodhi card the claimant played before claiming proves it false only when Jodhis need cards in hand', () => {
    // Seat 1 holds Ks Qs, trumps trick 1 with Qs and claims spades.
    const HANDS = ['Jh 9h Js 9s 10c Qd', 'Ks Qs As 10s Kd Qc', 'Jc 9c Ac Kc Ah 10h', 'Jd 9d Ad 10d Kh Qh']
    const run = (jodhiCards: 'inHand' | 'dealt') =>
      new Table(4, { redealIfNoTrumps: false, jodhiCards }).deal(HANDS).toPlay('spades').play('10h Qh 9h Qs').do(1, { type: 'claimJodhi', suit: 'spades', withJack: false })
    const inHand = run('inHand')
    expect(claimsOf(inHand).map((c) => c.valid)).toEqual([false])
    expect(findProofs(viewFor(inHand.game, 0, 'full'))).toEqual([{ id: 'jodhi:0:Q-spades', accused: 1, rule: null, claim: 0, gap: 0, salience: 1 }])
    const dealt = run('dealt')
    expect(claimsOf(dealt).map((c) => c.valid)).toEqual([true])
    expect(findProofs(viewFor(dealt.game, 0, 'full'))).toEqual([])
  })

  describe('two players, dealt Jodhis', () => {
    // Half 1 is played out; half 2 deals seat 0 Ad 10d Jc 9c Ac Kc and seat 1 Ah 10h Kh Qh Jd 9d, seat 0 to lead.
    const HANDS = ['Jh 9h Ks Qs 10c Qd', 'Js 9s As 10s Kd Qc']
    const half1 = (jodhiCards: 'inHand' | 'dealt') =>
      new Table(2, { redealIfNoTrumps: false, jodhiCards, jodhiTiming: 'anyTrick' })
        .deal(HANDS)
        .toPlay('spades')
        .play('Jh Js  9s Ks  As Qs  10s 9h  Kd Qd  Qc 10c')
        .endPause()

    test('a card the claimant played in the first half contradicts a second-half claim', () => {
      // Seat 0 leads Jc, seat 1 has no clubs and wins nothing; seat 0 wins and claims spades (Ks, Qs went in half 1).
      const t = half1('dealt').play('Jc 9d').do(0, { type: 'claimJodhi', suit: 'spades', withJack: false })
      expect(claimsOf(t).map((c) => c.valid)).toEqual([false])
      const proofs = findProofs(viewFor(t.game, 1, 'full'))
      expect(proofs.map((p) => p.id).sort()).toEqual(['jodhi:0:K-spades', 'jodhi:0:Q-spades'])
      expect(proofs.every((p) => p.accused === 0 && p.claim === 0)).toBe(true)
    })

    test('a card the claimant played earlier in the same half does not contradict a dealt claim', () => {
      // Seat 1 discards Kh on seat 0's club, then wins with Jd and claims hearts: valid when dealt, spent when in hand.
      const play = (jodhiCards: 'inHand' | 'dealt') =>
        half1(jodhiCards).play('Jc Kh').endPause().play('Ad Jd').do(1, { type: 'claimJodhi', suit: 'hearts', withJack: false })
      const dealt = play('dealt')
      expect(claimsOf(dealt).map((c) => c.valid)).toEqual([true])
      expect(findProofs(viewFor(dealt.game, 0, 'full'))).toEqual([])
      const inHand = play('inHand')
      expect(claimsOf(inHand).map((c) => c.valid)).toEqual([false])
      expect(findProofs(viewFor(inHand.game, 0, 'full')).map((p) => p.id)).toEqual(['jodhi:0:K-hearts'])
    })
  })
})

describe('hunches', () => {
  /** Seat 1 legally trumps a 43-point heart trick. */
  const trumped = () => start().play('Ah Qh 9h 10s')

  test('winning a big trick off-suit, a big Jodhi and an unlikely void are signals', () => {
    expect(findSignals(viewFor(trumped().game, 2, 'full'))).toEqual([{ id: 'cut:0', accused: 1, claim: null, at: 0 }])
    // Just after seat 1 trumps trick 1, seat 2 has seen 11 cards: 13 are hidden, 4 of them diamonds (Jd 9d Ad 10d),
    // and seat 1 still hides 4 cards: a real void has chance C(9,4)/C(13,4) = 0.176.
    // Seat 3's spade void in trick 2: 10 hidden, 4 spades (Js 9s Ks Qs), 3 in its hand: C(6,3)/C(10,3) = 0.167.
    const ids = findSignals(viewFor(patient().game, 2, 'full')).map((s) => s.id)
    expect(ids).toEqual(['cut:1', 'void:1:1', 'void:2:3'])
  })

  test('Wild sometimes accuses on one signal, more often when behind; Sharp and Straight do not', () => {
    const t = trumped()
    const wild = rate(t, 2, 'wild')
    // 0.12 chance × mood 1.5 (behind 0–43 on points) = 0.18
    expect(wild).toBeGreaterThan(0.14)
    expect(wild).toBeLessThan(0.22)
    expect(chooseChallengeFor(t, 2, 'wild')).toEqual({ type: 'challengePlay', seat: 1 })
    expect(rate(t, 2, 'sharp')).toBe(0)
    expect(rate(t, 2, 'straight')).toBe(0)
  })
})

describe('hunch details', () => {
  const decisions = (t: Table, seat: number, persona: Persona, salts = 500) =>
    Array.from({ length: salts }, (_, i) => chooseChallenge(viewFor(t.game, seat, 'full'), { persona, salt: i + 1 }) !== null)
  const ids = (t: Table, seat: number) => findSignals(viewFor(t.game, seat, 'full')).map((s) => s.id)

  test('a hunch is judged in the mood of its moment: a later swing of points gives it no second look', () => {
    // Trick 0 goes to seat 2's team (44-0), trick 1 is seat 1 trumping a 44-point heart trick (44-44, mood 1).
    const afterSignal = () => start().play('Jc Qh 10c Qc').endPause().play('Ah Kh 9h 10s')
    const before = afterSignal()
    // Trick 2: seat 3 follows suit and wins 45 points, putting seat 2's team behind with no new signal.
    const after = afterSignal().endPause().play('Kd 10h Jd Qd')
    expect(ids(before, 2)).toEqual(['cut:1'])
    expect(ids(after, 2)).toEqual(['cut:1'])
    expect(mood(viewFor(before.game, 2, 'full'))).toBe(1)
    expect(mood(viewFor(after.game, 2, 'full'))).toBe(1.5)
    const was = decisions(before, 2, 'wild')
    expect(decisions(after, 2, 'wild')).toEqual(was)
    const rate = was.filter(Boolean).length / was.length
    expect(rate).toBeGreaterThan(0.06)
    expect(rate).toBeLessThan(0.18)
  })

  test('an opponent who cannot follow a suit the observer can barely place is a void signal', () => {
    // Seat 2 leads its only diamond; seat 3 shows a void; seat 1 follows. Seat 2 can place two of six diamonds.
    const VOID = ['Qh Jc 9c Ac 10c Kc', 'Js Jd 9d Ad 10d Kd', 'Qd Jh 9h Ah 10h Kh', 'Qc 9s As 10s Ks Qs']
    const t = start(VOID).play('Qd Qc Qh Jd')
    expect(findSignals(viewFor(t.game, 2, 'full'))).toEqual([{ id: 'void:0:3', accused: 3, claim: null, at: -0.25 }])
    // Seat 3 cannot place them either, but only seat 0's void is an opponent's.
    expect(ids(t, 3)).toEqual(['void:0:0'])
  })

  test('a void hunch gets the same one look before and after its trick completes', () => {
    const VOID = ['Qh Jc 9c Ac 10c Kc', 'Js Jd 9d Ad 10d Kd', 'Qd Jh 9h Ah 10h Kh', 'Qc 9s As 10s Ks Qs']
    const during = start(VOID).play('Qd Qc')
    // Seat 1 takes the trick with Jd, putting seat 2's team behind on points.
    const after = start(VOID).play('Qd Qc Qh Jd')
    expect(ids(during, 2)).toEqual(['void:0:3'])
    expect(ids(after, 2)).toEqual(['void:0:3'])
    expect(mood(viewFor(after.game, 2, 'full'))).toBe(1.5)
    const was = decisions(during, 2, 'wild')
    expect(decisions(after, 2, 'wild')).toEqual(was)
    expect(was.some(Boolean)).toBe(true)
  })

  test('an opponent’s Jodhi worth 40 or more is a signal; a partner’s is not', () => {
    // Seat 1 trumps a heart trick and claims the king and queen of trumps.
    const CLAIM = ['Jh 9h As 10s 10c Qd', 'Js 9s Ks Qs Kd Qc', 'Jc 9c Ac Kc Ah 10h', 'Jd 9d Ad 10d Kh Qh']
    const t = start(CLAIM).play('10h Kh 9h Js').do(1, { type: 'claimJodhi', suit: 'spades', withJack: false })
    const claims = (seat: number) => findSignals(viewFor(t.game, seat, 'full')).filter((s) => s.id.startsWith('claim'))
    expect(claims(2)).toEqual([{ id: 'claim:0', accused: 1, claim: 0, at: 0.5 }])
    expect(claims(0)).toHaveLength(1)
    expect(claims(3)).toEqual([])
  })

  test('Sharp acts on a hunch only from a third signal, at about its 0.3 chance', () => {
    // Seat 1 trumps trick 0 (a cut, and a void when seat 2 can place two diamonds), takes a fair trick 1 lost,
    // then trumps a 56-point heart trick: a second cut.
    const SHARP = ['Qh 9h 10h Jc Qc 10s', 'Qs Ks Kc Js 9s As', 'Qd 9c Jh Ah Kh 10c', 'Jd 9d Ad 10d Kd Ac']
    const two = start(SHARP).play('Qd Jd Qh Qs').endPause().play('Kc 9c Ac Qc')
    expect(ids(two, 2)).toEqual(['cut:0', 'void:0:1'])
    expect(decisions(two, 2, 'sharp').some(Boolean)).toBe(false)
    const three = start(SHARP).play('Qd Jd Qh Qs').endPause().play('Kc 9c Ac Qc').endPause().play('Jh Kd 9h Ks')
    expect(ids(three, 2)).toEqual(['cut:0', 'void:0:1', 'cut:2'])
    const fired = decisions(three, 2, 'sharp', 2000).filter(Boolean).length / 2000
    expect(fired).toBeGreaterThan(0.26)
    expect(fired).toBeLessThan(0.34)
  })
})

/** Asserts the deal uses each card once and every play so far obeyed the rules. */
function checkFair(hands: string[], t: Table) {
  const all = hands.flatMap((h) => cards(h).map((c) => `${c.rank}${c.suit}`))
  expect(new Set(all).size).toBe(all.length)
  expect(all).toHaveLength(hands.length * 6)
  const phase = t.game.phase
  if (phase.kind !== 'playing' && phase.kind !== 'trickPause') throw new Error(phase.kind)
  const plays = [...phase.play.tricks.flatMap((x) => x.plays), ...phase.play.current]
  expect(plays.every((p) => p.broke.length === 0)).toBe(true)
}

describe('void odds', () => {
  const two = (hands: string[]) => new Table(2, { redealIfNoTrumps: false }).deal(hands).toPlay('clubs')
  const ids = (t: Table, seat: number) => findSignals(viewFor(t.game, seat, 'full')).map((s) => s.id)

  test('the chance of a real void draws the hidden hand from every card the observer cannot place', () => {
    expect(chanceOfVoid(16, 4, 5)).toBeCloseTo(792 / 4368, 12)
    expect(chanceOfVoid(16, 3, 5)).toBeCloseTo(1287 / 4368, 12)
    expect(chanceOfVoid(17, 4, 5)).toBeCloseTo(1287 / 6188, 12)
    expect(chanceOfVoid(6, 3, 2)).toBeCloseTo(0.2, 12)
    expect(chanceOfVoid(5, 0, 3)).toBe(1)
    expect(chanceOfVoid(3, 3, 1)).toBe(0)
    // A first-trick void with four unseen cards is a signal from any seat; with three it is not.
    expect(chanceOfVoid(17, 4, 5)).toBeLessThan(VOID_DOUBT)
    expect(chanceOfVoid(15, 3, 5)).toBeGreaterThan(VOID_DOUBT)
  })

  test('with four players, a void with three or fewer unseen cards is a signal only at trick 3 with six cards hidden', () => {
    // Every legal position: trick t, the void at play i, the observer at play o. All 24 cards are dealt, so the
    // hidden cards are the other three hands: those that have played this trick hold h, the rest h + 1.
    const hits: string[] = []
    for (let t = 0; t < 6; t++) {
      const h = 5 - t
      for (let i = 1; i < 4; i++) {
        for (let o = 0; o < 4; o++) {
          if (o === i) continue
          const hidden = [0, 1, 2, 3].filter((q) => q !== o).reduce((n, q) => n + (q <= i ? h : h + 1), 0)
          for (let u = 1; u <= Math.min(3, hidden - h); u++) {
            if (chanceOfVoid(hidden, u, h) < VOID_DOUBT) hits.push(`t${t} i${i} o${o} P${hidden} u${u}`)
          }
        }
      }
    }
    expect(hits).toEqual(['t3 i2 o3 P6 u3', 't3 i3 o0 P6 u3', 't3 i3 o1 P6 u3', 't3 i3 o2 P6 u3'])
  })

  test('late in a four-player hand, a void with two unseen cards is no signal', () => {
    // The corner deal below with 10h moved to seat 2: after seat 1 trumps Qh, six cards are hidden from seat 2,
    // two of them hearts (Jh 9h), and seat 1 hides 2: C(4,2)/C(6,2) = 0.4.
    const HANDS = ['Qs Kh 10d Kd Qd 10s', '10c Kc Qc Js 9s As', 'Jc 9c Ac Qh Ks 10h', 'Jh 9h Ah Jd 9d Ad']
    const t = start(HANDS).play('Jc Jd 10d 10c  9c 9d Kd Kc  Ac Ad Qd Qc  Qh Ah Kh 9s')
    checkFair(HANDS, t)
    expect(ids(t, 2)).toEqual(['cut:3'])
  })

  test('the corner: a four-player void with three unseen cards among six hidden is a signal', () => {
    // Seat 2 wins three club tricks, then leads Qh; seats 3 and 0 follow and still hide Jh 9h 10h between them,
    // and seat 1 trumps. Seat 1 hides 2 of the 6 hidden cards: C(3,2)/C(6,2) = 0.2.
    const HANDS = ['10h Kh 10d Kd Qd 10s', '10c Kc Qc Js 9s As', 'Jc 9c Ac Qh Ks Qs', 'Jh 9h Ah Jd 9d Ad']
    const t = start(HANDS).play('Jc Jd 10d 10c  9c 9d Kd Kc  Ac Ad Qd Qc  Qh Ah Kh 9s')
    checkFair(HANDS, t)
    expect(ids(t, 2)).toEqual(['cut:3', 'void:3:1'])
  })

  test('with two players, a void the stock could explain is no signal', () => {
    // Seat 0 leads its only diamond in trick 2; seat 1 trumps. 15 cards are hidden (12 in the stock), 4 of them
    // diamonds, and seat 1 hides 3: C(11,3)/C(15,3) = 0.363. The old count (4 unplaced) flagged it.
    const HANDS = ['Jh 9h Ah 10h Kh Qd', 'Qh Kd Jc 9c Ac 10c']
    const t = two(HANDS).play('Jh Qh  9h Kd  Qd 10c')
    checkFair(HANDS, t)
    expect(ids(t, 0)).toEqual([])
  })

  test('with two players, a first-half void gets the same one look before and after the second half is dealt', () => {
    // Seat 0 leads its only diamond and seat 1 trumps it: 17 hidden, 5 diamonds, 5 in seat 1's hand: 0.128.
    // The second half deals seat 0 the other five diamonds.
    const HANDS = ['Qd Js 9s As 10s Ks', 'Jc 9c Ac 10c Kc Qs']
    const t = two(HANDS).play('Qd Jc')
    while ((t.game.phase.kind === 'playing' || t.game.phase.kind === 'trickPause') && t.game.phase.play.tricks.length < 6) {
      t.endPause().autoPlay('trickPause')
    }
    checkFair(HANDS, t)
    const before = viewFor(t.game, 0, 'full')
    expect(before.phase.kind === 'trickPause' && before.phase.half).toBe(1)
    const decide = () => Array.from({ length: 500 }, (_, i) => chooseChallenge(viewFor(t.game, 0, 'full'), { persona: 'wild', salt: i + 1 }) !== null)
    const was = decide()
    expect(ids(t, 0)).toContain('void:0:1')
    const signalsBefore = ids(t, 0)
    t.endPause()
    const after = viewFor(t.game, 0, 'full')
    if (after.phase.kind !== 'playing') throw new Error(after.phase.kind)
    expect(after.phase.half).toBe(2)
    // The new hand holds diamonds, which a count over the current hand would have taken as placed.
    expect(after.phase.hand.some((c) => c.suit === 'diamonds')).toBe(true)
    expect(ids(t, 0)).toEqual(signalsBefore)
    expect(decide()).toEqual(was)
    expect(was.some(Boolean)).toBe(true)
  })
})

/** The first challenge Wild makes across salts, for checking its shape. */
function chooseChallengeFor(t: Table, seat: number, persona: Persona) {
  for (let salt = 1; salt <= 2000; salt++) {
    const action = chooseChallenge(viewFor(t.game, seat, 'full'), { persona, salt })
    if (action) return action
  }
  return null
}
