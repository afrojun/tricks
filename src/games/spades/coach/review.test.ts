import { describe, expect, test } from 'vitest'
import { FOUR } from '../engine/deals'
import { Table, card } from '../engine/testing'
import type { Action } from '../engine/types'
import { viewFor } from '../engine/view'
import { spadesBasis, spadesCoach } from '.'

const play = (text: string): Action => ({ type: 'playCard', card: card(text) })

/** Seat 0, the dealer's left, calls first and then leads; it holds 2♣ 3♣ 4♣ 5♣ and 2♦ 3♦ 4♦. */
function moments() {
  const t = new Table(4).deal(FOUR, 3)
  const calling = viewFor(t.game, 0, 'full')
  const call = spadesCoach.advise(calling)!
  if (call.action.type !== 'call') throw new Error(call.action.type)
  t.call(call.action.tricks, 3, 3, 3)
  const leading = viewFor(t.game, 0, 'full')
  const lead = spadesCoach.advise(leading)!
  return { calling, call, leading, lead, tricks: call.action.tricks }
}

describe('Spades’ review', () => {
  test('a call and a card against the hint, each with the hint’s reason, the call first; a challenge is never weighed against it', () => {
    const { calling, call, leading, lead, tricks } = moments()
    const off = lead.action.type === 'playCard' && lead.action.card.suit === 'diamonds' ? play('2h') : play('2d')
    const notes = spadesCoach.review({
      decisions: [
        { view: calling, advised: call.action, taken: { type: 'call', tricks: tricks + 2 } },
        { view: leading, advised: lead.action, taken: { type: 'challengePlay', seat: 1 } },
        { view: leading, advised: lead.action, taken: off },
      ],
      summary: null,
      dealt: [],
      you: 0,
      view: leading,
    })
    expect(notes.map((n) => [n.tone, n.title])).toEqual([
      ['suggest', `Calling: you chose “Call ${tricks + 2}”`],
      ['suggest', `Trick 1: you chose “${spadesBasis.name(off)}”`],
    ])
    expect(notes[0].body).toBe(`The hint was “Call ${tricks}”. ${call.note.body}`)
    expect(notes[1].body).toBe(`The hint was “${lead.note.title}”. ${lead.note.body}`)
  })

  test('touching cards are as good as each other; a card with an unseen one between, or of another suit, is not', () => {
    const { leading } = moments()
    expect(spadesBasis.asGood!(leading, play('2c'), play('5c'))).toBe(true)
    expect(spadesBasis.asGood!(leading, play('2c'), play('2d'))).toBe(false)
    expect(spadesBasis.asGood!(leading, play('4d'), play('2h'))).toBe(false)
    expect(spadesBasis.asGood!(leading, play('2d'), play('4d'))).toBe(true)
    // Seat 0 holds clubs up to the 5: the 6 is unseen.
    expect(spadesBasis.asGood!(leading, play('2c'), play('7c'))).toBe(false)
  })

  test('touching once the cards on the table are counted, but one wins the trick and the other ducks: not as good', () => {
    // Seat 3 leads the 6♣ to seat 0's 5♣ and 7♣.
    const t = new Table(4)
      .deal(
        [
          '5c 7c 2d 3d 4d 5d 6d 2h 3h 4h 5h 6h 2s',
          '8c 9c 10c 7d 8d 9d 10d 7h 8h 9h 10h 3s 4s',
          'Jc Qc Kc Jd Qd Kd Jh Qh Kh 5s 6s 7s 8s',
          '6c 2c 3c 4c Ac Ad Ah 9s 10s Js Qs Ks As',
        ],
        2,
      )
      .call(3, 3, 3, 3)
      .play('6c')
    expect(spadesBasis.asGood!(viewFor(t.game, 0, 'full'), play('5c'), play('7c'))).toBe(false)
  })

  test('a call outweighs any card', () => {
    const { calling, call, leading, lead, tricks } = moments()
    const callStake = spadesBasis.stake!(calling, call.action, { type: 'call', tricks: tricks + 1 })
    const cardStake = spadesBasis.stake!(leading, lead.action, play('2d'))
    expect(callStake).toBeGreaterThan(cardStake)
  })
})
