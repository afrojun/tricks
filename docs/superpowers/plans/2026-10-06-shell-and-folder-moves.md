# The Shell, Folder Moves and Games on Demand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thunee lives in `src/games/thunee/` like any other game; the browser learns a game only through its screens contract (`GameClient`), loads each game's screens when its address is visited, and lists Hearts beside Thunee with a placeholder table.

**Architecture:** `src/engine/`, `src/ai/` and `src/coach/` move under `src/games/thunee/`, and Thunee's screens (its table, round result, coach sheets, `present`, its rules descriptions and words) under `src/games/thunee/ui/`. `src/ui/contract.ts` defines `GameClient` (React types, so it lives with the screens, never in the kit). `src/ui/games.ts` is the browser's static list of games (id, name, tagline, seat counts) with one dynamic `import()` per game. The shell (`src/ui/`) is the Tricks home, a game's home, the lobby, the practice screen and the frame around a table, all driven by the loaded `GameClient`; the session and coach contexts hold any game's, and a game's screens read them through typed hooks. Presets and share links are keyed by game and read a `RuleBook`. Thunee's `apply` becomes `structuredClone` then an exported `step`.

**Tech Stack:** TypeScript, React, Vite (Rolldown), Vitest, Zod.

**Specs:** `docs/superpowers/specs/2026-10-05-game-modules-design.md` sections 4.2, 6 (screens and presets rows), 7 (Shell), 8, and steps 6 and 8 of 9; `docs/superpowers/specs/2026-10-05-tricks-overview-design.md` sections 3 and 4; `docs/superpowers/specs/2026-10-05-cloudflare-and-rename-design.md` section 5; `docs/superpowers/specs/2026-10-05-hearts-design.md` sections 3 and 8 (context). Notes: `.superpowers/sdd/tricks/D2-generic-room-report.md`, `D1-thunee-kit-report.md` (verdict wording).

## Global Constraints

- Nothing changes for players of Thunee, except that a verdict on an undercut now says "undercut". Every existing test passes; a test changes only where a move or a rename forces it, and no assertion is weakened. `src/games/thunee/ai/decisions.test.ts` passes with its hashes unchanged.
- Move commits change paths and imports and nothing else (`git mv`, so history follows).
- Untouched: `src/kit/module.ts`, `src/kit/search/**`, `src/games/hearts/engine/**`, `src/games/hearts/ai/**`, `src/games/hearts/index.ts`. Hearts files written here: `client.ts`, `ui/**`.
- The kit stays pure and imports no React. `src/games/index.ts` is imported by nothing under `src/ui` or `src/client`.
- Addresses and storage keys as the Cloudflare spec section 5 tables them; a game's own keys are `tricks-<game>-…`; a share link opens the game's home.
- Mobile first: the shell and both games' flows are checked at 390 by 844.
- Tools run from `node_modules/.bin`; the full check is `corepack pnpm run check`; full test runs use `--testTimeout=60000`; a dev server for scripts runs on port 5273.

## Review Focus

1. **Moves are moves.** Each move commit is `git mv` plus import paths; `git diff -M --stat` shows renames.
2. **The shell knows no game.** Nothing in `src/ui` names Thunee or Hearts except the static list; the frame, lobby, homes and practice screen read the `GameClient`.
3. **Games load on demand.** The production build has one chunk per game; the entry chunk holds neither.

---

## File map

| File | Change |
|---|---|
| `src/engine/`, `src/ai/`, `src/coach/` | Moved to `src/games/thunee/engine/`, `ai/`, `coach/` |
| `src/ui/Table.tsx`, `RoundResult.tsx`, `coach/CoachStrip.tsx`, `CoachSheets.tsx`, `CoachReview.tsx`, `src/presets/describe.ts`, `src/games/thunee/dwell.ts` | Moved to `src/games/thunee/ui/` (`describe.ts` as `rules.ts`) |
| `src/games/thunee/ui/present.ts`, `text.ts` | Thunee's half of `GameScreen.tsx` and of `src/ui/text.ts`, moved out |
| `src/games/thunee/engine/apply.ts` | `step(draft, actor, action, ctx)`; `apply` is clone then step |
| `src/presets/book.ts` | New: `RuleBook`, `RuleInfo` and the descriptions' generic helpers |
| `src/presets/storage.ts`, `share.ts` | Keyed by game; built-ins and schema from the game's book |
| `src/ui/contract.ts` | New: `GameClient`, `Presentation`, `ShellView`, `AnyGameClient` |
| `src/ui/games.ts` | New: the static list and one loader per game |
| `src/ui/session.tsx`, `coach/context.tsx` | Contexts for any game; `sessionHooks`, `coachHooks`; the loaded game's client |
| `src/ui/seats.ts`, `Timer.tsx`, `GameMenu.tsx` | New shared parts from Thunee's table: placement by direction and teams, the timer, the menu |
| `src/ui/GameScreen.tsx`, `Lobby.tsx`, `Home.tsx`, `PracticeScreen.tsx`, `TricksHome.tsx`, `Rules.tsx`, `routes.ts`, `App.tsx` | Generic, driven by the `GameClient` |
| `src/practice/client.ts` | New: `practiceClient(practice, dwell)`, what the shell opens |
| `src/games/thunee/client.ts` | New: Thunee's `GameClient` |
| `src/games/hearts/client.ts`, `ui/*` | New: Hearts' `GameClient`, rule book, `present`, `dwell` and placeholder table |
| `vite.config.ts` | Game chunks named by game |
| `scripts/e2e-hearts.ts`, `AGENTS.md` | Hearts end to end; the final layout |

---

### Task 1: Move Thunee's engine, computer players and coach

**Files:** `git mv src/engine src/games/thunee/engine`, `src/ai`, `src/coach` likewise; every import of them; `vitest.config.ts`, `package.json` (`test:soak`).

- [ ] One commit per folder: `git mv`, then rewrite relative imports (`../kit` becomes `../../../kit` inside the moved folder; `../engine` becomes `./engine` from `src/games/thunee/`, `../games/thunee/engine` from `src/ui`, and so on).
- [ ] After each: `corepack pnpm run check` and the full suite pass; `decisions.test.ts` unchanged but for its import paths.

### Task 2: Move Thunee's screens

**Files:** `git mv` `src/ui/Table.tsx`, `RoundResult.tsx`, `src/ui/coach/{CoachStrip,CoachSheets,CoachReview}.tsx`, `src/presets/describe.ts` (as `rules.ts`), `src/games/thunee/dwell.ts` into `src/games/thunee/ui/`; cut `present` out of `GameScreen.tsx` into `src/games/thunee/ui/present.ts` and `teamName`, `sortHand` out of `src/ui/text.ts` into `src/games/thunee/ui/text.ts`, unchanged.

- [ ] Imports only. Check and full suite pass. Commit.

### Task 3: Thunee's in-place step

**Files:** `src/games/thunee/engine/apply.ts`, `index.ts`; test `src/games/thunee/engine/step.test.ts`.

- [ ] Test first: seeded games (both seat counts, cheating on and off, chaos actions from every actor including malformed ones) applied through `apply` and through `structuredClone` then `step` agree on the game, the events and every rejection; `apply` leaves its input untouched.
- [ ] `step(draft, actor, action, ctx): { events } | { rejected }` holds everything after the clone; `apply` is `structuredClone` then `step`. Not added to the module object or to `src/kit/module.ts`. Commit.

### Task 4: Rule books, and presets keyed by game

**Files:** Create `src/presets/book.ts`, `src/presets/books.test.ts`; modify `src/presets/storage.ts`, `share.ts`, `presets.test.ts`, `src/games/thunee/ui/rules.ts`, `src/ui/Rules.tsx`, `Home.tsx`, `Lobby.tsx`, Thunee's table.

- [ ] Test first: presets are saved under `tricks-<game>-presets`, a game's built-ins come from its book, one game's saved presets never appear in another's, a share link opens `/<game>?rules=` and is read with that game's schema; each book describes every rule, each choice is accepted by its schema, each range's ends are accepted and one past them refused.
- [ ] `RuleBook<R>`: `defaults`, `schema`, `presets` (the defaults first), `info`. Thunee's book from `describe.ts`. `Rules.tsx` reads a book. Commit.

### Task 5: The screens contract, and the shell driven by it

**Files:** Create `src/ui/contract.ts`, `src/ui/seats.ts` (+ test), `src/ui/Timer.tsx`, `src/ui/GameMenu.tsx`, `src/practice/client.ts`, `src/games/thunee/client.ts`, `src/games/thunee/ui/session.ts`; modify `src/ui/session.tsx`, `coach/context.tsx`, `GameScreen.tsx`, `Lobby.tsx`, `Home.tsx`, `PracticeScreen.tsx`, `Moments.tsx`, `text.ts`, `Card.tsx`, `Hand.tsx`, `personas.ts`, and Thunee's screens.

- [ ] Test first: seat placement by direction (next seat on the right counterclockwise, on the left clockwise, opposite for two); lobby teams (a team of one reads as a player; partners opposite); the shell's rejection wording falls back from the game's to the table's.
- [ ] `GameClient<V, A, E>`: `id`, `name`, `tagline`, `direction`, `seatCounts`, `dwell`, `present`, `Table`, `rules`, `lobbyTeams`, `practice`, `rejections`. The frame takes toasts, moments and the celebration from `present`; Thunee's table keeps its ball burst from the store's events.
- [ ] The lobby groups seats by `lobbyTeams` and offers the client's seat counts; the home offers create, join, presets and practice from the client; practice opens through `practiceClient`.
- [ ] Still loaded statically for Thunee only. Every Thunee screen looks as before. Commit.

### Task 6: The Tricks home and games on demand

**Files:** Create `src/ui/games.ts`, `src/ui/games.test.ts`; modify `routes.ts`, `routes.test.ts`, `TricksHome.tsx`, `App.tsx`, `vite.config.ts`.

- [ ] Test first: the static list agrees with each game's client (id, name, tagline, seat counts); routes are read for every listed game.
- [ ] `App` loads a game's client with `import()` on its routes only (React `use` over a cached promise, under `Suspense` and an error boundary).
- [ ] `vite build`: one chunk per game, named by game; the entry chunk holds no game's rules or screens. Commit.

### Task 7: Hearts on the client

**Files:** Create `src/games/hearts/client.ts`, `ui/rules.ts`, `ui/dwell.ts`, `ui/present.ts`, `ui/Table.tsx`, tests; modify `src/ui/games.ts`.

- [ ] Test first: Hearts' book (Standard, Omnibus), `present` for its events, `dwell`, `lobbyTeams` null.
- [ ] A placeholder table: round, phase, whose turn, hearts broken, the scores and points taken, the trick in play, the viewer's hand as plain cards, and a note that the Hearts table is being built; the shared menu for stand-ins and leaving. `/hearts/practice` says practice is coming. Commit.

### Task 8: The verdict names the rule broken

**Files:** `src/games/thunee/ui/present.ts`, test.

- [ ] Test first: a guilty `renege` reads "did not follow suit"; a guilty `undercut` reads "undercut"; a Jodhi and an innocent play read as before. Commit.

### Task 9: Scripts, documents, and the end-to-end runs

**Files:** Create `scripts/e2e-hearts.ts`; modify `package.json` (`e2e`), `AGENTS.md`, `README.md`.

- [ ] `e2e-hearts.ts`: create at `/hearts`, join from a second context, fill with computers, start, and watch the placeholder table follow the round; `/hearts/practice` says practice is coming.
- [ ] `AGENTS.md`: the final layout, the dependency direction, and how to add a game.
- [ ] `corepack pnpm run check`; `vitest run --testTimeout=60000`; `vite build`; on a dev server at 5273: `e2e.ts`, `e2e-two.ts`, `e2e-controls.ts`, `e2e-practice.ts`, `e2e-hearts.ts`, `play.ts`. Commit.
