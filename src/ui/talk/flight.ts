/** Where a throw lands and the lob it takes to get there: pure, from the boxes the screen measures. */

export interface Point {
  x: number
  y: number
}

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** How far above the higher of its two ends a throw rises, over the trick. */
const LOB = 56

/**
 * The corner of a name a throw sits on, away from where that seat speaks: the left seat speaks
 * over its left edge, so a throw sits on its right corner; the top seat speaks to its right and the
 * right seat over its right edge, so theirs sit on the left, as do the names at game over.
 */
export function landing(name: Box, viewportWidth: number): Point {
  const left = (name.left + name.right) / 2 < viewportWidth * 0.3
  return { x: left ? name.right + 8 : name.left - 8, y: name.top - 4 }
}

/** The middle of a box's top edge: where a throw leaves the hand, or lands on it. */
export function topMiddle(box: Box): Point {
  return { x: (box.left + box.right) / 2, y: box.top }
}

export function middle(box: Box): Point {
  return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 }
}

/** A lob from `from` to `to`: where it ends, and the start and the top of its arc as offsets from there. */
export function lob(from: Point, to: Point): { x: number; y: number; dx: number; dy: number; peak: number } {
  return { x: to.x, y: to.y, dx: from.x - to.x, dy: from.y - to.y, peak: Math.min(from.y, to.y) - LOB - to.y }
}

/** How long a throw is in the air, before it lands and is heard. */
export const FLIGHT_MS = 640

/** Which way a name's menu opens: inward from a seat at either edge of the screen, else centred under the name. */
export type MenuPlace = 'start' | 'middle' | 'end'

export function menuPlace(name: Box, viewportWidth: number): MenuPlace {
  const centre = (name.left + name.right) / 2
  if (centre < viewportWidth * 0.35) return 'start'
  return centre > viewportWidth * 0.65 ? 'end' : 'middle'
}

/** Whether the player asked for less motion: a throw then appears landed, and nothing shakes. */
export function reducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}
