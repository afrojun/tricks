/**
 * What a coach may say about a search decision (section 7 of the search-player spec): estimates over deals that
 * fit what the seat has seen, with their uncertainty. Words belong to the coach, which says "in the deals this
 * could be"; a "much worse" warning is not to be read off these numbers until its threshold is validated.
 */
import type { Card } from '../cards'
import type { SearchResult } from './search'

export interface Estimate<A> {
  action: A
  /** The mean result over the sampled worlds: higher is better for the seat. */
  mean: number
  /** The standard error of that mean. */
  se: number
  /** Its mean minus the chosen action's, and that difference's standard error, paired by world. Zero for the chosen. */
  gap: number
  gapSe: number
  /** The share of worlds in which the seat won the trick with it; null when the decision is not a card. */
  wins: number | null
}

export interface Explanation<A> {
  chosen: Estimate<A>
  /** The other candidates, best first. */
  others: Estimate<A>[]
  worlds: number
}

/** Estimates for the chosen action and each alternative; null when there was nothing to search. */
export function explain<A, C extends Card>(result: SearchResult<A, C>): Explanation<A> | null {
  if (result.worlds === 0) return null
  const chosen = result.options[result.chosen]
  const estimate = (option: (typeof result.options)[number]): Estimate<A> => {
    const gaps = option.values.map((v, w) => v - chosen.values[w])
    return {
      action: option.action,
      mean: mean(option.values),
      se: standardError(option.values),
      gap: mean(gaps),
      gapSe: standardError(gaps),
      wins: option.won === null ? null : option.won / result.worlds,
    }
  }
  const others = result.options
    .filter((_, i) => i !== result.chosen)
    .map(estimate)
    .sort((a, b) => b.mean - a.mean)
  return { chosen: estimate(chosen), others, worlds: result.worlds }
}

function mean(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

/** Of the mean, with the sample's own spread; infinite from a single world. */
function standardError(xs: readonly number[]): number {
  if (xs.length < 2) return Number.POSITIVE_INFINITY
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1) / xs.length)
}
