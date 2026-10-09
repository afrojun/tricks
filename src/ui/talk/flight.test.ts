import { expect, test } from 'vitest'
import { landing, lob, menuPlace } from './flight'

const name = (left: number, top = 100) => ({ left, top, right: left + 60, bottom: top + 24 })

test('a throw rests on the corner of the name away from where that seat speaks', () => {
  // The left seat speaks over its left edge; the top seat to its right, and the right seat over its right edge.
  expect(landing(name(8), 390)).toEqual({ x: 76, y: 96 })
  expect(landing(name(165), 390)).toEqual({ x: 157, y: 96 })
  expect(landing(name(320), 390)).toEqual({ x: 312, y: 96 })
})

test('a lob ends where it lands and rises over the higher of its two ends', () => {
  const path = lob({ x: 195, y: 700 }, { x: 160, y: 80 })
  expect(path).toMatchObject({ x: 160, y: 80, dx: 35, dy: 620 })
  expect(path.peak).toBeLessThan(0)
  expect(lob({ x: 30, y: 300 }, { x: 360, y: 320 }).peak).toBeLessThan(-20)
})

test("a name's menu opens inward from either edge of the screen", () => {
  expect(menuPlace(name(8), 390)).toBe('start')
  expect(menuPlace(name(165), 390)).toBe('middle')
  expect(menuPlace(name(320), 390)).toBe('end')
})
