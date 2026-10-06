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
  /**
   * What else this seat's view, or a spectator's, must not show, such as a trump not yet revealed:
   * what is wrong with it, or null. Given the view the module produced, the one a client receives.
   */
  checkView?(game: G, seat: Seat | null, view: V): string | null
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
      const wrong = contract.checkView?.(game, seat, view) ?? null
      if (wrong !== null) fail(`the view for ${seat} ${wrong}`)
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

type Path = (string | number)[]

/** Values to try, in order, for a field of this schema; those the schema accepts are its valid values. */
function candidates(schema: z.ZodType, path: string, k: number): unknown[] {
  if (schema instanceof z.ZodOptional) return candidates(schema.unwrap() as z.ZodType, path, k)
  if (schema instanceof z.ZodLiteral) return [...schema.values]
  if (schema instanceof z.ZodEnum) return schema.options
  if (schema instanceof z.ZodBoolean) return [true, false]
  if (schema instanceof z.ZodString) return ['x']
  if (schema instanceof z.ZodNumber) return [schema.minValue, 0, 1, 2, 3, 4, 5, 10, 25, 50, 100].filter(Number.isFinite)
  if (schema instanceof z.ZodUnion) return (schema.options as z.ZodType[]).flatMap((option) => candidates(option, path, k))
  if (schema instanceof z.ZodObject) {
    const fields = Object.entries(schema.shape as Record<string, z.ZodType>)
    return [Object.fromEntries(fields.map(([key, field]) => [key, valid(field, `${path}.${key}`, k)]))]
  }
  if (schema instanceof z.ZodArray) {
    // Each element a different valid value where it can be, as a pass of three cards would be.
    const element = (i: number) => valid(schema.element as z.ZodType, `${path}.${i}`, k + i)
    return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 0].map((length) => Array.from({ length }, (_, i) => element(i)))
  }
  // The check never quietly tests less: a shape it cannot read, even one branch of a union, is refused.
  throw new Error(`checkMalformed cannot read ${path}: an unsupported schema`)
}

/** The `k`th valid value of a field, counting round its valid values, or an error naming the field. */
function valid(schema: z.ZodType, path: string, k: number): unknown {
  const found = candidates(schema, path, k).filter((value) => schema.safeParse(value).success)
  if (found.length === 0) throw new Error(`checkMalformed cannot build a valid ${path}: an unsupported schema`)
  return found[k % found.length]
}

/** Whether a field has fields of its own: an object, an array, or a union with such a shape. */
function structured(schema: z.ZodType): boolean {
  const inner = schema instanceof z.ZodOptional ? (schema.unwrap() as z.ZodType) : schema
  if (inner instanceof z.ZodUnion) return (inner.options as z.ZodType[]).some(structured)
  return inner instanceof z.ZodObject || inner instanceof z.ZodArray
}

/** How many valid actions it takes for every value of every enumerated field to appear in one. */
function variety(schema: z.ZodType): number {
  if (schema instanceof z.ZodOptional) return variety(schema.unwrap() as z.ZodType)
  if (schema instanceof z.ZodEnum) return schema.options.length
  if (schema instanceof z.ZodBoolean) return 2
  if (schema instanceof z.ZodUnion) return (schema.options as z.ZodType[]).reduce((n, option) => n + variety(option), 0)
  if (schema instanceof z.ZodObject) return Math.max(1, ...Object.values(schema.shape as Record<string, z.ZodType>).map(variety))
  if (schema instanceof z.ZodArray) return variety(schema.element as z.ZodType)
  return 1
}

/** A copy of an action with the field at `path` changed by `change`, which is given its parent and key. */
function edited(action: object, path: Path, change: (parent: Record<string | number, unknown>, key: string | number) => void): object {
  const copy = structuredClone(action) as Record<string | number, unknown>
  const parent = path.slice(0, -1).reduce((at, key) => at[key] as Record<string | number, unknown>, copy)
  change(parent, path[path.length - 1])
  return copy
}

/**
 * Every field under `path` of a valid action: each is given every wrong value, then left out (an
 * array element removed), with every other field kept valid. Recurses into object fields, each
 * element of an array, and each shape of a union that has fields, set valid in its place first.
 * Adds the probes to `probes` and returns the fields' paths.
 */
function mutations(schema: z.ZodType, value: unknown, action: object, path: Path, name: string, probes: unknown[]): string[] {
  const inner = schema instanceof z.ZodOptional ? (schema.unwrap() as z.ZodType) : schema
  if (inner instanceof z.ZodUnion) {
    return (inner.options as z.ZodType[]).filter(structured).flatMap((shape) => {
      const shaped = valid(shape, [name, ...path].join('.'), 0)
      const whole = edited(action, path, (parent, last) => void (parent[last] = shaped))
      probes.push(whole)
      return mutations(shape, shaped, whole, path, name, probes)
    })
  }
  const children: [string | number, z.ZodType][] =
    inner instanceof z.ZodObject
      ? Object.entries(inner.shape as Record<string, z.ZodType>).filter(([key]) => path.length > 0 || key !== 'type')
      : inner instanceof z.ZodArray
        ? (value as unknown[]).map((_, i) => [i, inner.element as z.ZodType])
        : []
  return children.flatMap(([key, child]) => {
    const at = [...path, key]
    for (const wrong of WRONG) probes.push(edited(action, at, (parent, last) => void (parent[last] = wrong)))
    probes.push(edited(action, at, (parent, last) => void (Array.isArray(parent) ? parent.splice(last as number, 1) : delete parent[last])))
    return [[name, ...at].join('.'), ...mutations(child, (value as Record<string | number, unknown>)[key], action, at, name, probes)]
  })
}

/**
 * Every action type a client may send, read from the module's schema: as complete valid actions,
 * enough of them that every value of every enumerated field appears in one, then each with one
 * field, one field of a field or one array element at a time given a wrong value or left out, its
 * siblings kept valid. Then the system's own actions with wrong fields, as anyone might send them.
 * Refuses a schema it cannot read whole.
 */
function malformedActions(schema: z.ZodType): { names: string[]; paths: string[]; actions: unknown[] } {
  if (!(schema instanceof z.ZodDiscriminatedUnion)) throw new Error('checkMalformed: an action schema is a discriminated union on type')
  const out = { names: [] as string[], paths: [] as string[], actions: [] as unknown[] }
  for (const option of schema.options as z.ZodType[]) {
    const type = option instanceof z.ZodObject ? (option.shape as Record<string, z.ZodType>).type : undefined
    const names = type instanceof z.ZodLiteral ? [...type.values] : []
    if (names.length !== 1 || typeof names[0] !== 'string') throw new Error('checkMalformed: each action names its type with a discriminator of one string')
    const name = names[0]
    out.names.push(name)
    const bases = new Map<string, object>()
    for (let k = 0; k < variety(option); k++) {
      const action = valid(option, name, k) as object
      if (!schema.safeParse(action).success) throw new Error(`checkMalformed cannot build a valid ${name}: an unsupported schema`)
      bases.set(JSON.stringify(action), action)
    }
    const paths = new Set<string>()
    for (const action of bases.values()) {
      out.actions.push(action)
      for (const path of mutations(option, action, action, [], name, out.actions)) paths.add(path)
    }
    out.paths.push(...paths)
  }
  out.actions.push({ type: 'tick' })
  for (const value of WRONG) out.actions.push({ type: 'setConnected', seat: value, connected: false }, { type: 'setConnected', seat: 0, connected: value })
  return out
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
 * refused; and every action type, valid and then with one field at a time wrong or missing; from
 * every seat, a seat outside the table, a spectator and the system. Throws on a breach; returns
 * the states, action types and field paths it covered.
 */
export function checkMalformed<G extends TableState, A, E, V extends TableView>(
  module: GameModule<G, A, E, V>,
  seed = 1,
): { states: string[]; actions: string[]; paths: string[] } {
  const rng = seededRng(seed)
  let now = 1_000_000
  const ctx = (): Ctx => ({ now, rng })
  const fail = (message: string): never => {
    throw new Error(`${module.id}: ${message}`)
  }
  const malformed = malformedActions(module.actionSchema)
  const states: string[] = []

  const tryAll = (game: G, label: string) => {
    deepFreeze(game)
    const actors: Actor[] = [...allSeats(game.playerCount), game.playerCount, -1, 1.5, null, 'system']
    for (const actor of actors) {
      for (const message of [...NOT_ACTIONS, ...malformed.actions]) {
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
    states.push(label)
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
  return { states, actions: malformed.names, paths: malformed.paths }
}
