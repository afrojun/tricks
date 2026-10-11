/**
 * A practice game behind the same `Session` the table uses online, plus the coach's state.
 * The browser stands in for the server: it applies actions, drives computers and keeps time.
 * Any game with a `GamePractice` can be practised; what is said comes from its coach.
 */
import type { Session } from '../client/connection'
import { pace } from '../client/pace'
import { Playback } from '../client/playback'
import { GameStore } from '../client/store'
import { TalkStore } from '../client/talk'
import { type Said, type Say, answerThrow } from '../kit/talk'
import type { TableState, TableView } from '../kit/table'
import type { NumberedEvent } from '../protocol'
import { DRILL_OVER, type Drill, type GamePractice, type Note, type RoundLog, type TopicOf, type Verdict } from './contract'
import { PracticeGame, practiceKey } from './game'

/** The topics the player has dismissed for a game, on this device. */
export function seenKey(game: string): string {
  return `tricks-${game}-coach-seen`
}

/** The drills the player has passed in a game, on this device. */
export function drillsKey(game: string): string {
  return `tricks-${game}-drills`
}

/** The ids of the drills passed, from storage. */
export function passedDrills(game: string, storage: Pick<Storage, 'getItem'>): Set<string> {
  try {
    const ids: unknown = JSON.parse(storage.getItem(drillsKey(game)) ?? '[]')
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

/** A drill whose round ended before its moment came, which its own verdict did not foresee. */
const ROUND_OVER = { title: 'The round ended first', body: 'The round was over before the moment this drill is about. Try again.' }

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
  /** The drill being played, or null in an ordinary practice game. */
  drill: DrillState<N> | null
  /** The drill's line for the moment, shown before the coach's own. */
  guide: N | null
}

/** A drill as the screens show it: its brief until the player starts, and its verdict once its moment has passed. */
export interface DrillState<N extends Note> {
  id: string
  title: string
  brief: N
  briefing: boolean
  verdict: Verdict<N> | null
  /** The drill after this one, if any. */
  next: { id: string; title: string } | null
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
  /** Leaves any drill for a new practice game. */
  restart(playerCount: number): void
  /** Closes the drill's brief, so its clock can run. */
  startDrill(): void
  /** Starts a drill afresh: this one again, or another. */
  openDrill(id: string): void
}

interface Snapshot<A, N extends Note, D> {
  said: N[]
  newRound: boolean
  rest: Partial<CoachState<A, N, D>>
}

export interface PracticeSession<V extends TableView, A, E, N extends Note, D> extends Session<V, A, E> {
  coach: Coach<A, N, D>
}

export interface PracticeOptions {
  /** Start a new game with this many players, or null to continue the saved one. */
  playerCount: number | null
  /** A drill's id, to play it instead; it is never saved. */
  drill?: string
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
  { playerCount, drill: drillId, storage = localStorage, seed }: PracticeOptions,
): PracticeSession<V, A, E, N, D> {
  const { coach: tutor, module } = practice
  const savedKey = practiceKey(module.id)
  const topicsKey = seenKey(module.id)
  const newSeed = () => seed ?? crypto.getRandomValues(new Uint32Array(1))[0]
  const drillOf = (id: string | undefined): Drill<G, A, V, N> | null => practice.drills.find((d) => d.id === id) ?? null
  /** The drill in play: its brief holds the clock until the player starts, and its verdict stops the clock for good. */
  let drill = drillOf(drillId)
  let briefing = drill !== null
  let verdict: Verdict<N> | null = null
  const saved = playerCount === null && drill === null ? PracticeGame.load(practice, storage.getItem(savedKey)) : null
  let game = drill
    ? PracticeGame.drill(practice, drill, newSeed(), 'You')
    : (saved ?? PracticeGame.start(practice, playerCount ?? module.createGame().playerCount, newSeed(), 'You'))
  const isNew = saved === null

  const store = new GameStore<V, E>()
  const talk = new TalkStore()
  /** Coach snapshots waiting for the table sync they describe, by version. */
  const pending = new Map<number, Snapshot<A, N, D>>()
  const speed = pace()
  const playback = new Playback<V, E>((message, receivedAt) => {
    store.receive(message, receivedAt)
    if (message.type !== 'sync') return
    show(message.version)
    message.said?.forEach((said) => talk.receive(said))
  }, (event) => dwell(event) / speed)
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
    drill: null,
    guide: null,
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
    // A drill's brief stands in for the topics.
    if (drill !== null) return null
    const already = seen()
    const view = game.coachView()
    for (const e of events) {
      const fresh = tutor.topicsFor(view, e).find((t) => !already.has(t))
      if (fresh) return fresh
    }
    return null
  }

  const sheetOpen = () => holds.size > 0 || topic !== null || state.warning !== null || briefing || verdict !== null

  const drillState = (): DrillState<N> | null => {
    if (drill === null) return null
    const after = practice.drills[practice.drills.indexOf(drill) + 1]
    return { id: drill.id, title: drill.title, brief: drill.brief, briefing, verdict, next: after ? { id: after.id, title: after.title } : null }
  }

  /** Asks the drill whether its moment has passed, and keeps a pass. A round that ends first ends the drill. */
  const judge = () => {
    if (drill === null || verdict !== null) return
    const view = game.coachView()
    verdict = drill.verdict(view, game.round.decisions)
    if (verdict === null && practice.summary(view) !== null) verdict = { passed: false, note: { ...ROUND_OVER, tone: 'warn' } as N }
    if (verdict?.passed) storage.setItem(drillsKey(module.id), JSON.stringify([...passedDrills(module.id, storage).add(drill.id)]))
  }

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
        // Once a drill is over there is nothing left to advise.
        advice: verdict === null ? tutor.advise(view) : null,
        guide: drill !== null && verdict === null ? drill.guide(view) : null,
        drill: drillState(),
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
  const sync = (events: readonly E[], snap: Snapshot<A, N, D> | null, said: Said[] = []) => {
    version++
    pending.set(version, snap ?? { said: [], newRound: false, rest: {} })
    const numbered: NumberedEvent<E>[] = events.map((e) => ({ ...e, n: ++eventN }))
    playback.push({ type: 'sync', version, now: game.virtualNow, ...(speed > 1 && { rate: speed }), seat: game.you, view: game.view(), events: numbered, ...(said.length > 0 ? { said } : {}) })
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

  const publish = (events: readonly E[], extra: E[] = [], said: Said[] = []) => {
    topic = nextTopic([...extra, ...events, null])
    judge()
    const snap = snapshot(events)
    if (extra.length > 0) {
      snap.said = [...extra.map((e) => tutor.narrate(e, game.coachView())).filter((n): n is N => n !== null), ...snap.said]
      snap.newRound = true
    }
    sync(events, snap, said)
    if (drill === null) storage.setItem(savedKey, game.save())
    update({ waiting: game.waiting(sheetOpen()) })
    arm()
  }

  const arm = () => {
    clearTimeout(timer)
    if (closed || game.waiting(sheetOpen())) return
    const ms = game.nextIn()
    if (ms === null) return
    timer = setTimeout(() => {
      if (closed) return
      const advanced = game.advance(ms, sheetOpen())
      publish(advanced.events, [], advanced.said)
    }, ms / speed)
  }

  const apply = (action: A) => {
    const advised = tutor.advise(game.coachView())?.action ?? null
    const result = game.act(action, advised)
    if ('rejected' in result) {
      playback.push({ type: 'rejected', reason: result.rejected })
      return
    }
    publish(result.events, [], result.said)
  }

  const send = (action: A) => {
    // A drill is over once it has its verdict: the table stays as it ended, to be read.
    if (verdict !== null) {
      playback.push({ type: 'rejected', reason: DRILL_OVER })
      return
    }
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
    const advanced = game.advance(0, sheetOpen())
    publish(advanced.events, [], advanced.said)
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
      if (verdict !== null) {
        playback.push({ type: 'rejected', reason: DRILL_OVER })
        return
      }
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
      drill = null
      begin(PracticeGame.start(practice, n, newSeed(), 'You'))
      publish([], opening())
    },
    startDrill() {
      if (!briefing) return
      briefing = false
      update({ drill: drillState() })
      holdsChanged()
    },
    openDrill(id) {
      const chosen = drillOf(id)
      if (chosen === null) return
      drill = chosen
      begin(PracticeGame.drill(practice, chosen, newSeed(), 'You'))
      publish([])
    },
  }

  /** Puts a new game on the table, with nothing held over from the last. */
  function begin(fresh: typeof game) {
    clearTimeout(timer)
    playback.reset()
    pending.clear()
    game = fresh
    briefing = drill !== null
    verdict = null
    topic = null
    reviewed = null
    update({ log: [], latest: null, warning: null, showHint: false, drill: drillState(), guide: null })
  }

  store.setConnection('open')
  update({ drill: drillState() })
  if (drill !== null) publish([])
  else if (isNew) publish([], opening())
  else {
    // A game reopened before anything was played still owes its opening lessons.
    topic = nextTopic(untouched() ? [...opening(), null] : [null])
    publish([])
  }

  /** The player's talk shows at once, and a computer it is thrown at may answer, as online. */
  const say = (said: Say) => {
    talk.receive({ seat: game.you, say: said })
    const answer = said.kind === 'throw' ? answerThrow(game.game, said.at, said.id, Math.random) : null
    if (answer) talk.receive(answer)
  }

  return {
    store,
    talk,
    send,
    say,
    // The only person at a practice table is the player, so nobody else sees what they lift.
    lift() {},
    push() {},
    // Nothing closes a practice table but the player.
    reconnect() {},
    close() {
      closed = true
      clearTimeout(timer)
      playback.reset()
      talk.close()
    },
    coach,
  }
}
