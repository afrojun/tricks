# Practice Games with a Coach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One person plays Thunee against Straight computers in the browser, with a coach that narrates, describes each decision, gives a reasoned hint, warns before listed mistakes, and reviews each round.

**Architecture:** A local `Session` (`src/practice/`) holds the `Game`, applies actions with the engine, drives computers through a driver shared with the server (`src/ai/drive.ts`), and runs a virtual clock that stops while the player is needed. A pure coach (`src/coach/`) turns the player's own full view, events and AI reason codes into `Note`s. The table gets an optional `CoachContext`; online play is unchanged.

**Tech Stack:** TypeScript, React 19, Vitest, motion, Tailwind over theme tokens.

**Spec:** `docs/superpowers/specs/2026-10-04-practice-and-coach-design.md`

## Global Constraints

- Rules in practice are `TRADITIONAL`; computer seats use persona `straight`.
- The coach takes a `View` (always `viewFor(game, you, 'full')`) and never a `Game`; only `review` gets the dealt hands, and only after the round.
- Dependency direction: `ui -> practice -> client, engine, ai, coach`; `ui -> coach` (for `Note` types and topics); `coach -> engine, ai`; `party -> engine, ai`; `ai -> engine`. The engine imports nothing new.
- Online behaviour must not change: every existing test passes untouched except where a task says otherwise.
- Copy: sentence case, plain language, "call" never "bid", "balls" for game points.
- Components use token classes only (`panel`, `btn`, `text-accent`, …), no fixed colours.
- Screens checked at 390×844.

## Review Focus

1. **The player acts while the clock is stopped and a computer's turn is overdue** — after the player's action the session must run every due step at once, not wait for a timer. Test in Task 4.
2. **Reload in the middle of a trick pause or a held warning** — the restored game must show the pause again with Continue, and a held warning is simply dropped (the action was never applied). Test in Task 4.
3. **A computer challenges the player** (Straight challenges a provable renege) — the round ends by challenge; narration and review must handle `reason: 'challenge'` with the player as the accused. Test in Task 7.
4. **Thunee rounds** (trump hidden until the first card, the caller must win every trick) — `situation`/`advise` must not reveal trump before `trumpRevealed` and must not assume a trump suit. Test in Task 5.
5. **Two-player halves** (six new cards, stock empties) — narration of `dealt` with `half: 2` and advice with an empty `current` at the start of a half. Test in Task 7 and Task 4's two-player simulation.

---

## File map

| File | Responsibility |
|---|---|
| `src/ai/drive.ts` (new) | `dueStep(game, now)` and `react(host, events)`: what the server and practice both do automatically |
| `party/server.ts` | Uses `drive.ts`; keeps identity, persistence, alarm, reset |
| `src/ai/choose.ts` | `decide(view, mind): Decision` with reason codes; `chooseAction` wraps it |
| `src/ai/reasons.ts` (new) | `Reason` type |
| `src/engine/cards.ts`, `src/ui/text.ts` | `SUIT_NAME`, `SUIT_SYMBOL`, `cardText` move to the engine so the coach can name cards; `ui/text.ts` re-exports |
| `src/practice/rng.ts` (new) | Seeded generator with a saveable number state |
| `src/practice/clock.ts` (new) | `waitingOnPlayer(game, you, ui)` |
| `src/practice/game.ts` (new) | `PracticeGame`: the local game, steps, clock, save/load, decision record |
| `src/practice/session.ts` (new) | `openPracticeSession`: wraps `PracticeGame` as a `Session` with `Playback` and browser timers |
| `src/coach/note.ts` (new) | `Note`, `TopicId` |
| `src/coach/topics.ts` (new) | `TOPICS`, `topicFor(view, event)` |
| `src/coach/reads.ts` (new) | `reads(view)`, running points |
| `src/coach/situation.ts` (new) | `situation(view)` |
| `src/coach/advise.ts` (new) | `advise(view)` |
| `src/coach/check.ts` (new) | `check(view, action)` |
| `src/coach/narrate.ts` (new) | `narrate(event, view)` |
| `src/coach/review.ts` (new) | `review(record, summary, dealt, you)` |
| `src/ui/session.tsx` | `SessionProvider` takes an `open` factory |
| `src/ui/GameScreen.tsx` | `Screen` reused by practice |
| `src/ui/coach/*.tsx` (new) | `CoachContext`, `CoachStrip`, sheets |
| `src/ui/Table.tsx`, `src/ui/Hand.tsx`, `src/ui/RoundResult.tsx`, `src/ui/Home.tsx`, `src/App.tsx` | Small hooks for the coach, the route and the Home panel |
| `scripts/e2e-practice.ts` (new) | Browser round at 390×844 |

---

### Task 1: Shared automatic driver

**Files:** Create `src/ai/drive.ts`, `src/ai/drive.test.ts`. Modify `party/server.ts`.

**Interfaces — Produces:**
```ts
export type Step = { actor: Actor; action: Action; fallback?: Action }
/** A passed phase deadline (tick), or a due computer turn. Null when nothing is due. */
export function dueStep(game: Game, now: number): Step | null
export interface Host {
  game(): Game
  /** Applies and reports success; also runs `react` on the new events itself. */
  act(actor: Actor, action: Action): Promise<boolean> | boolean
}
/** Computer Jodhi claims after a trick win, then computer challenges after a card or claim. Same order as the server today. */
export async function react(host: Host, events: readonly GameEvent[]): Promise<void>
```

- [ ] Write `drive.test.ts` with the engine `Table` helper (four players, all seats but 0 replaced by `addAi`… use `t.do(0, { type: 'addAi', seat })` on a fresh lobby, then `start`):
  - `dueStep` returns `{ actor: 'system', action: { type: 'tick' } }` when `phase.deadline <= now`;
  - returns the AI seat's `chooseAction(viewFor(game, seat, 'full'), mindFor(game, seat))` with `fallback: fallbackAction(view)` when `aiActAt <= now`;
  - returns `null` when neither is due, and `null` when `aiActAt` is due but no AI seat is to act;
  - `react` with a `trickWon` event for team 1 asks only team 1 computer seats for a Jodhi (use a fake `Host` that records actions);
  - `react` with no `cardPlayed`/`jodhiClaimed`/`trickWon` does nothing.
- [ ] Run `pnpm vitest run src/ai/drive.test.ts` — fails (module missing).
- [ ] Implement `drive.ts` by moving the bodies of `drive`'s tick/AI branches, `aiJodhi` and `aiChallenge` out of `party/server.ts` unchanged in behaviour.
- [ ] Change `party/server.ts`: `drive()` keeps the abandonment check, then loops `dueStep`; for a step it calls `this.act(step.actor, step.action)` and, if that fails and `fallback` is set, `this.act(step.actor, step.fallback)`, throwing as today if both fail. `act` ends with `await react(this.host, result.events)` where `this.host = { game: () => this.saved.game, act: (a, x) => this.act(a, x) }`.
- [ ] Run `pnpm test` — all pass, including the untouched `party/server.test.ts`.
- [ ] `pnpm check`; commit "Share the computer-driving loop between the server and other hosts".

### Task 2: Reason codes from the AI

**Files:** Create `src/ai/reasons.ts`, `src/ai/decide.test.ts`. Modify `src/ai/choose.ts`, `src/ai/simulation.test.ts`.

**Interfaces — Produces:**
```ts
export type Reason =
  | { code: 'callStrong'; jacks: number; backedJack: boolean; high: number; limit: number }
  | { code: 'passWeak'; jacks: number; high: number; limit: number }
  | { code: 'strongestSuit'; suit: Suit; cards: Card[] }
  | { code: 'lastCard' }
  | { code: 'thuneeSure'; suit: Suit }
  | { code: 'thuneeUnsafe' }
  | { code: 'leadBoss'; card: Card }
  | { code: 'leadLow'; card: Card }
  | { code: 'thuneeLeadHigh'; card: Card }
  | { code: 'feedPartner'; card: Card }
  | { code: 'holdUnderPartner'; card: Card }
  | { code: 'cheapestWinner'; card: Card }
  | { code: 'cannotWin'; card: Card }
  | { code: 'sureDouble' }
  | { code: 'sureKhanaak' }
  | { code: 'fallback' }
export interface Decision { action: Action; reason: Reason }
export function decide(view: View, mind: Mind): Decision   // in choose.ts
export function chooseAction(view: View, mind: Mind): Action // = decide(view, mind).action
export { callLimit, bestTrump } // unchanged
```
A cheat chosen by `chooseCheat` reports `{ code: 'fallback' }`; the coach never asks a cheating mind.

- [ ] Write `decide.test.ts` with `cards()` hands and hand-built `View`s (copy the view-building pattern in `src/ai/personas.test.ts`): one test per code — two jacks → `callStrong` with `limit: 30`; nothing high → `passWeak`; trump choice → `strongestSuit` naming the suit; a held J of a plain suit on lead → `leadBoss`; partner winning, playing last → `feedPartner`; partner winning, not last → `holdUnderPartner`; can win → `cheapestWinner`; cannot win → `cannotWin`; Thunee caller leading → `thuneeLeadHigh`; Double available on the last trick and winning → `sureDouble`.
- [ ] Run — fails.
- [ ] Refactor `chooseCard` to return `{ card, reason }` and `chooseAction` into `decide`, with no change in which action is chosen.
- [ ] In `simulation.test.ts`, at each AI decision assert `decide(view, mind).action` deep-equals `chooseAction(view, mind)` (cheap guard that the wrapper is exact).
- [ ] `pnpm test`, `pnpm check`; commit "Have the computer's decisions carry a reason".

### Task 3: Card names in the engine

**Files:** Modify `src/engine/cards.ts`, `src/ui/text.ts`.

- [ ] Move `SUIT_SYMBOL`, `SUIT_NAME` and `cardText` into `src/engine/cards.ts` (exported through `index.ts`); `ui/text.ts` re-exports them so no UI import changes.
- [ ] `pnpm check && pnpm test`; commit "Move card names next to the cards".

### Task 4: Practice game core

**Files:** Create `src/practice/rng.ts`, `src/practice/clock.ts`, `src/practice/game.ts`, `src/practice/game.test.ts`.

**Interfaces — Produces:**
```ts
// rng.ts — same mulberry32 as engine/testing seededRng, but with visible state
export interface Rng { state: number; next(): number }
export function rng(state: number): Rng

// clock.ts
export interface Holds { trickPause: boolean; sheet: boolean }
/** Whether something is waiting on the player, so the virtual clock must not run. */
export function waitingOnPlayer(game: Game, you: Seat, holds: Holds): boolean

// game.ts
export const PRACTICE_KEY = 'thunee-practice'
export const PRACTICE_FORMAT = 1
export interface DecisionRecord { view: View; advised: Action | null; taken: Action }
export interface RoundLog { dealt: Card[][][]; decisions: DecisionRecord[] } // dealt[half-1][seat]
export interface Saved { format: number; engineFormat: number; game: Game; rng: number; virtualNow: number; eventCount: number; round: RoundLog; continued: number }
export interface Applied { events: NumberedEvent[] }
export class PracticeGame {
  static start(playerCount: 2 | 4, seed: number, name: string): PracticeGame
  static load(json: string | null): PracticeGame | null   // null if missing, unparsable, or either format differs
  readonly you: 0
  game: Game
  round: RoundLog
  view(): View          // viewFor(game, 0) — 'table' memory, for the screen
  coachView(): View     // viewFor(game, 0, 'full')
  waiting(holds: Holds): boolean
  /** Applies the player's action. Rejected → { rejected }. Records the decision with `advised`. */
  act(action: Action, advised: Action | null): { rejected: RejectReason } | Applied
  /** Advances virtual time by `ms` unless waiting, running every due step; returns all events. */
  advance(ms: number, holds: Holds): Applied
  /** Ends the trick pause the player was reading. */
  continueTrick(): void
  /** Virtual ms until the next due deadline, or null. */
  nextIn(): number | null
  save(): string
}
```
Setup in `start`: `createGame` → `sit` seat 0 (`name`) → `setPlayerCount` when 2 → `addAi` with `persona: 'straight'` for each other seat → rename computers to Partner/Left/Right or Opponent (seat → name by `position`-equivalent: in four-player seat 2 is Partner; seat 1 is Right, seat 3 is Left, matching the counterclockwise table in `Table.tsx`'s `position`) → `start`. Every action runs `react` via the `Host` interface from Task 1 (synchronous `act`).

The trick pause: `advance` never passes `phase.deadline` of a `trickPause` until `continueTrick()` has been called for that trick (`continued` holds the trick count already continued). `dealt` is captured on each `dealt` event from the game's hands.

- [ ] Write `game.test.ts`:
  - `rng(5).next()` sequence equals `seededRng(5)` for 10 draws; `state` round-trips.
  - `start(4, 1, 'Ann')` → seats: Ann human, three `ai` with persona `straight`, names Right/Partner/Left; phase `calling`; rules equal `TRADITIONAL`.
  - Clock stops: in calling with the player undecided, `advance(60_000)` returns no events and phase is still `calling`; after `act({type:'pass'})` and `advance(60_000)` the phase has moved on.
  - Overdue computers run at once: after the player's card when the next seats are computers, `advance(0)` after `act` plays every due computer card up to the trick pause (Review Focus 1).
  - Trick pause holds until `continueTrick()`; then `advance(TRICK_PAUSE_MS)` moves on.
  - `save()` then `load()` gives an equal `view()` and continues identically for 50 steps of play (same seed); a save with a different `format` or `engineFormat` loads as `null`; garbage loads as `null`.
  - Reload during a trick pause still waits for Continue (Review Focus 2).
  - Simulation: for seeds 1..`SIM_GAMES ?? 10`, two- and four-player, the player always plays `decide(coachView, HONEST).action` (and `nextRound`, `continueTrick` when due); every game reaches `gameOver` within 20 000 steps; `checkInvariants` after each step.
- [ ] Run — fails.
- [ ] Implement `rng.ts`, `clock.ts`, `game.ts`.
- [ ] `pnpm test`, `pnpm check`; commit "Add a local practice game whose clock waits for the player".

**Checkpoint A — GPT-6.1-Sol review** of Tasks 1–4 (`git diff origin/main...HEAD -- src/ai src/practice party src/engine`). Fix confirmed findings before Task 5.

### Task 5: Coach foundations — notes, topics, reads, situation, advise

**Files:** Create `src/coach/note.ts`, `topics.ts`, `reads.ts`, `situation.ts`, `advise.ts`, `src/coach/coach.test.ts`, `src/coach/fixtures.ts` (view builders for tests).

**Interfaces — Produces:**
```ts
export type TopicId = 'cards' | 'following' | 'calling' | 'trump' | 'counting' | 'lastTrick' | 'balls'
  | 'jodhi' | 'thunee' | 'double' | 'khanaak' | 'challenge' | 'twoPlayer'
export interface Note { tone: 'info' | 'suggest' | 'warn'; title: string; body: string; cards?: Card[]; seats?: Seat[]; topic?: TopicId; rule?: WarningRule }
export type WarningRule = 'illegal' | 'overtakePartner' | 'givePoints' | 'overcall' | 'thunee' | 'jodhiUnclaimed' | 'challenge'
export interface Topic { title: string; paragraphs: string[]; example?: Card[] }
export const TOPICS: Record<TopicId, Topic>
/** The topic to introduce at this moment if the player has not seen it. */
export function topicFor(view: View, event: GameEvent | null): TopicId | null
export interface Read { seat: Seat; voidIn: Suit }
export function reads(view: View): Read[]          // voids shown by public play this half
export function runningPoints(view: View): [number, number]
export function situation(view: View): Note | null
export interface Advice { note: Note; action: Action }
export function advise(view: View): Advice | null  // null when the player has no decision
```
`advise` uses `decide(view, HONEST)`; if `findProofs(view)` has a proof whose challenge is in `availableActions(view)`, the advice is that challenge. Each `Reason` code has one sentence template; "why not" lines compare the other legal cards with `wouldWin` and points.

- [ ] Write tests: each topic has a title and ≥1 paragraph; `topicFor` gives `calling` in the first calling phase, `jodhi` when `claimJodhi` is non-empty, `twoPlayer` on a two-player `dealt` half 2; `reads` finds a void when a seat discards on a led suit and nothing otherwise; `situation` mentions the partner's winning card when the partner is winning; during an unrevealed Thunee round, `situation` and `advise` text contain no suit name of trump (Review Focus 4); `advise` names the card `decide` picks and the reason sentence for each play reason code; with a provable renege, `advise` suggests `challengePlay` naming the seat; no string from any of these contains "bid"; honesty: two games built with the engine `Table` from different seeds, forced to the same seat-0 full view is impractical — instead assert every exported coach function's parameter list has no `Game` (a type test: `// @ts-expect-error` passing a `Game` where a `View` is expected fails to compile).
- [ ] Run — fails. Implement. `pnpm test`, `pnpm check`; commit "Add the coach's topics, reads, situation and advice".

### Task 6: Coach warnings

**Files:** Create `src/coach/check.ts`; extend `coach.test.ts`.

**Interfaces — Produces:** `export function check(view: View, action: Action): Note | null` with `rule` set.

Rules exactly as spec 6.3; `overcall` compares to `callLimit(hand)` and the next entry of `CALL_AMOUNTS`; `jodhiUnclaimed` applies when the action is the `continue` pseudo-action — represent it as `check(view, { type: 'tick' })` called by the session when the player taps Continue.

- [ ] Tests: one positive per rule, one negative per rule; `check(view, advise(view).action)` is `null` for every decision in 5 seeded practice games (reuse Task 4's simulation driver, exported from `game.test.ts` as `playPractice(seed, n, onDecision)` in `src/practice/testing.ts`).
- [ ] Implement; test; commit "Warn before the mistakes beginners make".

### Task 7: Coach narration and review

**Files:** Create `src/coach/narrate.ts`, `src/coach/review.ts`; extend tests.

**Interfaces — Produces:**
```ts
export function narrate(event: GameEvent, view: View): Note | null  // view after the event, coach memory
export interface ReviewInput { decisions: DecisionRecord[]; summary: RoundSummary; dealt: Card[][][]; you: Seat; view: View }
export function review(input: ReviewInput): Note[]  // score in words, ≤3 key moments, unchallenged reneges
```
`DecisionRecord` is defined in `src/coach/note.ts` (not `practice`), so `coach` never imports `practice`; `game.ts` imports and re-exports it.

- [ ] Tests: `trickWon` note names the winner, the card, the points and both running totals; `dealt` half 2 in two-player says six new cards (Review Focus 5); `challengeResolved` with the player accused and guilty explains the 4 balls (Review Focus 3); each `GameEvent` type is handled by an exhaustive `switch` (type-checked); `review` with a decision that differs from advice reports it, with three or more such decisions reports the three with the most points in the trick; `review` of a challenge round makes sense when `summary.normal` is absent; in the simulation every event yields a note or is in the explicit silent list (`seatChanged`, `cardPlayed` by the player).
- [ ] Implement; test; commit "Narrate each event and review each round".

**Checkpoint B — GPT-6.1-Sol review** of `src/coach` (copy quality against the conventions, and that nothing uses hidden information).

### Task 8: Practice session and screen plumbing

**Files:** Create `src/practice/session.ts`, `src/ui/coach/context.tsx`, `src/ui/PracticeScreen.tsx`. Modify `src/ui/session.tsx`, `src/ui/GameScreen.tsx`, `src/App.tsx`.

**Interfaces — Produces:**
```ts
// session.ts
export interface CoachState {
  advice: Advice | null; situation: Note | null; log: Note[]; latest: Note | null
  warning: { note: Note; action: Action } | null; topic: TopicId | null; review: Note[] | null
  dealt: Card[][][] | null; showHint: boolean
}
export interface PracticeSession extends Session {
  coach: { getState(): CoachState; subscribe(l: () => void): () => void
    hint(): void; confirm(): void; cancel(): void; dismissTopic(): void; continueTrick(): void; restart(n: 2 | 4): void }
}
export function openPracticeSession(opts: { playerCount: 2 | 4 | null; storage?: Storage; now?: () => number }): PracticeSession
```
`send(action)`: runs `check` on the coach view; an `illegal` warning is not held (the hand's popover already confirmed it); any other warning goes into `warning` and waits for `confirm`/`cancel`. Accepted actions go through `PracticeGame.act` with `advise(...)?.action`, then events through `Playback` into the `GameStore` as `sync` messages, and each event through `narrate` into `log`/`latest`; `topicFor` sets `topic` when the topic is not in `localStorage['thunee-coach-seen']`. A browser `setTimeout` for `nextIn()` drives `advance`. On `roundScored`, `review` fills `review` and `dealt`.

- [ ] `SessionProvider` gains `open: () => Session` (GameScreen passes `() => openSession(room)`); `GameScreen`'s `Screen` and error boundary are exported for reuse.
- [ ] `App.tsx`: `/practice` and `/practice?players=2|4` → `PracticeScreen`, which opens the practice session (new game when `players` is given, else load) inside `CoachProvider`.
- [ ] Unit test `session.test.ts` (fake storage, fake timers): a non-illegal warning holds the action until `confirm`; `cancel` drops it; an illegal play is not held; a reload during a held warning has no warning and the action unapplied (Review Focus 2).
- [ ] `pnpm test`, `pnpm check`; commit "Run practice games in the browser behind the same session as online games".

### Task 9: Coach UI

**Files:** Create `src/ui/coach/CoachStrip.tsx`, `src/ui/coach/CoachSheets.tsx`. Modify `src/ui/Table.tsx`, `src/ui/Hand.tsx`, `src/ui/RoundResult.tsx`, `src/ui/Home.tsx`, `src/index.css` (only token-based classes such as `.suggested`).

- [ ] `Table`: when `useCoach()` is non-null, render `<CoachStrip/>` in place of `<Hint/>`, pass `suggested` to `Hand`, hide invite and replace-with-computer items in `MenuSheet`, add *How to play*, *New practice game*, *Leave*.
- [ ] `Hand`: optional `suggested?: Card | null` (adds `.suggested` ring and lift) and `explain?: (card: Card) => string | null` (text inside the Play anyway popover).
- [ ] `CoachStrip`: situation + Hint on the player's decision; latest narration otherwise; in the trick pause, narration + Continue (calls `coach.continueTrick()`, which runs the `jodhiUnclaimed` check first); a log button opening "This round".
- [ ] `CoachSheets`: advice sheet, warning sheet (*Play anyway* / *Choose again*), topic sheet (*Got it*), log sheet, *How to play* list, all hands sheet; all use `Sheet`.
- [ ] `RoundResult`: optional `review` and `onSeeHands` props rendering "Coach's review".
- [ ] `Home`: "Learn to play" panel first: *Practice with 4* / *Practice with 2*, or *Continue practice* / *Start over* when `localStorage['thunee-practice']` loads.
- [ ] Manual check at 390×844 in each theme: nothing overlaps the trick; strip ≤ 2 lines.
- [ ] `pnpm check`, `pnpm test`; commit "Show the coach at the table".

### Task 10: End to end and docs

**Files:** Create `scripts/e2e-practice.ts`. Modify `package.json` (`e2e` runs it), `AGENTS.md`, the spec's new "Changes made during the build" section.

- [ ] Script (pattern of `scripts/e2e.ts`): 390×844 page → Home → *Practice with 4* → for each decision tap Hint then the suggested card or button, tap Continue in pauses, dismiss topics → reaches "Coach's review" → screenshot to `/tmp/practice-review.png`.
- [ ] Run with `pnpm dev` up; it passes.
- [ ] AGENTS.md: folders, dependency arrows, "The coach takes views, never a `Game`", practice in "To try a game alone".
- [ ] Spec: record that reactions stay event-triggered (`react`) rather than state-derived, and any other deviations.
- [ ] Commit "Add a practice end-to-end run and document practice games".

**Checkpoint C — GPT-6.1-Sol whole-branch review**; fix confirmed findings; `pnpm check && pnpm test && pnpm build`.
