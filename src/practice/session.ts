/**
 * A practice game behind the same `Session` the table uses online, plus the coach's state.
 * The browser stands in for the server: it applies actions, drives computers and keeps time.
 */
import type { Session } from '../client/connection'
import { Playback } from '../client/playback'
import { GameStore } from '../client/store'
import { type Advice, advise } from '../coach/advise'
import { check } from '../coach/check'
import { narrate } from '../coach/narrate'
import type { Note, TopicId } from '../coach/note'
import { review } from '../coach/review'
import { situation } from '../coach/situation'
import { topicsFor } from '../coach/topics'
import type { Action, Card, GameEvent } from '../engine'
import type { NumberedEvent } from '../protocol'
import { PRACTICE_KEY, PracticeGame } from './game'

export const SEEN_KEY = 'tricks-thunee-coach-seen'
const LOG_LIMIT = 60

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface CoachState {
  /** The table sync this describes; always the one the table is showing. */
  version: number
  /** Whether the table is waiting on the player; countdowns stand still while it is. */
  waiting: boolean
  situation: Note | null
  /** The suggestion for the current decision, shown only after Hint. */
  advice: Advice | null
  showHint: boolean
  /** The newest narration line, for the strip. */
  latest: Note | null
  /** Everything said this round, newest first. */
  log: Note[]
  warning: { note: Note; action: Action } | null
  topic: TopicId | null
  /** Set when a round has just been scored. */
  review: Note[] | null
  dealt: Card[][][] | null
  /** The trick pause is waiting for Continue. */
  trickPaused: boolean
}

export interface Coach {
  getState(): CoachState
  subscribe(listener: () => void): () => void
  hint(): void
  confirm(): void
  cancel(): void
  dismissTopic(): void
  continueTrick(): void
  /** Opens or closes a sheet the player is reading, by name; the table waits while any is open. */
  setReading(source: string, open: boolean): void
  restart(playerCount: 2 | 4): void
}

interface Snapshot {
  said: Note[]
  newRound: boolean
  rest: Partial<CoachState>
}

export interface PracticeSession extends Session {
  coach: Coach
}

export interface PracticeOptions {
  /** Start a new game with this many players, or null to continue the saved one. */
  playerCount: 2 | 4 | null
  storage?: Store
  seed?: number
}

/** The rule-breaking card is confirmed in the hand itself, so only the other warnings hold an action. */
export function shouldHold(note: Note | null): boolean {
  return note !== null && note.rule !== 'illegal'
}

export function openPracticeSession({ playerCount, storage = localStorage, seed }: PracticeOptions): PracticeSession {
  const newSeed = () => seed ?? crypto.getRandomValues(new Uint32Array(1))[0]
  const saved = playerCount === null ? PracticeGame.load(storage.getItem(PRACTICE_KEY)) : null
  let game = saved ?? PracticeGame.start(playerCount ?? 4, newSeed(), 'You')
  const isNew = saved === null

  const store = new GameStore()
  /** Coach snapshots waiting for the table sync they describe, by version. */
  const pending = new Map<number, Snapshot>()
  const playback = new Playback((message, receivedAt) => {
    store.receive(message, receivedAt)
    if (message.type === 'sync') show(message.version)
  })
  let version = 0
  /** Event numbers keep rising across restarts, so the store never mistakes new events for old. */
  let eventN = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  /** Sheets the player is reading, by name; any one holds the clock. */
  const holds = new Set<string>()
  /** The topic and warning hold the clock from the moment they are decided, before they are drawn. */
  let topic: TopicId | null = null
  let reviewed: { round: number; notes: Note[] } | null = null
  let closed = false

  const listeners = new Set<() => void>()
  let state: CoachState = {
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
  const update = (patch: Partial<CoachState>) => {
    state = { ...state, ...patch }
    for (const l of listeners) l()
  }

  const seen = (): Set<TopicId> => {
    try {
      return new Set(JSON.parse(storage.getItem(SEEN_KEY) ?? '[]') as TopicId[])
    } catch {
      return new Set()
    }
  }
  const nextTopic = (events: readonly (GameEvent | null)[]): TopicId | null => {
    if (topic !== null) return topic
    const already = seen()
    const view = game.coachView()
    for (const e of events) {
      const fresh = topicsFor(view, e).find((t) => !already.has(t))
      if (fresh) return fresh
    }
    return null
  }

  const sheetOpen = () => holds.size > 0 || topic !== null || state.warning !== null

  /** What the coach says about the game as it stands now, to be shown with the matching table sync. */
  const snapshot = (events: readonly GameEvent[]): Snapshot => {
    const view = game.coachView()
    const over = view.phase.kind === 'roundResult' || view.phase.kind === 'gameOver' ? view.phase.summary : null
    if (over && reviewed?.round !== over.roundNumber) {
      reviewed = { round: over.roundNumber, notes: review({ decisions: game.round.decisions, summary: over, dealt: game.round.dealt, you: game.you, view }) }
    }
    return {
      said: events.map((e) => narrate(e, view)).filter((n): n is Note => n !== null),
      newRound: events.some((e) => e.type === 'dealt' && e.half === 1),
      rest: {
        situation: situation(view),
        advice: advise(view),
        showHint: false,
        trickPaused: view.phase.kind === 'trickPause' && game.waiting(false),
        review: over ? reviewed!.notes : null,
        dealt: over ? game.round.dealt.map((half) => half.map((hand) => [...hand])) : null,
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
  const sync = (events: readonly GameEvent[], snap: Snapshot | null) => {
    version++
    pending.set(version, snap ?? { said: [], newRound: false, rest: {} })
    const numbered: NumberedEvent[] = events.map((e) => ({ ...e, n: ++eventN }))
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

  const publish = (events: readonly GameEvent[], extra: GameEvent[] = []) => {
    topic = nextTopic([...extra, ...events, null])
    const snap = snapshot(events)
    if (extra.length > 0) {
      snap.said = [...extra.map((e) => narrate(e, game.coachView())).filter((n): n is Note => n !== null), ...snap.said]
      snap.newRound = true
    }
    sync(events, snap)
    storage.setItem(PRACTICE_KEY, game.save())
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

  const apply = (action: Action) => {
    const advised = advise(game.coachView())?.action ?? null
    const result = game.act(action, advised)
    if ('rejected' in result) {
      playback.push({ type: 'rejected', reason: result.rejected })
      return
    }
    publish(result.events)
  }

  const send = (action: Action) => {
    playback.release()
    const warning = check(game.coachView(), action)
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
  const opening = (): GameEvent => ({ type: 'dealt', roundNumber: game.game.roundNumber, dealer: game.game.dealer, half: 1 })
  const untouched = () => game.game.roundNumber === 1 && game.round.decisions.length === 0

  const coach: Coach = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    hint: () => update({ showHint: true }),
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
      storage.setItem(SEEN_KEY, JSON.stringify([...already]))
      topic = null
      topic = nextTopic(untouched() ? [opening(), null] : [null])
      update({ topic })
      holdsChanged()
    },
    continueTrick() {
      const warning = check(game.coachView(), { type: 'tick' })
      if (shouldHold(warning)) {
        update({ warning: { note: warning!, action: { type: 'tick' } }, waiting: true })
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
      game = PracticeGame.start(n, newSeed(), 'You')
      topic = null
      reviewed = null
      update({ log: [], latest: null, warning: null, showHint: false })
      publish([], [opening()])
    },
  }

  store.setConnection('open')
  if (isNew) publish([], [opening()])
  else {
    // A game reopened before anything was played still owes its opening lessons.
    topic = nextTopic(untouched() ? [opening(), null] : [null])
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
