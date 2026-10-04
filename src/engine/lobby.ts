import { resolveRules } from './rules'
import { type Seat, allSeats, seatsFrom } from './seats'
import { type Action, type Actor, type Ctx, type Game, type GameEvent, PERSONAS, type RejectReason, type SeatInfo } from './types'

export const MAX_NAME_LENGTH = 16
const AI_NAMES = ['Bot Asha', 'Bot Bheki', 'Bot Chan', 'Bot Devi']

export const EMPTY_SEAT: SeatInfo = { name: '', kind: 'empty', connected: false, standIn: false, persona: 'straight', personaHidden: false }

/** Trims, collapses whitespace and caps the length; null if nothing is left. */
export function cleanName(raw: string): string | null {
  const name = [...raw.replace(/\s+/g, ' ').trim()].slice(0, MAX_NAME_LENGTH).join('').trim()
  return name.length > 0 ? name : null
}

/** Gives the host role a new owner only when its seat is no longer a human's. */
export function fixHost(game: Game): void {
  const isHuman = (s: Seat) => game.seats[s]?.kind === 'human'
  if (game.host !== null && isHuman(game.host)) return
  const from = game.host === null ? 0 : (game.host + 1) % game.playerCount
  const order = seatsFrom(from, game.playerCount)
  game.host = order.find((s) => isHuman(s) && game.seats[s].connected) ?? order.find(isHuman) ?? null
}

/**
 * Who may use the host's powers right now: the host, or while they are
 * disconnected the next connected human. The role returns when they do.
 */
export function actingHost(game: Pick<Game, 'host' | 'seats' | 'playerCount'>): Seat | null {
  if (game.host === null) return null
  const present = (s: Seat) => game.seats[s].kind === 'human' && game.seats[s].connected && !game.seats[s].standIn
  if (present(game.host)) return game.host
  return seatsFrom(game.host, game.playerCount).find(present) ?? game.host
}

type LobbyAction = Extract<
  Action,
  { type: 'sit' | 'leaveSeat' | 'rename' | 'addAi' | 'clearSeat' | 'setRules' | 'setPlayerCount' | 'start' }
>

/** Handles seat and lobby actions except `start`'s deal, which the caller performs. */
export function lobbyAction(game: Game, actor: Actor, action: LobbyAction, ctx: Ctx, events: GameEvent[]): RejectReason | null {
  const inLobby = game.phase.kind === 'lobby'
  const validSeat = (s: Seat) => Number.isInteger(s) && s >= 0 && s < game.playerCount

  if (action.type === 'rename') {
    if (typeof actor !== 'number') return 'notSeated'
    const name = cleanName(action.name)
    if (name === null) return 'badName'
    game.seats[actor].name = name
    events.push({ type: 'seatChanged' })
    return null
  }

  if (!inLobby) return 'wrongPhase'

  if (action.type === 'sit') {
    if (actor !== null) return 'alreadySeated'
    if (!validSeat(action.seat)) return 'badSeat'
    if (game.seats[action.seat].kind !== 'empty') return 'seatTaken'
    const name = cleanName(action.name)
    if (name === null) return 'badName'
    game.seats[action.seat] = { ...EMPTY_SEAT, name, kind: 'human', connected: true }
    fixHost(game)
    events.push({ type: 'seatChanged' })
    return null
  }

  if (typeof actor !== 'number') return 'notSeated'

  if (action.type === 'leaveSeat') {
    game.seats[actor] = { ...EMPTY_SEAT }
    if (game.host === actor) game.host = null
    fixHost(game)
    events.push({ type: 'seatChanged' })
    return null
  }

  if (actingHost(game) !== actor) return 'notHost'

  switch (action.type) {
    case 'addAi': {
      if (!validSeat(action.seat)) return 'badSeat'
      if (game.seats[action.seat].kind !== 'empty') return 'seatTaken'
      const used = new Set(game.seats.map((s) => s.name))
      const name = AI_NAMES.find((n) => !used.has(n)) ?? `Bot ${action.seat + 1}`
      const surprise = action.persona === 'surprise'
      const persona = action.persona === 'surprise' ? PERSONAS[Math.floor(ctx.rng() * PERSONAS.length)] : (action.persona ?? 'straight')
      game.seats[action.seat] = { name, kind: 'ai', connected: true, standIn: false, persona, personaHidden: surprise }
      break
    }
    case 'clearSeat': {
      if (!validSeat(action.seat) || action.seat === actor) return 'badSeat'
      game.seats[action.seat] = { ...EMPTY_SEAT }
      break
    }
    case 'setRules':
      game.rules = resolveRules(action.overrides)
      break
    case 'setPlayerCount': {
      if (action.playerCount === game.playerCount) break
      if (action.playerCount === 2) {
        if (game.seats.slice(2).some((s) => s.kind !== 'empty')) return 'seatTaken'
        game.seats = game.seats.slice(0, 2)
      } else {
        game.seats = [...game.seats, { ...EMPTY_SEAT }, { ...EMPTY_SEAT }]
      }
      game.playerCount = action.playerCount
      break
    }
    case 'start':
      if (game.seats.some((s) => s.kind === 'empty')) return 'seatsNotFilled'
      break
  }
  events.push({ type: 'seatChanged' })
  return null
}

export function emptySeats(playerCount: number): SeatInfo[] {
  return allSeats(playerCount).map(() => ({ ...EMPTY_SEAT }))
}
