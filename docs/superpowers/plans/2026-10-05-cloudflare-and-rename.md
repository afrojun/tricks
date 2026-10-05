# Cloudflare Hosting and the Rename to Tricks Implementation Plan

> **For agentic workers:** steps use checkbox (`- [ ]`) syntax for tracking. Commit after each task.

**Goal:** One Cloudflare Worker serves the app and the rooms; the app is called Tricks and Thunee lives at `/thunee`. Thunee's rules, screens and messages do not change.

**Architecture:** Today's PartyKit room becomes `TableRoom` (`src/room/room.ts`), a plain class over a small `RoomHost` interface, tested in Node. `worker/room.ts` is a `partyserver` Durable Object that adapts Cloudflare to `TableRoom`; `worker/index.ts` routes `/parties/*` to it. Vite runs the Worker in development through `@cloudflare/vite-plugin`, so `pnpm dev` is the whole app on one origin.

**Spec:** `docs/superpowers/specs/2026-10-05-cloudflare-and-rename-design.md`. Build order is the spec's section 7.

## Global constraints

- No change to `src/engine`, `src/ai` or `src/coach` beyond imports.
- `TableRoom` keeps today's behaviour; every case in `party/server.test.ts` passes after the move.
- Nothing may be assumed to survive in memory between hooks: `saved` is reloaded in `onStart`, the queue starts empty.
- Vitest never loads the Cloudflare plugin (`vitest.config.ts` stays separate from `vite.config.ts`).
- Worker and DOM types conflict: `worker/` gets its own tsconfig, and `pnpm check` runs both.
- Never use ports 5173 or 1999 (the main checkout's servers). Run checks on 5273.
- No deploy configuration (custom domain, workflow): that is `2026-10-05-deploy-design.md`.

## File map

| File | Responsibility |
|---|---|
| `src/room/room.ts` (new) | `TableRoom`, `RoomHost`, `RoomConnection`: identity, persistence, alarm, AI driving |
| `src/room/room.test.ts` (moved) | Today's `party/server.test.ts` over a fake `RoomHost`, plus hibernation and name cases |
| `worker/room.ts` (new) | `Room`: a hibernating `partyserver` `Server` forwarding hooks to `TableRoom`; ping auto-response |
| `worker/index.ts` (new) | Fetch handler: `routePartykitRequest`, else 404 |
| `worker/env.d.ts`, `worker/tsconfig.json` (new) | The `Room` binding type; Worker-only type check |
| `wrangler.jsonc` (new) | Name, entry, compatibility date, assets (SPA, Worker first for `/parties/*`), `Room` binding and migration |
| `vite.config.ts` | Adds the Cloudflare plugin, drops the `/parties` proxy |
| `src/protocol.ts` | `GAME_IDS`, `roomName(game, code)`, `isRoomName(name)` |
| `src/client/connection.ts` | `openSession(game, code)` on the page's own origin, party `room` |
| `src/ui/routes.ts` (new) | Pure path parsing and path builders; `routes.test.ts` |
| `src/App.tsx`, `src/ui/TricksHome.tsx` (new) | Routes; the Tricks home |
| `src/ui/*`, `src/practice/*`, `src/presets/*`, `src/themes/*`, `src/client/identity.ts` | New paths and storage keys |
| `party/`, `partykit.json`, `vercel.json`, `.github/workflows/deploy-partykit.yml` | Deleted |
| `scripts/*.ts`, `AGENTS.md`, `README.md`, `index.html`, `package.json` | New paths, single origin, names, commands |

---

### Task 1: `TableRoom` over `RoomHost`

**Files:** Create `src/room/room.ts`, move `party/server.test.ts` to `src/room/room.test.ts`. Modify `party/server.ts` (adapter), `vitest.config.ts`, `tsconfig.json`.

**Interfaces — Produces:** the spec's section 2.1 (`RoomConnection`, `RoomHost`, `TableRoom`), plus `Deps` and `ABANDONED_AFTER_MS` exported.

- [ ] `git mv party/server.test.ts src/room/room.test.ts`; rename the fake room to a `RoomHost` (`name`, `storage`, `connections()`), `onConnect(conn, url)`; point it at `TableRoom`. Run — fails (module missing).
- [ ] Move the body of `ThuneeRoom` into `TableRoom` over `RoomHost`, with no change in behaviour.
- [ ] Reduce `party/server.ts` to an adapter (`room.id` as the name, `ctx.request.url` as the url) so the app still runs.
- [ ] `vitest.config.ts` includes `src/room/**/*.test.ts`; `tsconfig.json` still covers `party/`.
- [ ] `vitest run`, `tsc --noEmit`; `partykit dev` on a spare port plus `scripts/play.ts` against it.
- [ ] Commit "Move the room's logic into TableRoom over a small host interface".

### Task 2: Who is connected after a wake

**Files:** Modify `src/room/room.ts`, `src/room/room.test.ts`.

- [ ] Tests first: a `wake()` in the fake builds a second `TableRoom` over the same host keeping its connections.
  - a wake with the connections still present leaves those seats connected, and they can still act;
  - a restart (no connections) disconnects every human seat (today's case, kept);
  - a seat whose only connection went away while asleep is disconnected on wake, and live clients are told;
  - `onStart` does not write when nothing changed (wake with everyone present; restart of an empty room).
- [ ] Implement: in `onStart`, a human seat is connected exactly when a live connection's token maps to it. If anything changed: recompute `emptySince`, raise `version`, write once, send the view to live connections.
- [ ] `vitest run`, `tsc --noEmit`; commit "Keep seats connected when a room wakes with its sockets still open".

### Task 3: The Worker, and PartyKit removed

**Files:** Create `worker/index.ts`, `worker/room.ts`, `worker/env.d.ts`, `worker/tsconfig.json`, `wrangler.jsonc`. Modify `vite.config.ts`, `package.json`, `.gitignore`, `src/protocol.ts`, `src/client/connection.ts`, `src/ui/session.tsx`, `src/vite-env.d.ts`, `src/room/room.ts`, `src/room/room.test.ts`, `tsconfig.json`. Delete `party/`, `partykit.json`, `vercel.json`, `.github/workflows/deploy-partykit.yml`.

- [ ] Tests first: a room whose name is not `thunee-` and six capital letters closes each connection with a close code and sends nothing; `isRoomName` accepts `thunee-ABCDEF` only.
- [ ] `TableRoom.onConnect` refuses a bad name; `RoomConnection` gains `close(code, reason)`.
- [ ] `worker/room.ts`: `Room extends Server`, `static options = { hibernate: true }`, `ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG))`, hooks forwarded (note `onMessage(connection, message)`).
- [ ] `wrangler.jsonc`: `name: "tricks"`, `main: "worker/index.ts"`, compatibility date, `assets: { not_found_handling: "single-page-application", run_worker_first: ["/parties/*"] }`, binding `Room` → class `Room`, migration `new_sqlite_classes: ["Room"]`. Check against `node_modules/wrangler/config-schema.json`.
- [ ] `vite.config.ts`: `cloudflare()` plugin, no proxy, `host` and `allowedHosts` kept.
- [ ] Client: `openSession(game, code)` with `new PartySocket({ host: location.host, party: 'room', room: roomName(game, code), query })`; `VITE_PARTYKIT_HOST` removed.
- [ ] Packages: add `partyserver`, `wrangler`, `@cloudflare/vite-plugin`, `@cloudflare/workers-types`; remove `partykit`. Scripts: `check` runs both tsconfigs; `party`, `party:deploy` removed.
- [ ] `vitest run`, `check`; `vite --port 5273`: create a game, add computers, play; `scripts/play.ts` against 5273.
- [ ] Commit "Serve the app and the rooms from one Cloudflare Worker".

### Task 4: Paths, the Tricks home, storage keys

**Files:** Create `src/ui/routes.ts`, `src/ui/routes.test.ts`, `src/ui/TricksHome.tsx`. Modify `src/App.tsx`, `src/ui/Home.tsx`, `src/ui/Lobby.tsx`, `src/ui/GameScreen.tsx`, `src/ui/Table.tsx`, `src/ui/PracticeScreen.tsx`, `src/presets/share.ts`, `src/presets/storage.ts`, `src/presets/presets.test.ts`, `src/practice/game.ts`, `src/practice/session.ts`, `src/themes/index.ts`, `src/ui/sound.ts`, `src/client/identity.ts`, `index.html`, `vitest.config.ts`.

- [ ] Tests first (`routes.test.ts`): `/` is the Tricks home; `/thunee` and `/thunee/` the Thunee home; `/thunee/ABCDEF` a room; `/thunee/practice` practice (matched before a code); `/game/ABCDEF`, `/practice` and anything else the Tricks home. Share links point at `/thunee`.
- [ ] `routes.ts` (pure): `route(path)`, `gamePath`, `roomPath`, `practicePath`; `App.tsx` uses it.
- [ ] Tricks home: heading, one card for Thunee linking to `/thunee`, the theme picker.
- [ ] Create, join, invite link, preset share link, practice links and every "Leave" use the new paths.
- [ ] Storage keys per the spec's table 5.3. `index.html` title `Tricks`.
- [ ] `vitest run`, `check`; commit "Rename the app to Tricks and put Thunee at /thunee".

### Task 5: Scripts and documents

**Files:** Modify `scripts/play.ts`, `scripts/e2e.ts`, `scripts/e2e-two.ts`, `scripts/e2e-controls.ts`, `scripts/e2e-practice.ts`, `scripts/perf-drag.ts`, `AGENTS.md`, `README.md`.

- [ ] Scripts: new paths and storage keys; `play.ts` connects to the app's own origin (`APP_URL`) with party `room` and a valid room name; `e2e.ts` starts at the Tricks home.
- [ ] Run against `vite --port 5273`: `play.ts`, `e2e.ts`, `e2e-two.ts`, `e2e-controls.ts`, `e2e-practice.ts`. Manual: idle ten seconds at a table, no reconnecting banner.
- [ ] `AGENTS.md`, `README.md`: commands, architecture, environment; deployment pending, pointing at the deploy spec.
- [ ] Commit "Point the scripts and documents at the single Worker".
