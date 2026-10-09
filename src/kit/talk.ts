/**
 * Table talk: the lines, emotes and throws a seat may send, every one a fixed id, so nothing sent
 * can be more than a chappal. Talk is relayed by the room and never saved; see the table talk spec.
 */
import { z } from 'zod'
import { type Persona, TRAITS } from './mind'
import type { Seat } from './table'

/** The table words of the voice sheet: each becomes a recording once the voices exist. */
export const LINES = ['yoh', 'haibo', 'ekse', 'eish', 'aweh', 'lekker', 'laugh'] as const
export const EMOTES = ['clap', 'howl', 'facepalm', 'fire', 'eyes', 'sweat', 'pray', 'sleepy'] as const
export const THROWS = ['chappal', 'rose', 'tomato', 'chip', 'nudge'] as const

export type Line = (typeof LINES)[number]
export type Emote = (typeof EMOTES)[number]
export type Throw = (typeof THROWS)[number]

export type Say = { kind: 'line'; id: Line } | { kind: 'emote'; id: Emote } | { kind: 'throw'; id: Throw; at: Seat }

/** Something a seat said, as the room relays it. `after` holds it back that many ms, for an answer to a throw. */
export interface Said {
  seat: Seat
  say: Say
  after?: number
}

export const saySchema: z.ZodType<Say> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('line'), id: z.enum(LINES) }),
  z.object({ kind: z.literal('emote'), id: z.enum(EMOTES) }),
  z.object({ kind: z.literal('throw'), id: z.enum(THROWS), at: z.number().int().min(0).max(7) }),
])

/** The server's limit: one thing said per seat in this long. The client waits a little longer, so a person never meets it. */
export const TALK_GAP_MS = 2500
/** The client's own budget between two things said. */
export const TALK_BUDGET_MS = 3000
/** One nudge of the same seat in this long. */
export const NUDGE_GAP_MS = 10_000
/** How long an answer to a throw waits after it, so it follows the landing. */
export const ANSWER_AFTER_MS = 600

/** What a game says about a moment, for its computers to answer; the kit decides who speaks and what. */
export type Moment =
  /** A big card slammed: Thunee's Jacks, Hearts' queen of spades. */
  | { kind: 'slam'; seat: Seat }
  /** A trick worth having. */
  | { kind: 'bigTrick'; seat: Seat }
  /** A trick nobody wants, such as Hearts' queen of spades. */
  | { kind: 'stung'; seat: Seat }
  | { kind: 'caught'; challenger: Seat; accused: Seat }
  | { kind: 'wrongChallenge'; challenger: Seat }
  /** A round scored: who did well from it, and who badly. */
  | { kind: 'scored'; up: Seat[]; down: Seat[] }
  | { kind: 'gameWon'; winners: Seat[] }

interface Speakers {
  seats: readonly { kind: 'empty' | 'human' | 'ai'; persona: Persona }[]
}

/** Only real computers talk: a stand-in plays for a person and must never speak for them. */
function speaks(game: Speakers, seat: Seat): boolean {
  return game.seats[seat]?.kind === 'ai'
}

const pick = <T>(items: readonly T[], rng: () => number): T => items[Math.floor(rng() * items.length)]

/**
 * What the computers say about these moments: rarely, and only for a moment that matters. Banter is
 * never saved and needs no repeatable decision, so it draws from the host's `rng`, never the round's
 * salt: a reply anyone can provoke must not become a way to probe the salt that decides cheats.
 */
export function banterFor(game: Speakers, moments: readonly Moment[], rng: () => number, behind: (seat: Seat) => boolean = () => false): Said[] {
  const out: Said[] = []
  const line = (seat: Seat, id: Line, chance: number) => {
    if (!speaks(game, seat) || out.some((s) => s.seat === seat)) return
    // A moody persona that is behind says Eish twice as often.
    const moody = id === 'eish' && TRAITS[game.seats[seat].persona].moody && behind(seat) ? 2 : 1
    if (rng() < chance * moody) out.push({ seat, say: { kind: 'line', id } })
  }
  for (const m of moments) {
    switch (m.kind) {
      case 'slam': {
        const others = game.seats.map((_, s) => s).filter((s) => s !== m.seat && speaks(game, s))
        if (others.length > 0) line(pick(others, rng), 'yoh', 0.15)
        break
      }
      case 'bigTrick':
        line(m.seat, pick(['lekker', 'aweh'] as const, rng), 0.25)
        break
      case 'stung':
        line(m.seat, 'eish', 0.4)
        break
      case 'caught': {
        const table = game.seats.map((_, s) => s).filter((s) => s !== m.accused && speaks(game, s))
        if (table.length > 0 && rng() < 0.6) out.push({ seat: pick(table, rng), say: { kind: 'line', id: 'laugh' } })
        line(m.accused, 'eish', 0.6)
        break
      }
      case 'wrongChallenge':
        line(m.challenger, 'eish', 0.6)
        break
      case 'scored': {
        const up = m.up.filter((s) => speaks(game, s))
        const down = m.down.filter((s) => speaks(game, s))
        if (up.length > 0) line(pick(up, rng), 'aweh', 0.3)
        if (down.length > 0) line(pick(down, rng), 'eish', 0.3)
        break
      }
      case 'gameWon': {
        const winners = m.winners.filter((s) => speaks(game, s))
        if (winners.length > 0) line(pick(winners, rng), 'lekker', 0.8)
        break
      }
    }
  }
  return out
}

/** A computer's answer to something thrown at it, now and then. */
export function answerThrow(game: Speakers, target: Seat, thrown: Throw, rng: () => number): Said | null {
  if (!speaks(game, target) || thrown === 'nudge' || rng() >= 0.4) return null
  const id: Line = thrown === 'rose' || thrown === 'chip' ? 'lekker' : 'haibo'
  return { seat: target, say: { kind: 'line', id }, after: ANSWER_AFTER_MS }
}
