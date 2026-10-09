/** What may be said from where, and what is heard here: pure, so the screens and their tests agree. */
import type { Showing } from '../../client/talk'
import { type Say, THROWS } from '../../kit/talk'
import type { Seat } from '../../kit/table'

/** One button in a name's menu. */
export interface Choice {
  say: Say
  enabled: boolean
}

/** The kind things, the only ones offered on the game-over panel: a chappal there reads as sore losing. */
function kindSet(target: Seat): Say[] {
  return [
    { kind: 'emote', id: 'clap' },
    { kind: 'throw', id: 'chip', at: target },
    { kind: 'throw', id: 'rose', at: target },
    { kind: 'line', id: 'lekker' },
  ]
}

/**
 * What the menu on another player's name offers besides Mute. Nothing for a spectator or with
 * reactions off. At game over, the kind set; otherwise the five throws, the nudge only while the
 * table waits on that player, as the room requires.
 */
export function menuChoices(viewer: Seat | null, target: Seat, opts: { reactions: boolean; waitedOn: boolean; over: boolean }): Choice[] {
  if (viewer === null || viewer === target || !opts.reactions) return []
  if (opts.over) return kindSet(target).map((say) => ({ say, enabled: true }))
  return THROWS.map((id) => ({ say: { kind: 'throw', id, at: target }, enabled: id !== 'nudge' || opts.waitedOn }))
}

/** A name for one thing said, so the button that said it can stay pressed while the budget runs. */
export function sayKey(say: Say): string {
  return say.kind === 'throw' ? `throw:${say.id}@${say.at}` : `${say.kind}:${say.id}`
}

/** What shows and sounds here: nothing with reactions off, and nothing from a muted seat. */
export function heard(showing: readonly Showing[], reactions: boolean, muted: ReadonlySet<Seat>): readonly Showing[] {
  if (!reactions) return []
  return muted.size === 0 ? showing : showing.filter((s) => !muted.has(s.seat))
}

/** "Asha", "Asha and Devi", "Asha, Chan and Devi". */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

interface VoterSeat {
  kind: 'empty' | 'human' | 'ai'
  connected: boolean
  standIn: boolean
}

/** Who must say Again before the next game starts: every person at the table and not away, as the kit's `againElectorate` counts them. */
export function againVoters(seats: readonly VoterSeat[]): Seat[] {
  return seats.flatMap((s, seat) => (s.kind === 'human' && s.connected && !s.standIn ? [seat] : []))
}
