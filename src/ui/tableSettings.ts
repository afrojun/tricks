/** The table's settings (its pace, together or over days, and its timers) as a host keeps them on this device. Not the browser scripts' speed, which is `src/client/pace.ts`. */
import { LIVE, type TableSettings, type TimerSpec, validTimers } from '../kit/table'
import type { TimerControl } from './contract'

/** The pace and timers a host last chose, which the next room they create starts with, as it does the table size. */
export function settingsKey(game: string): string {
  return `tricks-${game}-table`
}

function specsOf(timers: readonly TimerControl[]): Record<string, TimerSpec> {
  return Object.fromEntries(timers.map((t) => [t.id, t.spec]))
}

/** The settings kept for a game, if they still fit its windows; otherwise the table's start, together and untimed. */
export function readSettings(game: string, timers: readonly TimerControl[]): TableSettings {
  try {
    const kept = JSON.parse(localStorage.getItem(settingsKey(game)) ?? 'null') as Partial<TableSettings> | null
    if (kept?.pace !== 'live' && kept?.pace !== 'async') return LIVE
    const keptTimers = kept.timers
    if (keptTimers === null) return { pace: kept.pace, timers: null }
    if (typeof keptTimers === 'object' && keptTimers !== undefined && validTimers(keptTimers, specsOf(timers))) return { pace: kept.pace, timers: keptTimers }
    return { pace: kept.pace, timers: null }
  } catch {
    return LIVE
  }
}

/** Kept for next time if storage allows; a full or blocked store forgets. */
export function rememberSettings(game: string, settings: TableSettings): void {
  try {
    localStorage.setItem(settingsKey(game), JSON.stringify(settings))
  } catch {
    // Nothing to keep it in.
  }
}

/** Each window at its default, for a host who turns the time limits on. */
export function defaultTimers(timers: readonly TimerControl[]): Record<string, number> {
  return Object.fromEntries(timers.map((t) => [t.id, t.spec.default]))
}

/** The words for each pace, as a choice and as the line under it. */
export const PACES = [
  { value: 'live', label: 'Together', text: 'Everyone at the table at once.' },
  { value: 'async', label: 'Over days', text: 'Take your turn when you can. The computer plays for anyone who leaves a turn waiting for two days.' },
] as const satisfies readonly { value: TableSettings['pace']; label: string; text: string }[]

/** What a pace change says to everyone at the table. */
export function paceChangedText(by: string, pace: TableSettings['pace']): string {
  return `${by} set the pace to ${pace === 'async' ? 'over days' : 'together'}`
}
