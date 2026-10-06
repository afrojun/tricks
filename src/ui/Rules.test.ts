import { describe, expect, test } from 'vitest'
import { type FieldChange, type NumberDraft, leaveField, stepField } from './Rules'

/** Hearts' end score: 25 to 500, in steps of 25. */
const RANGE = { min: 25, max: 500, unit: 'points', step: 25 }

/**
 * A number rule's field over a room still holding `value`: the room has not answered yet, as when
 * a tap follows typing at once. Records every change the field sends.
 */
function field(value: number) {
  let draft: NumberDraft = { text: String(value), typed: false }
  const sent: number[] = []
  const take = (change: FieldChange) => {
    draft = change.draft
    if (change.send !== null) sent.push(change.send)
  }
  return {
    type: (text: string) => void (draft = { text, typed: true }),
    leave: () => take(leaveField(RANGE, value, draft)),
    less: () => take(stepField(RANGE, value, draft, -1)),
    more: () => take(stepField(RANGE, value, draft, 1)),
    text: () => draft.text,
    sent,
  }
}

describe('a number rule’s field', () => {
  test('typing 101 then + sends one change, stepped from what was typed', () => {
    const f = field(100)
    f.type('101')
    f.more() // − and + keep the focus, so the field is not left before the tap
    expect(f.sent).toEqual([126])
    expect(f.text()).toBe('126')
    f.leave() // leaving the field later sends nothing more
    expect(f.sent).toEqual([126])
  })

  test('where leaving the field comes before the tap, the tap still steps from the typed number', () => {
    const f = field(100)
    f.type('101')
    f.leave()
    f.more()
    expect(f.sent).toEqual([101, 126])
  })

  test('− steps down from the typed number too', () => {
    const f = field(100)
    f.type('50')
    f.less()
    expect(f.sent).toEqual([25])
  })

  test('taps before the room answers step from each other, not from the room’s old value', () => {
    const f = field(100)
    f.more()
    f.more()
    f.less()
    expect(f.sent).toEqual([125, 150, 125])
  })

  test('a typed number outside the range is brought into it before the step', () => {
    const high = field(100)
    high.type('600')
    high.more()
    expect(high.sent).toEqual([500])
    const low = field(100)
    low.type('3')
    low.less()
    expect(low.sent).toEqual([25])
  })

  test('with nothing usable typed, a tap steps from the room’s value', () => {
    const f = field(100)
    f.type('')
    f.more()
    expect(f.sent).toEqual([125])
  })

  test('at a limit a tap sends nothing, unless a number was typed', () => {
    const top = field(500)
    top.more()
    expect(top.sent).toEqual([])
    expect(top.text()).toBe('500')
    const typed = field(475)
    typed.type('500')
    typed.more()
    expect(typed.sent).toEqual([500])
  })

  test('leaving the field sends a typed number once, whole and in range, and only if it differs', () => {
    const f = field(100)
    f.leave()
    expect(f.sent).toEqual([])
    f.type(' 99.6 ')
    f.leave()
    expect(f.sent).toEqual([])
    expect(f.text()).toBe('100')
    f.type('101')
    f.leave()
    f.leave()
    expect(f.sent).toEqual([101])
    expect(f.text()).toBe('101')
  })

  test('leaving the field with no number in it puts the room’s value back', () => {
    const f = field(100)
    f.type('')
    f.leave()
    expect(f.sent).toEqual([])
    expect(f.text()).toBe('100')
  })
})
