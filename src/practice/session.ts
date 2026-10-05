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

export const SEEN_KEY = 'thunee-coach-seen'
const LOG_LIMIT = 60

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface CoachState {
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
  /** Opens or closes a sheet the player is reading; the table waits while one is open. */
  setReading(open: boolean): void
  restart(playerCount: 2 | 4): void
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
  const playback = new Playback((message, receivedAt) => store.receive(message, receivedAt))
  let version = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let reading = false
  let closed = false

  const listeners = new Set<() => void>()
  let state: CoachState = {
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
    if (state.topic !== null) return state.topic
    const already = seen()
    const view = game.coachView()
    for (const e of events) {
      const fresh = topicsFor(view, e).find((t) => !already.has(t))
      if (fresh) return fresh
    }
    return null
  }

  const sheetOpen = () => reading || state.topic !== null || state.warning !== null

  /** Recomputes everything derived from the game and re-arms the clock. */
  const refresh = (events: readonly GameEvent[]) => {
    const view = game.coachView()
    const said = events.map((e) => narrate(e, view)).filter((n): n is Note => n !== null)
    // A finished round shows its review, however the screen got here (including a reload).
    const over = view.phase.kind === 'roundResult' || view.phase.kind === 'gameOver' ? view.phase.summary : null
    const newRound = events.some((e) => e.type === 'dealt' && e.half === 1)
    const log = newRound ? said.reverse() : [...said.reverse(), ...state.log].slice(0, LOG_LIMIT)
    const topic = nextTopic([...events, null])
    update({
      log,
      latest: said.length > 0 ? log[0] : state.latest,
      situation: situation(view),
      advice: advise(view),
      showHint: false,
      topic,
      trickPaused: view.phase.kind === 'trickPause' && game.waiting(false),
      review: over ? (state.review ?? review({ decisions: game.round.decisions, summary: over, dealt: game.round.dealt, you: game.you, view })) : null,
      dealt: over ? game.round.dealt.map((half) => half.map((hand) => [...hand])) : null,
    })
    update({ waiting: game.waiting(sheetOpen()) })
    arm()
  }

  const publish = (events: NumberedEvent[]) => {
    playback.push({ type: 'sync', version: ++version, now: game.virtualNow, seat: game.you, view: game.view(), events })
    storage.setItem(PRACTICE_KEY, game.save())
    refresh(events)
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
      update({ warning: { note: warning!, action } })
      update({ waiting: true })
      clearTimeout(timer)
      return
    }
    apply(action)
  }

  const doContinue = () => {
    game.continueTrick()
    update({ trickPaused: false })
    publish(game.advance(0, sheetOpen()).events)
  }

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
      refresh([])
    },
    dismissTopic() {
      if (state.topic === null) return
      const already = seen()
      already.add(state.topic)
      storage.setItem(SEEN_KEY, JSON.stringify([...already]))
      update({ topic: null })
      update({ topic: nextTopic(isNew && version <= 1 ? [opening(), null] : [null]) })
      refresh([])
    },
    continueTrick() {
      const warning = check(game.coachView(), { type: 'tick' })
      if (shouldHold(warning)) {
        update({ warning: { note: warning!, action: { type: 'tick' } }, waiting: true })
        return
      }
      doContinue()
    },
    setReading(open) {
      reading = open
      update({ waiting: game.waiting(sheetOpen()) })
      arm()
    },
    restart(n) {
      clearTimeout(timer)
      game = PracticeGame.start(n, newSeed(), 'You')
      update({ log: [], latest: null, review: null, dealt: null, warning: null, topic: null })
      playback.push({ type: 'sync', version: ++version, now: game.virtualNow, seat: game.you, view: game.view(), events: [] })
      storage.setItem(PRACTICE_KEY, game.save())
      opened()
    },
  }

  /** The deal that started a new game happened before anyone was listening; narrate it now. */
  const opening = (): GameEvent => ({ type: 'dealt', roundNumber: game.game.roundNumber, dealer: game.game.dealer, half: 1 })
  const opened = () => {
    const first = narrate(opening(), game.coachView())
    update({ log: first ? [first] : [], latest: first })
    update({ topic: nextTopic([opening(), null]) })
    refresh([])
  }

  store.setConnection('open')
  playback.push({ type: 'sync', version: ++version, now: game.virtualNow, seat: game.you, view: game.view(), events: [] })
  storage.setItem(PRACTICE_KEY, game.save())
  if (isNew) opened()
  else refresh([])

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
