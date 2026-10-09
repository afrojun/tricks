import { describe, expect, test, vi } from 'vitest'
import { Landings } from './landings'

describe('throws still to land', () => {
  test('muting a thrower stops only theirs', () => {
    const landings = new Landings(() => 0)
    const one = vi.fn()
    const two = vi.fn()
    landings.add(1, one, 640)
    landings.add(2, two, 640)
    landings.stop((from) => from === 1)
    expect(one).toHaveBeenCalledOnce()
    expect(two).not.toHaveBeenCalled()
  })

  test('reactions off, or leaving, stops them all, once', () => {
    const landings = new Landings(() => 0)
    const stop = vi.fn()
    landings.add(1, stop, 640)
    landings.stop()
    landings.stop()
    expect(stop).toHaveBeenCalledOnce()
  })

  test('those already landed are forgotten', () => {
    let now = 0
    const landings = new Landings(() => now)
    const landed = vi.fn()
    landings.add(1, landed, 640)
    now = 1000
    landings.add(2, () => {}, 640)
    landings.stop()
    expect(landed).not.toHaveBeenCalled()
  })
})
