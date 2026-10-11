import { describe, expect, test } from 'vitest'
import type { Note } from '../../../kit/coach'
import { type Game, type View, viewFor } from '../engine'
import { Table } from '../engine/testing'
import { heartsCoach } from '.'
import { TOPICS, type TopicId, topicsFor } from './topics'

const you = (game: Game, seat = 0): View => viewFor(game, seat, 'full')
const text = (n: Note | null) => (n ? `${n.title}. ${n.body}` : '')

// Seat 0 holds the two of clubs and leads; seat 3 has no clubs.
const NO_PASS = [
  '2c 9c Kc 3h 7h Ah Qs 4s 5d 6d 7d 8d 9d',
  '3c 4c 5c 6c 7c 2h 4h 5h 6h 2s 3s 5s 2d',
  '8c 10c Jc Qc Ac 8h 9h 10h Jh 6s 7s 8s 3d',
  'Kh Qh 9s 10s Js Ks As 4d 10d Jd Qd Kd Ad',
]

describe('Hearts’ lessons', () => {
  test('every lesson has a title and something to read', () => {
    for (const [id, topic] of Object.entries(TOPICS)) {
      expect(topic.title, id).not.toBe('')
      expect(topic.paragraphs.length, id).toBeGreaterThan(0)
    }
  })

  test('the first deal introduces the aim, then passing', () => {
    const t = new Table().deal(NO_PASS)
    expect(topicsFor(you(t.game), { type: 'dealt', roundNumber: 1, direction: 'left' })).toEqual(['aim', 'passing'] satisfies TopicId[])
    expect(topicsFor(you(t.game), { type: 'dealt', roundNumber: 2, direction: 'right' })).toEqual(['passing'] satisfies TopicId[])
  })

  test('a round without passing teaches no passing', () => {
    const t = new Table({ passing: 'none' }).deal(NO_PASS)
    expect(topicsFor(you(t.game), { type: 'dealt', roundNumber: 1, direction: 'none' })).not.toContain('passing')
  })

  test('play teaches tricks, and following the two of clubs teaches the first trick', () => {
    const t = new Table({ passing: 'none' }).deal(NO_PASS)
    // Leading the two of clubs leaves nothing to choose, so the first trick waits for a round where the player follows.
    expect(topicsFor(you(t.game), null)).toEqual(['tricks'] satisfies TopicId[])
    expect(topicsFor(you(t.play('2c').game, 1), null)).toEqual(['tricks', 'firstTrick'] satisfies TopicId[])
    expect(topicsFor(you(t.game, 2), null)).toEqual(['tricks'] satisfies TopicId[])
  })

  test('the first trick goes untaught when points may be played to it', () => {
    const t = new Table({ passing: 'none', pointsOnFirstTrick: true }).deal(NO_PASS).play('2c')
    expect(topicsFor(you(t.game, 1), null)).not.toContain('firstTrick')
  })

  test('leading with hearts unbroken teaches breaking hearts, and so does a heart played, for as long as hearts are broken', () => {
    // Seat 2 wins the first trick with the A♣ and leads the second, holding hearts.
    const t = new Table({ passing: 'none' }).deal(NO_PASS).play('2c 3c Ac 4d').endPause()
    expect(topicsFor(you(t.game, 2), null)).toContain('heartsBroken')
    expect(topicsFor(you(t.game, 1), null)).not.toContain('heartsBroken')
    // Seat 3 has no clubs and breaks hearts with the K♥; the lesson stays due without the event.
    t.play('8c Kh')
    expect(topicsFor(you(t.game, 1), null)).toContain('heartsBroken')
    expect(topicsFor(you(t.play('9c 4c').game, 1), null)).toContain('heartsBroken')
  })

  test('the queen of spades, once she is played or held after the first trick', () => {
    const t = new Table({ passing: 'none' }).deal(NO_PASS)
    expect(topicsFor(you(t.game), null)).not.toContain('queen')
    t.play('2c 3c Ac 4d').endPause()
    expect(topicsFor(you(t.game, 1), null)).not.toContain('queen')
    // Seat 0 holds her after the first trick, and then plays her, against the rules, to a club lead.
    t.play('8c 10d')
    expect(topicsFor(you(t.game, 0), null)).toContain('queen')
    t.play('Qs')
    expect(topicsFor(you(t.game, 1), null)).toContain('queen')
  })

  test('challenges are taught from the second trick, and only when cheating is allowed', () => {
    const second = (rules = {}) => new Table({ passing: 'none', ...rules }).deal(NO_PASS).play('2c 3c Ac 4d').endPause()
    expect(topicsFor(you(second().game, 2), null)).toContain('challenge')
    expect(topicsFor(you(second({ allowCheating: false }).game, 2), null)).not.toContain('challenge')
  })

  test('a shot moon teaches the moon', () => {
    const t = new Table({ passing: 'none' }).deal(NO_PASS)
    const summary = { roundNumber: 1, reason: 'moon' as const, points: [0, 26, 26, 26], scoresAfter: [0, 26, 26, 26], moon: 0 }
    expect(topicsFor(you(t.game), { type: 'roundScored', summary })).toContain('moon')
  })
})

describe('Hearts’ narration', () => {
  test('a trick won says who took how many points', () => {
    const t = new Table({ passing: 'none' }).deal(NO_PASS)
    expect(text(heartsCoach.narrate({ type: 'trickWon', seat: 0, points: 0, queen: false }, you(t.game)))).toBe('You win the trick. It held no points.')
    expect(text(heartsCoach.narrate({ type: 'trickWon', seat: 2, points: 14, queen: true }, you(t.game)))).toBe('P2 wins the trick. P2 takes 14 points.')
  })

  test('a challenge names who takes the 26', () => {
    const t = new Table({ passing: 'none' }).deal(NO_PASS)
    expect(text(heartsCoach.narrate({ type: 'challengeResolved', challenger: 1, accused: 0, guilty: true }, you(t.game)))).toBe('P1 challenges you. You broke a rule, so you take 26.')
    expect(text(heartsCoach.narrate({ type: 'challengeResolved', challenger: 0, accused: 1, guilty: false }, you(t.game)))).toBe('You challenge P1. P1 played by the rules, so you take 26.')
  })

  test('the cards passed to you, and from where', () => {
    const t = new Table().deal(NO_PASS).pass(['2c 9c Kc', '3c 4c 5c', '8c 10c Jc', 'Kh Qh 9s'])
    expect(text(heartsCoach.narrate({ type: 'passesExchanged' }, you(t.game)))).toBe('Cards passed. P3, on your right, gave you K♥, Q♥ and 9♠.')
  })

  test('hearts broken links to its lesson', () => {
    const t = new Table({ passing: 'none' }).deal(NO_PASS)
    expect(heartsCoach.narrate({ type: 'heartsBroken' }, you(t.game))?.topic).toBe('heartsBroken')
  })
})
