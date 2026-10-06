/**
 * A practice game behind the same `Session` the table uses online, plus the coach's state.
 * The browser stands in for the server: it applies actions, drives computers and keeps time.
 * Any game with a `GamePractice` can be practised; what is said comes from its coach.
 */
import type { Session } from '../client/connection'
import { Playback } from '../client/playback'
import { GameStore } from '../client/store'
import type { TableState, TableView } from '../kit/table'
import type { NumberedEvent } from '../protocol'
import type { GamePractice, Note, RoundLog, TopicOf } from './contract'
import { PracticeGame, practiceKey } from './game'

/** The topics the player has dismissed for a game, on this device. */
export function seenKey(game: string): string {
  return `tricks-${game}-coach-seen`
}

const LOG_LIMIT = 60

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface CoachState<A, N extends Note, D> {
  /** The table sync this describes; always the one the table is showing. */
  version: number
  /** Whether the table is waiting on the player; countdowns stand still while it is. */
  waiting: boolean
  situation: N | null
  /** The suggestion for the current decision, shown only after Hint. */
  advice: { note: N; action: A } | null
  showHint: boolean
  /** The newest narration line, for the strip. */
  latest: N | null
  /** Everything said this round, newest first. */
  log: N[]
  warning: { note: N; action: A } | null
  topic: TopicOf<N> | null
  /** Set when a round has just been scored. */
  review: N[] | null
  /** The round's deals, for the review. */
  dealt: D[] | null
  /** The trick pause is waiting for Continue. */
  trickPaused: boolean
}

export interface Coach<A, N extends Note, D> {
  getState(): CoachState<A, N, D>
  subscribe(listener: () => void): () => void
  hint(): void
  /**
   * The coach's warning for an action the player is about to take, from their own view; null for
   * none. A table's hand words its confirmation of a rule-breaking card with it.
   */
  check(action: A): N | null
  confirm(): void
  cancel(): void
  dismissTopic(): void
  continueTrick(): void
  /** Opens or closes a sheet the player is reading, by name; the table waits while any is open. */
  setReading(source: string, open: boolean): void
  restart(playerCount: number): void
}

interface Snapshot<A, N extends Note, D> {
  said: N[]
  newRound: boolean
  rest: Partial<CoachState<A, N, D>>
}

export interface PracticeSession<V, A, E, N extends Note, D> extends Session<V, A, E> {
  coach: Coach<A, N, D>
}

export interface PracticeOptions {
  /** Start a new game with this many players, or null to continue the saved one. */
  playerCount: number | null
  storage?: Store
  seed?: number
}

/** The rule-breaking card is confirmed in the hand itself, so only the other warnings hold an action. */
export function shouldHold(note: Note | null): boolean {
  return note !== null && note.rule !== 'illegal'
}

export function openPracticeSession<G extends TableState, A extends { type: string }, E, V extends TableView, N extends Note, D, S>(
  practice: GamePractice<G, A, E, V, N, D, S>,
  /** How long one of the game's events holds the screen. */
  dwell: (event: E) => number,
  { playerCount, storage = localStorage, seed }: PracticeOptions,
): PracticeSession<V, A, E, N, D> {
  const { coach: tutor, module } = practice
  const savedKey = practiceKey(module.id)
  const topicsKey = seenKey(module.id)
  const newSeed = () => seed ?? crypto.getRandomValues(new Uint32Array(1))[0]
  const saved = playerCount === null ? PracticeGame.load(practice, storage.getItem(savedKey)) : null
  let game = saved ?? PracticeGame.start(practice, playerCount ?? module.createGame().playerCount, newSeed(), 'You')
  const isNew = saved === null

  const store = new GameStore<V, E>()
  /** Coach snapshots waiting for the table sync they describe, by version. */
  const pending = new Map<number, Snapshot<A, N, D>>()
  const playback = new Playback<V, E>((message, receivedAt) => {
    store.receive(message, receivedAt)
    if (message.type === 'sync') show(message.version)
  }, dwell)
  let version = 0
  /** Event numbers keep rising across restarts, so the store never mistakes new events for old. */
  let eventN = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  /** Sheets the player is reading, by name; any one holds the clock. */
  const holds = new Set<string>()
  /** The topic and warning hold the clock from the moment they are decided, before they are drawn. */
  let topic: TopicOf<N> | null = null
  /** The review of the round whose log it read; a round's result is reviewed once. */
  let reviewed: { round: RoundLog<V, A, D>; notes: N[] } | null = null
  let closed = false

  const listeners = new Set<() => void>()
  let state: CoachState<A, N, D> = {
    version: 0,
    waiting: false,
    situation: null,
    advice: null,
    showHint: false,
    latest: null,
    log: [],
    warning: null,
    topic: null,
    review: null,
    dealt: null,
    trickPaused: false,
  }
  const update = (patch: Partial<CoachState<A, N, D>>) => {
    state = { ...state, ...patch }
    for (const l of listeners) l()
  }

  const seen = (): Set<string> => {
    try {
      return new Set(JSON.parse(storage.getItem(topicsKey) ?? '[]') as string[])
    } catch {
      return new Set()
    }
  }
  const nextTopic = (events: readonly (E | null)[]): TopicOf<N> | null => {
    if (topic !== null) return topic
    const already = seen()
    const view = game.coachView()
    for (const e of events) {
      const fresh = tutor.topicsFor(view, e).find((t) => !already.has(t))
      if (fresh) return fresh
    }
    return null
  }

  const sheetOpen = () => holds.size > 0 || topic !== null || state.warning !== null

  /** What the coach says about the game as it stands now, to be shown with the matching table sync. */
  const snapshot = (events: readonly E[]): Snapshot<A, N, D> => {
    const view = game.coachView()
    const over = practice.summary(view)
    if (over !== null && reviewed?.round !== game.round) {
      reviewed = { round: game.round, notes: tutor.review({ decisions: game.round.decisions, summary: over, dealt: game.round.dealt, you: game.you, view }) }
    }
    return {
      said: events.map((e) => tutor.narrate(e, view)).filter((n): n is N => n !== null),
      newRound: practice.roundBegins(events),
      rest: {
        situation: tutor.situation(view),
        advice: tutor.advise(view),
        showHint: false,
        trickPaused: game.paused(),
        review: over !== null ? reviewed!.notes : null,
        dealt: over !== null ? structuredClone(game.round.dealt) : null,
      },
    }
  }

  /** Brings the coach up to the table sync being shown, in order, so it never speaks ahead of the table. */
  const show = (shown: number) => {
    for (const v of [...pending.keys()].sort((a, b) => a - b)) {
      if (v > shown) break
      const snap = pending.get(v)!
      pending.delete(v)
      const said = [...snap.said].reverse()
      const log = snap.newRound ? said : [...said, ...state.log].slice(0, LOG_LIMIT)
      update({ ...snap.rest, version: v, log, latest: said.length > 0 ? log[0] : state.latest, topic })
    }
  }

  /** Sends the table a view, with the coach's words for it. */
  const sync = (events: readonly E[], snap: Snapshot<A, N, D> | null) => {
    version++
    pending.set(version, snap ?? { said: [], newRound: false, rest: {} })
    const numbered: NumberedEvent<E>[] = events.map((e) => ({ ...e, n: ++eventN }))
    playback.push({ type: 'sync', version, now: game.virtualNow, seat: game.you, view: game.view(), events: numbered })
  }

  /** After anything that changes what holds the clock: restart its display if it resumed, and re-arm it. */
  const holdsChanged = () => {
    const was = state.waiting
    const now = game.waiting(sheetOpen())
    update({ waiting: now })
    // Countdowns run on real time from the last sync; time spent waiting must not count against them.
    if (was && !now) sync([], null)
    arm()
  }

  const publish = (events: readonly E[], extra: E[] = []) => {
    topic = nextTopic([...extra, ...events, null])
    const snap = snapshot(events)
    if (extra.length > 0) {
      snap.said = [...extra.map((e) => tutor.narrate(e, game.coachView())).filter((n): n is N => n !== null), ...snap.said]
      snap.newRound = true
    }
    sync(events, snap)
    storage.setItem(savedKey, game.save())
    update({ waiting: game.waiting(sheetOpen()) })
    arm()
  }

  const arm = () => {
    clearTimeout(timer)
    if (closed || game.waiting(sheetOpen())) return
    const ms = game.nextIn()
    if (ms === null) return
    timer = setTimeout(() => {
      if (!closed) publish(game.advance(ms, sheetOpen()).events)
    }, ms)
  }

  const apply = (action: A) => {
    const advised = tutor.advise(game.coachView())?.action ?? null
    const result = game.act(action, advised)
    if ('rejected' in result) {
      playback.push({ type: 'rejected', reason: result.rejected })
      return
    }
    publish(result.events)
  }

  const send = (action: A) => {
    playback.release()
    const warning = tutor.check(game.coachView(), action)
    if (shouldHold(warning)) {
      update({ warning: { note: warning!, action }, waiting: true })
      clearTimeout(timer)
      return
    }
    apply(action)
  }

  const doContinue = () => {
    playback.release()
    game.continueTrick()
    update({ trickPaused: false })
    publish(game.advance(0, sheetOpen()).events)
  }

  /** The deal that starts a game happens before anyone is listening; it is narrated when the game opens. */
  const opening = (): E[] => {
    const event = practice.opening(game.game)
    return event === null ? [] : [event]
  }
  const untouched = () => practice.opening(game.game) !== null && game.round.decisions.length === 0

  const coach: Coach<A, N, D> = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    hint: () => update({ showHint: true }),
    check: (action) => tutor.check(game.coachView(), action),
    confirm() {
      const held = state.warning
      if (!held) return
      update({ warning: null })
      if (held.action.type === 'tick') doContinue()
      else apply(held.action)
    },
    cancel() {
      update({ warning: null })
      holdsChanged()
    },
    dismissTopic() {
      if (topic === null) return
      const already = seen()
      already.add(topic)
      storage.setItem(topicsKey, JSON.stringify([...already]))
      topic = null
      topic = nextTopic(untouched() ? [...opening(), null] : [null])
      update({ topic })
      holdsChanged()
    },
    continueTrick() {
      // Continuing past a pause is checked as the system's tick, which every game's actions include.
      const tick = game.table({ type: 'tick' })
      const warning = tutor.check(game.coachView(), tick)
      if (shouldHold(warning)) {
        update({ warning: { note: warning!, action: tick }, waiting: true })
        clearTimeout(timer)
        return
      }
      doContinue()
    },
    setReading(source, open) {
      if (open) holds.add(source)
      else holds.delete(source)
      holdsChanged()
    },
    restart(n) {
      clearTimeout(timer)
      playback.reset()
      pending.clear()
      game = PracticeGame.start(practice, n, newSeed(), 'You')
      topic = null
      reviewed = null
      update({ log: [], latest: null, warning: null, showHint: false })
      publish([], opening())
    },
  }

  store.setConnection('open')
  if (isNew) publish([], opening())
  else {
    // A game reopened before anything was played still owes its opening lessons.
    topic = nextTopic(untouched() ? [...opening(), null] : [null])
    publish([])
  }

  return {
    store,
    send,
    close() {
      closed = true
      clearTimeout(timer)
      playback.reset()
    },
    coach,
  }
}
