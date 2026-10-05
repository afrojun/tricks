/** Small statistics for the measurements. */

export function mean(xs: readonly number[]): number {
  return xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length
}

export function sd(xs: readonly number[]): number {
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1))
}

/** Mean with a normal 95% interval. */
export function ci95(xs: readonly number[]): { mean: number; lo: number; hi: number; half: number } {
  const m = mean(xs)
  const half = (1.96 * sd(xs)) / Math.sqrt(xs.length)
  return { mean: m, lo: m - half, hi: m + half, half }
}

export function quantile(xs: readonly number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b)
  if (s.length === 0) return NaN
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))
  return s[i]
}

export const fmt = (x: number, digits = 3) => (Number.isFinite(x) ? x.toFixed(digits) : String(x))

/** Parses `--name value` and `--flag` arguments. */
export function args(argv = process.argv.slice(2)): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const key = argv[i].slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) out[key] = 'true'
    else out[key] = argv[++i]
  }
  return out
}
