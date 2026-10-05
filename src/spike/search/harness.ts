/** Plays single rounds with chosen players per seat, and pairs them as duplicate deals. */
import {
  type Action,
  type Card,
  type Persona,
  type RoundSummary,
  type Seat,
  type View,
  availableActions,
  cardId,
  nextDeadline,
  seatsToAct,
  teamOf,
  viewFor,
} from '../../engine'
import { Table, seededRng } from '../../engine/testing'
import { chooseAction, chooseJodhi, decide, fallbackAction } from '../../ai/choose'
import { HONEST, type Mind } from '../../ai/mind'
import { chooseChallenge } from '../../ai/suspicion'
import { type SearchOptions, type SearchResult, search } from './search'

export interface Decision {
  action: Action
  /** Set when the search chose a card from two or more legal ones. */
  searched?: { result: SearchResult; heuristic: Card | null; ms: number }
}

export interface Player {
  label: string
  /** Card play, Double and Khanaak, for the seat whose turn it is. */
  act(view: View, mind: Mind, seed: number): Decision
  /** Whether this seat challenges (as its persona would). */
  challenges: boolean
}

export const heuristicPlayer = (challenges = true): Player => ({
  label: 'heuristic',
  challenges,
  act: (view, mind) => ({ action: chooseAction(view, mind) }),
})

export const randomPlayer = (label = 'random'): Player => ({
  label,
  challenges: false,
  act: (view, _mind, seed) => {
    const legal = availableActions(view).legal
    return { action: { type: 'playCard', card: legal[Math.floor(seededRng(seed)() * legal.length)] } }
  },
})

/** Search for card play; Double and Khanaak, like calling, stay with the heuristic. */
export const searchPlayer = (opts: Omit<SearchOptions, 'seed'>, label = `search-${opts.policy}-${opts.worlds}`): Player => ({
  label,
  challenges: false,
  act: (view, _mind, seed) => {
    const honest = decide(view, HONEST).action
    if (honest.type === 'callDouble' || honest.type === 'callKhanaak') return { action: honest }
    const legal = availableActions(view).legal
    if (legal.length === 1) return { action: { type: 'playCard', card: legal[0] } }
    const started = performance.now()
    const result = search(view, { ...opts, seed })
    const ms = performance.now() - started
    const heuristic = honest.type === 'playCard' ? honest.card : null
    return { action: { type: 'playCard', card: result.card }, searched: { result, heuristic, ms } }
  },
})

export interface RoundRecord {
  summary: RoundSummary
  /** Balls each team gained this round. */
  gained: [number, number]
  decisions: { seat: Seat; label: string; searched: NonNullable<Decision['searched']> }[]
  /** Plays that broke the rules, and Jodhi claims that were bluffs. */
  reneges: number
  bluffs: number
}

/** Mixes a few numbers into one 32-bit seed. */
export function mix(...parts: number[]): number {
  let h = 2166136261
  for (const p of parts) {
    h = Math.imul(h ^ (p >>> 0), 16777619) >>> 0
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0
  }
  return h >>> 0
}

/**
 * One round of Traditional four-player Thunee from a fresh game. The deal and
 * the dealer depend only on `seed`; calling, trump and Thunee are the
 * heuristic's for every seat, so both copies of a duplicate pair reach card
 * play identically.
 */
export function playRound(seed: number, players: Player[], personas: Persona[] = ['straight', 'straight', 'straight', 'straight'], copy = 0): RoundRecord {
  const t = new Table(4, {}, seed)
  t.do(0, { type: 'start' })
  const mind = (s: Seat): Mind => ({ persona: personas[s], salt: t.game.aiSalt })
  const record: RoundRecord = { summary: null!, gained: [0, 0], decisions: [], reneges: 0, bluffs: 0 }
  let decisionIndex = 0

  const act = (seat: Seat, action: Action, fallback?: Action) => {
    const before = t.events.length
    const view = viewFor(t.game, seat)
    if (action.type === 'playCard' && !availableActions(view).legal.some((c) => cardId(c) === cardId(action.card))) record.reneges++
    let rejected = t.try(seat, action)
    if (rejected !== null && fallback) rejected = t.try(seat, fallback)
    if (rejected !== null) throw new Error(`seed ${seed}: ${JSON.stringify(action)} by ${seat} rejected (${rejected})`)
    const phase = t.game.phase
    if (action.type === 'claimJodhi' && (phase.kind === 'playing' || phase.kind === 'trickPause') && !phase.play.jodhiClaims.at(-1)!.valid) record.bluffs++
    react(t.events.slice(before))
  }
  const inPlay = () => t.game.phase.kind === 'playing' || t.game.phase.kind === 'trickPause'

  // As in src/ai/drive.ts: a Jodhi for the team that won a trick, then a challenge after any card or claim.
  const react = (events: typeof t.events) => {
    const won = events.find((e) => e.type === 'trickWon')
    if (won && won.type === 'trickWon') {
      for (let s = 0; s < 4; s++) {
        if (teamOf(s) !== teamOf(won.seat) || !inPlay()) continue
        const claim = chooseJodhi(viewFor(t.game, s, 'full'), mind(s))
        if (claim) act(s, claim)
      }
    }
    if (events.some((e) => e.type === 'cardPlayed' || e.type === 'jodhiClaimed')) {
      for (let s = 0; s < 4; s++) {
        if (!players[s].challenges || !inPlay()) continue
        const challenge = chooseChallenge(viewFor(t.game, s, 'full'), mind(s))
        if (challenge) act(s, challenge)
      }
    }
  }

  for (let guard = 0; guard < 2000; guard++) {
    const phase = t.game.phase
    if (phase.kind === 'roundResult' || phase.kind === 'gameOver') {
      record.summary = phase.summary
      record.gained[phase.summary.winner] = phase.summary.balls
      return record
    }
    const waiting = seatsToAct(t.game)
    if (waiting.length === 0) {
      t.now = nextDeadline(t.game)!
      t.do('system', { type: 'tick' })
      continue
    }
    const seat = waiting[0]
    const view = viewFor(t.game, seat, 'full')
    if (phase.kind !== 'playing') {
      act(seat, chooseAction(view, mind(seat)), fallbackAction(view))
      continue
    }
    const decision = players[seat].act(view, mind(seat), mix(seed, copy, decisionIndex++, seat))
    if (decision.searched) record.decisions.push({ seat, label: players[seat].label, searched: decision.searched })
    act(seat, decision.action, fallbackAction(view))
  }
  throw new Error(`seed ${seed}: round did not finish`)
}

export interface PairRecord {
  seed: number
  /** Balls per round won by side A and side B, summed over both copies. */
  a: number
  b: number
  rounds: [RoundRecord, RoundRecord]
}

/** The same deal twice: A at seats 0 and 2, then A at seats 1 and 3. */
export function playPair(seed: number, a: Player, b: Player): PairRecord {
  const first = playRound(seed, [a, b, a, b], undefined, 0)
  const second = playRound(seed, [b, a, b, a], undefined, 1)
  return {
    seed,
    a: first.gained[0] + second.gained[1],
    b: first.gained[1] + second.gained[0],
    rounds: [first, second],
  }
}
