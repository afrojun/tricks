import { describe, expect, test, vi } from 'vitest'
import { type GameEvent, type RoundSummary, type Seat, type View, viewFor } from '../engine'
import { Table, card } from '../engine/testing'
import { WIN_BEAT_MS } from '../../../ui/contract'
import { playSound } from '../../../ui/sound'
import { dwell } from './dwell'
import { BALL_STAGGER_MS, CHALLENGE_BEAT_MS, MAX_WIN_WAIT_MS, VERDICT_BEAT_MS, present, winWait } from './present'
import { headline } from './RoundResult'

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
    expect(headline(view, summary)).toBe('P1 caught P0 not following suit.')
  })

  test('an undercut is called an undercut', () => {
    const summary = challenged({ ...play, guilty: true, rule: 'undercut' })
    expect(verdict(summary)).toMatchObject({ title: 'Caught', detail: 'P0 undercut a trump' })
    expect(headline(view, summary)).toBe('P1 caught P0 undercutting a trump.')
  })

  test('a false Jodhi, and a fair play, read as before', () => {
    const jodhi = challenged({ challenger: 1, accused: 0, kind: 'jodhi', guilty: true, suit: 'spades' })
    expect(verdict(jodhi)).toMatchObject({ title: 'Caught', detail: 'P0 called a false Jodhi' })
    expect(headline(view, jodhi)).toBe('P1 caught P0 calling a false Jodhi.')
    const fair = challenged({ ...play, guilty: false })
    expect(verdict(fair)).toMatchObject({ title: 'Fair play', detail: 'P0 followed suit', tone: 'good' })
    expect(headline(view, fair)).toBe('P1 challenged P0 over playing 9♥, and was wrong.')
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
    expect(lost.moments).toEqual([expect.objectContaining({ title: 'P1 & P3 win', tone: 'good' })])
    expect(lost.celebrate).toBeUndefined()
    const watched = present({ type: 'gameOver', winner: 1 }, over(), null)
    expect(watched.moments).toEqual([expect.objectContaining({ title: 'P1 & P3 win', tone: 'win', colour: 'var(--team1)' })])
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
