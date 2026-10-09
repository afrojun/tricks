import { expect, test } from 'vitest'
import { Budget } from './budget'

/** A budget on a clock the test turns by hand. */
function budget() {
  let now = 1000
  const due: { at: number; run: () => void }[] = []
  const b = new Budget(3000, { now: () => now, later: (run, ms) => due.push({ at: now + ms, run }) })
  const advance = (ms: number) => {
    now += ms
    for (const timer of due.filter((t) => t.at <= now)) {
      due.splice(due.indexOf(timer), 1)
      timer.run()
    }
  }
  return { b, advance }
}

test('one thing said per budget, the lines, emotes and throws all sharing it', () => {
  const { b, advance } = budget()
  expect(b.spend('line:yoh')).toBe(true)
  expect(b.getState()).toEqual({ until: 4000, last: 'line:yoh', cooling: true })
  advance(2999)
  expect(b.spend('throw:rose@1')).toBe(false)
  expect(b.getState().last).toBe('line:yoh')
  advance(1)
  expect(b.getState().cooling).toBe(false)
  expect(b.spend('throw:rose@1')).toBe(true)
  expect(b.getState().last).toBe('throw:rose@1')
})

test('tells its readers when it starts and when it runs out', () => {
  const { b, advance } = budget()
  let told = 0
  b.subscribe(() => told++)
  b.spend('emote:clap')
  advance(3000)
  expect(told).toBe(2)
})
