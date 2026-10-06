/**
 * The contract every game module keeps, checked by a seeded simulation of
 * whole games: one human seat playing legal moves, computers driven only
 * through `dueStep` and `reactions`, deadlines through ticks, and a little
 * mischief; and by `checkMalformed`, which needs only the module. For tests;
 * not used by the app.
 */
import { z } from 'zod'
import { type Card, cardId } from './cards'
import type { GameModule } from './module'
import { type Actor, type Ctx, type Seat, type TableState, type TableView, allSeats, isAiControlled } from './table'
import { collectCards, deepFreeze, seededRng } from './testing'

/** Where an action came from. Only mischief may be refused. */
export type Source = 'player' | 'computer' | 'system' | 'mischief'

export interface Contract<G extends TableState, A, E, V extends TableView> {
  module: GameModule<G, A, E, V>
  /** A started game, usually one human at seat 0 and computers elsewhere. */
  start(ctx: Ctx): G
  /** A legal action for a human seat that may act now, including moving on between rounds; null if it has none. Never refused. */
  legal(game: G, seat: Seat, rng: () => number): A | null
  /** Now and then, mischief: a rule-breaking card, or an accusation right or wrong. It may be refused. */
  mischief(game: G, rng: () => number): { actor: Seat; action: A } | null
  /** Cards that must never appear in this seat's view, or a spectator's. */
  hidden(game: G, seat: Seat | null): Card[]
  /** Keys that must never appear in any view. */
  secrets: readonly string[]
  /** The game's own checks after every applied action. Throws on a failure. */
  check?(game: G, events: readonly E[], step: { actor: Actor; action: A; source: Source }): void
}

export interface ContractRun<G> {
  game: G
  actions: number
  mischief: number
  refused: number
}

/** Plays one seeded game to its end, checking the contract after every applied action. Throws on any breach. */
export function runContract<G extends TableState, A, E, V extends TableView>(
  contract: Contract<G, A, E, V>,
  seed: number,
  maxSteps = 100_000,
): ContractRun<G> {
  const { module } = contract
  const rng = seededRng(seed)
  let now = 1_000_000
  const ctx = (): Ctx => ({ now, rng })
  const fail = (message: string): never => {
    throw new Error(`${module.id} seed ${seed}, ${game.phase.kind}: ${message}`)
  }
  let game = contract.start(ctx())
  const run: ContractRun<G> = { game, actions: 0, mischief: 0, refused: 0 }

  const checkViews = () => {
    for (const seat of [...allSeats(game.playerCount), null]) {
      const view = module.viewFor(game, seat)
      const hidden = new Set(contract.hidden(game, seat).map(cardId))
      const leaked = collectCards(view).filter((c) => hidden.has(cardId(c)))
      if (leaked.length > 0) fail(`the view for ${seat} leaks ${JSON.stringify(leaked)}`)
      const text = JSON.stringify(view)
      for (const secret of contract.secrets) if (text.includes(`"${secret}":`)) fail(`the view for ${seat} holds ${secret}`)
      if (game.phase.kind !== 'gameOver') {
        view.seats.forEach((s, i) => {
          if (game.seats[i].personaHidden && s.persona !== null) fail(`the view for ${seat} shows seat ${i}'s hidden persona`)
        })
      }
    }
  }

  const act = (actor: Actor, action: A, source: Source): boolean => {
    if (actor !== 'system' && !module.actionSchema.safeParse(action).success) fail(`${JSON.stringify(action)} is not a valid message`)
    const result = module.apply(deepFreeze(game), actor, action, ctx())
    if ('rejected' in result) {
      if (source !== 'mischief') fail(`${source} action ${JSON.stringify(action)} by ${actor} refused: ${result.rejected}`)
      return false
    }
    game = result.game
    run.actions++
    module.checkInvariants(game)
    checkViews()
    contract.check?.(game, result.events, { actor, action, source })
    // The host applies each computer's answer, with its own reactions, before asking the next.
    for (const ask of module.reactions(game, result.events)) {
      const step = ask(game)
      if (step !== null) act(step.actor, step.action, 'computer')
    }
    return true
  }

  for (let steps = 0; steps < maxSteps; steps++) {
    if (game.phase.kind === 'gameOver') {
      run.game = game
      return run
    }
    const mischief = contract.mischief(game, rng)
    if (mischief !== null) {
      run.mischief++
      if (!act(mischief.actor, mischief.action, 'mischief')) run.refused++
      continue
    }
    const ready = allSeats(game.playerCount)
      .filter((s) => !isAiControlled(game, s))
      .flatMap((s) => {
        const action = contract.legal(game, s, rng)
        return action === null ? [] : [{ seat: s, action }]
      })
    const due = module.nextDeadline(game)
    if (ready.length > 0 && (due === null || rng() < 0.5)) {
      const { seat, action } = ready[Math.floor(rng() * ready.length)]
      act(seat, action, 'player')
      continue
    }
    if (due === null) fail('nobody can act and nothing is due')
    now = Math.max(now, due!)
    const step = module.dueStep(game, now)
    if (step === null) fail(`nothing due at ${now}, the next deadline`)
    act(step!.actor, step!.action, step!.actor === 'system' ? 'system' : 'computer')
  }
  return fail(`the game did not finish in ${maxSteps} steps`)
}

// ── Malformed actions ────────────────────────────────────────────────────

/** Messages that are not an action at all, or name no action. Each must be refused. */
const NOT_ACTIONS: readonly unknown[] = [
  null,
  undefined,
  0,
  7,
  '',
  'start',
  true,
  Symbol('start'),
  () => 1,
  [],
  ['start'],
  {},
  { type: 5 },
  { type: null },
  { type: {} },
  { kind: 'start' },
  { type: 'nope' },
  { type: 'constructor' },
  { type: '__proto__' },
  { type: 'toString' },
]

/** Values of the wrong type for a field, or of no sensible value. */
const WRONG: readonly unknown[] = [undefined, null, true, -1, 1.5, Number.NaN, '', 'x', [], [null], {}]

/** Wrong values for a field, and for each field of an object field and each element of an array. */
function wrongFor(schema: z.ZodType, depth = 0): unknown[] {
  const inner = schema instanceof z.ZodOptional ? (schema.unwrap() as z.ZodType) : schema
  if (depth >= 2) return [...WRONG]
  if (inner instanceof z.ZodObject) {
    const fields = Object.entries(inner.shape as Record<string, z.ZodType>)
    return [...WRONG, ...fields.flatMap(([key, field]) => wrongFor(field, depth + 1).map((value) => ({ [key]: value })))]
  }
  if (inner instanceof z.ZodArray) return [...WRONG, ...wrongFor(inner.element as z.ZodType, depth + 1).map((value) => [value])]
  return [...WRONG]
}

/**
 * Every action type a client may send, read from the module's schema, with one field at a time
 * given a wrong value; and the system's own actions with wrong fields, as anyone might send them.
 */
function malformedActions(schema: z.ZodType): unknown[] {
  if (!(schema instanceof z.ZodDiscriminatedUnion)) throw new Error('an action schema is a discriminated union on type')
  const actions: unknown[] = []
  for (const option of schema.options as z.ZodObject[]) {
    const { type, ...fields } = option.shape as Record<string, z.ZodType>
    const name = (type as z.ZodLiteral).value
    for (const [key, field] of Object.entries(fields)) {
      for (const value of wrongFor(field)) actions.push({ type: name, [key]: value })
    }
  }
  actions.push({ type: 'tick' })
  for (const value of WRONG) actions.push({ type: 'setConnected', seat: value, connected: false }, { type: 'setConnected', seat: 0, connected: value })
  return actions
}

function describe(value: unknown): string {
  if (typeof value === 'symbol' || typeof value === 'function') return String(value)
  return JSON.stringify(value) ?? String(value)
}

/**
 * Whatever anyone sends, `apply` refuses or applies it and never throws. Builds the module's own
 * games through table actions at every seat count, lets its computers play every seat (seat 0 is
 * stood in for) until nothing is due, and in an empty lobby, a full one and the first state of
 * every phase reached, applies to a frozen game: messages that are not actions, which must be
 * refused; and every action type with a wrong field; from every seat, a seat outside the table,
 * a spectator and the system. Throws on a breach; returns the states it covered.
 */
export function checkMalformed<G extends TableState, A, E, V extends TableView>(module: GameModule<G, A, E, V>, seed = 1): string[] {
  const rng = seededRng(seed)
  let now = 1_000_000
  const ctx = (): Ctx => ({ now, rng })
  const fail = (message: string): never => {
    throw new Error(`${module.id}: ${message}`)
  }
  const malformed = malformedActions(module.actionSchema)
  const covered: string[] = []

  const tryAll = (game: G, label: string) => {
    deepFreeze(game)
    const actors: Actor[] = [...allSeats(game.playerCount), game.playerCount, -1, 1.5, null, 'system']
    for (const actor of actors) {
      for (const message of [...NOT_ACTIONS, ...malformed]) {
        let result: ReturnType<typeof module.apply>
        try {
          result = module.apply(game, actor, message as A, ctx())
        } catch (error) {
          return fail(`${describe(message)} by ${actor} in ${label} threw ${error}`)
        }
        if (NOT_ACTIONS.includes(message) && !('rejected' in result)) fail(`${describe(message)} by ${actor} in ${label} was applied`)
        if (!('rejected' in result) && !('game' in result)) fail(`${describe(message)} by ${actor} in ${label} returned ${describe(result)}`)
      }
    }
    covered.push(label)
  }

  const must = (game: G, actor: Actor, action: unknown): G => {
    const result = module.apply(game, actor, action as A, ctx())
    return 'rejected' in result ? fail(`setup ${describe(action)} refused: ${result.rejected}`) : result.game
  }
  /** Applies an action and every computer reaction to it, as a host does; null if refused. */
  const play = (game: G, actor: Actor, action: A): G | null => {
    const result = module.apply(game, actor, action, ctx())
    if ('rejected' in result) return null
    let next = result.game
    for (const ask of module.reactions(next, result.events)) {
      const reaction = ask(next)
      if (reaction !== null) next = play(next, reaction.actor, reaction.action) ?? next
    }
    return next
  }

  tryAll(module.createGame(), 'an empty lobby')
  for (const count of module.seatCounts) {
    let game = must(module.createGame(), null, { type: 'sit', seat: 0, name: 'You' })
    if (game.playerCount !== count) game = must(game, 0, { type: 'setPlayerCount', playerCount: count })
    for (const seat of allSeats(count).slice(1)) game = must(game, 0, { type: 'addAi', seat })
    tryAll(game, `a full lobby of ${count}`)
    game = must(game, 0, { type: 'start' })
    // Computers play seat 0 too; telling the table it left settles who acts next.
    game = { ...game, seats: game.seats.map((s, i) => (i === 0 ? { ...s, standIn: true } : s)) }
    game = must(game, 'system', { type: 'setConnected', seat: 0, connected: false })
    const seen = new Set<string>()
    for (let steps = 0; steps < 10_000; steps++) {
      if (!seen.has(game.phase.kind)) {
        seen.add(game.phase.kind)
        tryAll(game, `${game.phase.kind} with ${count}`)
      }
      // A round's result waits for a person, so the computers stop there.
      const due = module.nextDeadline(game)
      if (due === null) break
      now = Math.max(now, due)
      const step = module.dueStep(game, now)
      if (step === null) break
      const next = play(game, step.actor, step.action) ?? (step.fallback === undefined ? null : play(game, step.actor, step.fallback))
      game = next ?? fail(`${describe(step.action)} by ${step.actor} in ${game.phase.kind} refused`)
    }
  }
  return covered
}
