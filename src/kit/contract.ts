/**
 * The contract every game module keeps, checked by a seeded simulation of
 * whole games: one human seat playing legal moves, computers driven only
 * through `dueStep` and `reactions`, deadlines through ticks, and a little
 * mischief. For tests; not used by the app.
 */
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
