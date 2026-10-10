import { describe, expect, test, vi } from 'vitest'
import { type GameEvent, type RoundSummary, type Seat, type View, viewFor } from '../engine'
import { Table, card } from '../engine/testing'
import { WIN_BEAT_MS } from '../../../ui/contract'
import { playSound } from '../../../ui/sound'
import { dwell } from './dwell'
import { BALL_STAGGER_MS, CHALLENGE_BEAT_MS, MAX_WIN_WAIT_MS, VERDICT_BEAT_MS, present, winWait } from './present'
import { ballsWhy, headline } from './RoundResult'

vi.mock('../../../ui/sound', async (original) => ({ ...(await original<object>()), playSound: vi.fn() }))

/** Seat 0 (P0) accused by seat 1, the viewer, over a play or a Jodhi. */
function challenged(challenge: RoundSummary['challenge']): RoundSummary {
  return {
    roundNumber: 1,
    reason: 'challenge',
    winner: 1,
    balls: 4,
    ballsAfter: [0, 4],
    trumper: 0,
    trump: 'hearts',
    callAmount: 0,
    cardPoints: [0, 0],
    tricksWon: [0, 0],
    challenge,
  }
}

const view = viewFor(new Table(4).game, 1)
const verdict = (summary: RoundSummary) => present({ type: 'roundScored', summary }, view, 1).moments?.[0]
const play = { challenger: 1, accused: 0, kind: 'play', card: card('9h') } as const

describe('a verdict says what was done', () => {
  test('a renege did not follow suit', () => {
    const summary = challenged({ ...play, guilty: true, rule: 'renege' })
    expect(verdict(summary)).toMatchObject({ title: 'Caught', detail: 'P0 did not follow suit', tone: 'danger', card: card('9h') })
    expect(headline(view, summary)).toBe('You caught P0 not following suit.')
  })

  test('an undercut is called an undercut', () => {
    const summary = challenged({ ...play, guilty: true, rule: 'undercut' })
    expect(verdict(summary)).toMatchObject({ title: 'Caught', detail: 'P0 undercut a trump' })
    expect(headline(view, summary)).toBe('You caught P0 undercutting a trump.')
  })

  test('a false Jodhi, and a fair play, read as before', () => {
    const jodhi = challenged({ challenger: 1, accused: 0, kind: 'jodhi', guilty: true, suit: 'spades' })
    expect(verdict(jodhi)).toMatchObject({ title: 'Caught', detail: 'P0 called a false Jodhi' })
    expect(headline(view, jodhi)).toBe('You caught P0 calling a false Jodhi.')
    expect(headline(viewFor(new Table(4).game, 0), jodhi, false)).toBe('P1 caught you calling a false Jodhi.')
    const fair = challenged({ ...play, guilty: false })
    expect(verdict(fair)).toMatchObject({ title: 'Fair play', detail: 'P0 followed suit', tone: 'good' })
    expect(headline(view, fair)).toBe('You challenged P0 over playing 9♥, and were wrong.')
    expect(headline(viewFor(new Table(4).game, 2), fair)).toBe('P1 challenged P0 over playing 9♥, and was wrong.')
  })
})

describe('lines every seat sees, and lines to the reader', () => {
  test('dealing again names the side by its role, or says the Thunee cannot be stopped', () => {
    expect(present({ type: 'dealCancelled', thuneeCaller: null }, view, 1).toast).toBe('The counting side holds no trump. Dealing again.')
    expect(present({ type: 'dealCancelled', thuneeCaller: 0 }, view, 1).toast).toBe('Nobody can stop the Thunee. Dealing again.')
  })

  test('the accused reads "you"', () => {
    const challenge = present({ type: 'challengeResolved', challenger: 0, accused: 1, guilty: true }, view, 1).moments?.[0]
    expect(challenge?.detail).toBe('P0 challenges you')
    const caught = present({ type: 'roundScored', summary: challenged({ challenger: 0, accused: 1, kind: 'play', card: card('9h'), guilty: true, rule: 'renege' }) }, view, 1).moments?.[0]
    expect(caught?.detail).toBe('You did not follow suit')
  })
})

describe('a round says why it is worth its balls', () => {
  const normal = (callAmount: number, total: number): RoundSummary => ({
    ...challenged(undefined),
    reason: 'normal',
    winner: total >= 105 ? 1 : 0,
    balls: total >= 105 && callAmount > 0 ? 2 : 1,
    callAmount,
    normal: { countingTeam: 1, lines: [], total, target: 105 },
  })

  test('a call lost is worth 2 balls, and says what it would have been without one', () => {
    expect(ballsWhy(view, normal(20, 113), 8)).toEqual({ line: 'P0 called 20 and lost: 2 balls', aside: '1 ball without a call. The call doubles it.' })
  })

  test('without a call, either side takes 1 ball', () => {
    expect(ballsWhy(view, normal(0, 113), 8).line).toBe('You and P3 reached 113, needing 105: 1 ball')
    expect(ballsWhy(view, normal(20, 90), 8).line).toBe('P0 and P2 held the counting side to 90, short of 105: 1 ball')
  })

  test('a Thunee lost to the partner says what it costs, when that is not the usual 4', () => {
    const caught: RoundSummary = { ...challenged(undefined), reason: 'thunee', winner: 1, balls: 8, thunee: { caller: 0, success: false, partnerCatch: true } }
    expect(ballsWhy(view, caught, 8)).toEqual({
      line: 'P0 called Thunee and their own partner took a trick: 8 balls',
      aside: 'A Thunee lost to the caller’s partner costs 8 balls instead of 4.',
    })
    expect(ballsWhy(view, { ...caught, balls: 4 }, 4).aside).toBeUndefined()
  })

  test('a Thunee made under the team rule credits the side, not the caller alone', () => {
    const made: RoundSummary = { ...challenged(undefined), reason: 'thunee', winner: 0, balls: 4, thunee: { caller: 0, success: true, partnerCatch: false } }
    expect(ballsWhy(view, made, 8).line).toBe('P0 called Thunee and won every trick: 4 balls')
    const team = { ...view, rules: { ...view.rules, thuneeWinner: 'team' as const } }
    expect(ballsWhy(team, made, 8).line).toBe('P0 called Thunee and their side won every trick: 4 balls')
  })
})

/** The sounds one event plays, for a viewer at seat 1 (team 1) unless another seat, or a spectator, is given. */
function heard(event: GameEvent, at: Seat | null = 1, seen: View = view) {
  vi.mocked(playSound).mockClear()
  present(event, seen, at)
  return vi.mocked(playSound).mock.calls
}

describe('each event is heard', () => {
  test('the deal riffles the deck, each half', () => {
    expect(heard({ type: 'dealt', roundNumber: 1, dealer: 0, half: 1 })).toEqual([['deal']])
    expect(heard({ type: 'dealt', roundNumber: 1, dealer: 0, half: 2 })).toEqual([['deal']])
  })

  test('a Jack is slammed down; any other card is put down', () => {
    expect(heard({ type: 'cardPlayed', seat: 0, card: card('Jh') })).toEqual([['slam']])
    expect(heard({ type: 'cardPlayed', seat: 0, card: card('9h') })).toEqual([['card']])
  })

  test("a trick is gathered in loudly by the viewer's side, quietly by the other's and for a spectator", () => {
    expect(heard({ type: 'trickWon', seat: 1, points: 10 })).toEqual([['sweep']])
    expect(heard({ type: 'trickWon', seat: 3, points: 10 })).toEqual([['sweep']])
    expect(heard({ type: 'trickWon', seat: 0, points: 10 })).toEqual([['sweepTheirs']])
    expect(heard({ type: 'trickWon', seat: 1, points: 10 }, null)).toEqual([['sweepTheirs']])
  })

  test('a call for trump knocks once and a pass is silent; Thunee, Double and Khanaak slam the desk; a Jodhi fans the cards', () => {
    expect(heard({ type: 'called', seat: 0, amount: 10 })).toEqual([['call']])
    expect(heard({ type: 'passed', seat: 0 })).toEqual([])
    expect(heard({ type: 'thuneeCalled', seat: 0 })).toEqual([['big']])
    expect(heard({ type: 'doubleCalled', seat: 0 })).toEqual([['big']])
    expect(heard({ type: 'khanaakCalled', seat: 0 })).toEqual([['big']])
    expect(heard({ type: 'jodhiClaimed', seat: 0, withJack: false, points: 20 })).toEqual([['jodhi']])
  })

  test('a challenge knocks, and its verdict sounds as the verdict shows, after the challenge', () => {
    expect(heard({ type: 'challengeResolved', challenger: 1, accused: 0, guilty: true })).toEqual([['challenge']])
    expect(heard({ type: 'roundScored', summary: challenged({ ...play, guilty: true, rule: 'renege' }) })).toEqual([['caught', CHALLENGE_BEAT_MS]])
    expect(heard({ type: 'roundScored', summary: challenged({ ...play, guilty: false }) })).toEqual([['fair', CHALLENGE_BEAT_MS]])
    expect(heard({ type: 'roundScored', summary: challenged(undefined) })).toEqual([])
  })

  test('a won game pushes the pot over and cheers for the side that won, and only pushes the pot for the other and a spectator', () => {
    expect(heard({ type: 'gameOver', winner: 1 })).toEqual([['gameWon', 0]])
    expect(heard({ type: 'gameOver', winner: 0 })).toEqual([['gameLost', 0]])
    expect(heard({ type: 'gameOver', winner: 1 }, null)).toEqual([['gameLost', 0]])
  })
})

describe('the win', () => {
  /** The view as the message carrying game over shows it: the last round scored, 4 balls to team 1. */
  function over(challenge?: RoundSummary['challenge']): View {
    const summary = { ...challenged(challenge), ballsAfter: [7, 12] as [number, number] }
    return { ...view, balls: [7, 12], phase: { kind: 'gameOver', again: [], winner: 1, summary } }
  }

  test('is stamped for the winners in their colour under confetti, named quietly for the losers, and coloured but not showered for a spectator', () => {
    const won = present({ type: 'gameOver', winner: 1 }, over(), 1)
    expect(won.moments).toEqual([{ title: 'You win', detail: '12 balls to 7', tone: 'win', ms: WIN_BEAT_MS, colour: 'var(--team1)' }])
    expect(won.celebrate).toBe('var(--team1)')
    const lost = present({ type: 'gameOver', winner: 1 }, over(), 0)
    expect(lost.moments).toEqual([expect.objectContaining({ title: 'P1 and P3 win', tone: 'good' })])
    expect(lost.celebrate).toBeUndefined()
    const watched = present({ type: 'gameOver', winner: 1 }, over(), null)
    expect(watched.moments).toEqual([expect.objectContaining({ title: 'P1 and P3 win', tone: 'win', colour: 'var(--team1)' })])
    expect(watched.celebrate).toBeUndefined()
  })

  test('waits for the balls to fill, and for the verdict when a challenge ended the game, and the sound waits with it', () => {
    const plain = present({ type: 'gameOver', winner: 1 }, over(), 1)
    expect(plain.after).toBe(4 * BALL_STAGGER_MS + 350)
    expect(winWait(challenged(undefined))).toBe(plain.after)
    const caught = over({ ...play, guilty: true, rule: 'renege' })
    const after = present({ type: 'gameOver', winner: 1 }, caught, 1).after
    expect(after).toBe(CHALLENGE_BEAT_MS + VERDICT_BEAT_MS / 2 + 4 * BALL_STAGGER_MS + 350)
    expect(heard({ type: 'gameOver', winner: 1 }, 1, caught)).toEqual([['gameWon', after]])
    expect(after).toBeLessThanOrEqual(MAX_WIN_WAIT_MS)
  })

  test('holds the screen until the win has been seen', () => {
    expect(dwell({ type: 'gameOver', winner: 1 })).toBeGreaterThanOrEqual(MAX_WIN_WAIT_MS + WIN_BEAT_MS)
  })
})
