# A Room, Client and Practice for Any Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thunee stands behind the module contract, and the room, the wire protocol, the browser client and practice work for any module, so that a Hearts room can be opened on the server although Hearts has no screens yet.

**Architecture:** `src/games/thunee/index.ts` gathers `src/engine/` and `src/ai/drive.ts` into a `GameModule`, as `src/games/hearts/index.ts` does for Hearts. `src/games/index.ts` lists both by id; it is the only place that knows every game, and the room, the Worker's name check and the tests use it. `TableRoom` finds its module from the room's name on every wake and keeps today's queue, storage, alarm, token map and wake rule, written against the kit's table types. The protocol keeps its envelope and takes the view and event types from the game. The client's store, playback and session are generic; Thunee's screens pass in their game id and `dwell`. Practice is generic over a module and a `GamePractice` the game supplies (seat names, setup, pauses, decisions, the round log, the first round's opening, and a coach with today's six functions); Thunee supplies its own.

**Tech Stack:** TypeScript, React, Vitest, Zod, partyserver/partysocket.

**Specs:** `docs/superpowers/specs/2026-10-05-game-modules-design.md` sections 4.1, 7, 8 and steps 5 and 7 of 9; `docs/superpowers/specs/2026-10-05-cloudflare-and-rename-design.md` sections 2 to 4; `docs/superpowers/specs/2026-10-05-coach-tiers-design.md` section 2 (the shape only). Notes: `.superpowers/sdd/tricks/D1-thunee-kit-report.md`, `A-platform-report.md`, `C-kit-hearts-report.md`.

## Global Constraints

- Nothing changes for players in either game. Every existing test passes; a test changes only where a renamed field or a moved import forces it, and no assertion is weakened. `src/ai/decisions.test.ts` is untouched and its hashes hold.
- Thunee's files stay where they are (`src/engine/`, `src/ai/`, `src/coach/`, `src/ui/`). New Thunee files that generic code is handed go in `src/games/thunee/`. No folder moves, screens contract, shell or on-demand loading (step 6), and Hearts does not join the client's list of games (step 8).
- `src/room/`, `src/protocol.ts`, `src/client/` and `src/practice/` import nothing from `src/engine`, `src/ai` or `src/coach`, except through the module and `GamePractice` objects Thunee exports.
- `apply` stays "clone, then change the draft"; it never mutates its input and never throws on player input. Nothing is added to the contract for a search player.
- The kit stays pure. A member the spec did not list is added minimally and recorded.
- The Worker adapter (`worker/room.ts`) does not change. Hibernation rules hold: a seat is connected exactly when a live connection's token maps to it, and storage is written only on a change.
- Saves keep their shape: a Thunee room or a practice game saved before this work loads after it.
- Tools run from `node_modules/.bin`; the full check is `corepack pnpm run check`; full test runs use `--testTimeout=60000`.

## Review Focus

1. **The room knows no game.** Token binding, `setConnected`, the abandoned-room clock and the wake rule read only `TableState`, `TableAction` and `isTableAction`; messages are parsed with the module's `actionSchema`; a saved game in another format for that game resets.
2. **Same behaviour.** Thunee's room tests, playback timings, practice tests and end-to-end scripts pass as before; a practice game saved before loads after.
3. **Never throws.** Every module in the list refuses malformed envelopes and malformed fields of every action type, from every seat, a seat outside the table, a spectator and the system, in every phase a game reaches.

---

## File map

| File | Change |
|---|---|
| `src/games/thunee/index.ts` | New: Thunee's `GameModule` |
| `src/games/index.ts` | New: the list of games; `gameOf(roomName)`, `isRoomName` |
| `src/kit/module.ts` | `AnyGameModule` and `anyGame`: a module as a host that holds any game sees it |
| `src/kit/table.ts` | `isActor`: an actor that can be at this table |
| `src/kit/contract.ts` | `checkMalformed`: the no-throw check, from the module alone |
| `src/engine/apply.ts`, `src/games/hearts/engine/apply.ts`, `schema.ts` | An actor outside the table is refused; Hearts checks a types-only `actionShape` first |
| `src/protocol.ts` | Generic envelope; no game list |
| `src/room/room.ts` | Module from the name; table types only |
| `worker/index.ts` | The name check is imported from the list of games |
| `src/client/*` | `openSession(game, code)`, generic store and session, `Playback` takes `dwell` |
| `src/games/thunee/dwell.ts` | New: Thunee's dwell table, moved from `playback.ts` |
| `src/practice/*` | Generic over a module and a `GamePractice`; `GameCoach` with today's six functions |
| `src/games/thunee/practice.ts`, `testing.ts` | New: Thunee's `GamePractice`, and its practice test player |
| `src/ui/session.tsx`, `PracticeScreen.tsx`, `routes.ts`, `coach/*`, `GameScreen.tsx`, `text.ts`, `TricksHome.tsx` | Pass Thunee's id, dwell and practice in; type arguments; the client's own list of games with screens |
| `scripts/play.ts` | A Hearts room opens; an unknown game is still refused |

---

### Task 1: Thunee's module and the list of games

**Files:** Create `src/games/thunee/index.ts`, `src/games/index.ts`, `src/games/thunee/index.test.ts`, `src/games/index.test.ts`.

- [ ] Test first: the Thunee module names the game, carries every part of the contract, is the engine's own functions, and its schema admits a player's actions and no system ones. The list has `thunee` and `hearts`, each under its own id; `gameOf` reads `<game>-<CODE>` and refuses anything else, including `constructor-ABCDEF`.
- [ ] `thunee: GameModule<Game, Action, GameEvent, View>` from `src/engine` and `src/ai/drive`. `AnyGameModule`/`anyGame` in the kit; `GAMES`, `gameOf`, `isRoomName` in `src/games/index.ts`. The protocol's `splitRoomName` reads a name's shape.
- [ ] Every test passes. Commit.

### Task 2: Never throw on a malformed action, in any game

**Files:** Modify `src/kit/contract.ts`, `src/kit/table.ts`, `src/engine/apply.ts`, `src/games/hearts/engine/apply.ts`, `schema.ts`; tests in `src/games/index.test.ts`, `src/kit/table.test.ts`, `src/engine/lobby.test.ts`, `src/games/hearts/index.test.ts`.

- [ ] Test first: `checkMalformed(module, seed)` builds a game through table actions, lets computers play it (seat 0 stood in for), and in the lobby and the first state of every phase reached applies to a frozen game: envelopes that are not actions, and every action type in `actionSchema` with each field (and each field of an object field, and an array's element) replaced by values of other types, from every seat, a seat outside the table, a spectator and the system. It must never throw; an envelope must be refused. Run for every module in the list, at each seat count. Red today: an actor outside the table throws in both engines.
- [ ] Unit tests: an actor seat outside the table (seat 2 of two, 4, −1, 1.5) is refused in both engines; Hearts refuses `playCard` with `card: null` and a malformed pass, rule override or persona as `notAllowed`, and keeps its reasons for well-formed actions.
- [ ] `isActor(game, actor)` in the kit; both engines refuse an actor outside the table with `notSeated` after the envelope check. Hearts' `actionShape` is its `actionSchema` without bounds, checked before any field is read, and `apply` dispatches the parsed copy.
- [ ] Every test passes. Commit.

### Task 3: The protocol and the room for any game

**Files:** Modify `src/protocol.ts`, `src/room/room.ts`, `src/room/room.test.ts`, `worker/index.ts`, `src/client/store.ts` and `playback.ts` (type arguments only).

- [ ] Test first: a `hearts-ABCDEF` room is an empty lobby of four; it accepts sit, add computers and start, and a Hearts round proceeds with its computer players on alarms, the human passing and playing; Hearts' messages are validated with Hearts' schema (a Thunee `call` is malformed there). A Thunee room saved under another format resets; a Hearts save with Thunee's format resets. An unknown game id is refused as today.
- [ ] Protocol: `ClientMessage<A>`, `clientMessageSchema(actionSchema)`, `NumberedEvent<E>`, `ServerMessage<V, E>` with a string reason; no game list or engine import.
- [ ] `TableRoom` builds a `Table` for `gameOf(host.name)` in `onStart` and refuses an unknown name as today; the table uses `module.createGame`, `apply`, `checkInvariants`, `viewFor`, `nextDeadline`, `dueStep`, `reactions`, `formatVersion`, and `actionSchema`; the token map binds on `isTableAction(action) && action.type === 'sit'`.
- [ ] `worker/index.ts` imports `isRoomName` from `src/games`. Every test passes, the hibernation cases included. Commit.

### Task 4: A client for any game

**Files:** Modify `src/client/connection.ts`, `store.ts`, `playback.ts` and their tests; create `src/games/thunee/dwell.ts`; modify `src/ui/session.tsx`, `GameScreen.tsx`, `text.ts`, `routes.ts`, `TricksHome.tsx`.

- [ ] `Playback(deliver, dwell, clock)`: the dwell of a sync is the largest of its events' dwells. Thunee's table moves to `src/games/thunee/dwell.ts`; the playback tests pass it in and keep every timing.
- [ ] `GameStore<V, E>`, `Session<V, A, E>`, `openSession(game: { id, dwell }, code)`; the reclaim on reconnect is a table action. The UI's `SessionProvider` passes Thunee's id and dwell; the UI's hooks are typed for Thunee. The client's list of games with screens moves to `src/ui/routes.ts`.
- [ ] Every test passes; `tsc` passes. Commit.

### Task 5: Practice for any game

**Files:** Modify `src/practice/game.ts`, `clock.ts`, `session.ts`, `testing.ts` and their tests; create `src/practice/contract.ts`, `src/games/thunee/practice.ts`, `src/games/thunee/testing.ts`; modify `src/ui/PracticeScreen.tsx`, `src/ui/coach/*`, `src/ui/Table.tsx` (types).

- [ ] `GamePractice<G, A, E, V, N, D, S>`: `module`, `seatNames`, `setup`, `pauseId`, `isDecision`, `roundBegins`, `keepDealt`, `opening`, `summary`, and `coach: GameCoach` with `situation`, `advise`, `check`, `narrate`, `topicsFor`, `review`. `Note` and `DecisionRecord` in their generic forms.
- [ ] `PracticeGame` and `openPracticeSession` take the practice; the save key and the seen-topics key are per game; the save keeps its shape and checks the module's format version.
- [ ] Thunee's practice from today's code; `playPractice` keeps its signature in `src/games/thunee/testing.ts` over a generic `playPractice` with a learner.
- [ ] A test that a save written before this work still loads. Every test passes. Commit.

### Task 6: Scripts, documents, and the end-to-end runs

**Files:** Modify `scripts/play.ts`, `AGENTS.md`.

- [ ] `scripts/play.ts`: a socket to `hearts-<CODE>` gets a lobby of four; `spades-ABCDEF` and the other unknown names are still closed with the room's code.
- [ ] `AGENTS.md`: architecture lines for `src/games/`, the generic room, client and practice.
- [ ] `corepack pnpm run check`; `vitest run --testTimeout=60000`; on a dev server at 5273: `scripts/e2e.ts`, `e2e-two.ts`, `e2e-controls.ts`, `e2e-practice.ts`, `play.ts`. Commit.
