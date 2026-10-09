import { describe, expect, test } from 'vitest'
import { SHOW_MS, TalkStore } from './talk'

/** Timers run by hand. */
function clock() {
  let now = 0
  const due: { at: number; run: () => void; id: number }[] = []
  let ids = 0
  return {
    timers: {
      set: (run: () => void, ms: number) => {
        const id = ++ids
        due.push({ at: now + ms, run, id })
        return id
      },
      clear: (id: unknown) => {
        const i = due.findIndex((d) => d.id === id)
        if (i >= 0) due.splice(i, 1)
      },
    },
    pass(ms: number) {
      now += ms
      for (const d of due.filter((d) => d.at <= now).sort((a, b) => a.at - b.at)) {
        due.splice(due.indexOf(d), 1)
        d.run()
      }
    },
  }
}

describe('talk on the table', () => {
  test('a line shows, then goes', () => {
    const c = clock()
    const talk = new TalkStore(c.timers)
    talk.receive({ seat: 1, say: { kind: 'line', id: 'yoh' } })
    expect(talk.getState()).toMatchObject([{ seat: 1, say: { id: 'yoh' } }])
    c.pass(SHOW_MS.line)
    expect(talk.getState()).toEqual([])
  })

  test('a seat shows one line or emote at a time; throws are each their own', () => {
    const talk = new TalkStore(clock().timers)
    talk.receive({ seat: 1, say: { kind: 'line', id: 'yoh' } })
    talk.receive({ seat: 1, say: { kind: 'emote', id: 'fire' } })
    talk.receive({ seat: 1, say: { kind: 'throw', id: 'rose', at: 2 } })
    talk.receive({ seat: 1, say: { kind: 'throw', id: 'rose', at: 2 } })
    expect(talk.getState().map((s) => s.say.id)).toEqual(['fire', 'rose', 'rose'])
  })

  test('an answer waits its turn, and is heard as it shows', () => {
    const c = clock()
    const talk = new TalkStore(c.timers)
    const heard: string[] = []
    talk.onSaid((said) => heard.push(said.say.id))
    talk.receive({ seat: 2, say: { kind: 'line', id: 'haibo' }, after: 600 })
    expect(talk.getState()).toEqual([])
    c.pass(600)
    expect(heard).toEqual(['haibo'])
    expect(talk.getState()).toHaveLength(1)
  })

  test('nothing shows once the table is gone', () => {
    const c = clock()
    const talk = new TalkStore(c.timers)
    talk.receive({ seat: 2, say: { kind: 'line', id: 'haibo' }, after: 600 })
    talk.close()
    c.pass(600)
    expect(talk.getState()).toEqual([])
  })
})
