# Tricks - Multiplayer Trick-Taking Card Games

Tricks hosts trick-taking card games. Thunee is the first, at `/thunee`.

## Commands

```bash
pnpm install        # install dependencies
pnpm dev            # the whole app, pages and rooms, in one Vite server (localhost:5173)
pnpm check          # type check the app (tsconfig.json) and the Worker (worker/tsconfig.json)
pnpm test           # unit, room and simulation tests (Vitest)
pnpm test:soak      # 400 simulated games per configuration
pnpm e2e            # browser games, hand controls and a practice round (needs dev running, and Chromium)
pnpm e2e:sockets    # a full game over real sockets (needs dev running)
pnpm build          # production build: dist/client (assets) and dist/tricks (the Worker)
```

The scripts look for the app at `http://localhost:5173`; set `APP_URL` to point them elsewhere.

To try a game alone: open Thunee from the Tricks home, create a game, sit down, and use "Add computer" on the other seats. To learn the game, use "Learn to play" on Thunee's home: a practice game against computers with a coach, run entirely in the browser (no room needed).

In development the Cloudflare Vite plugin runs the Worker, rooms included, inside Vite, so the app needs only one URL. To play from another device, point an HTTPS tunnel (for example `tailscale serve`) at `127.0.0.1:5173`; `*.ts.net` hosts are already allowed in `vite.config.ts`. Local room storage lives in `.wrangler/`.

## Tech Stack

- **Frontend**: Vite + React + TypeScript
- **Styling**: Tailwind CSS v4 over theme tokens (CSS custom properties)
- **Real-time**: one Cloudflare Worker; each room is a Durable Object built with `partyserver`, and the client connects with `partysocket`
- **Validation**: Zod
- **Package manager**: pnpm; **tests**: Vitest

## Architecture

The design is written up in `docs/superpowers/specs/2026-10-04-thunee-rebuild-design.md`. Practice games and the coach: `docs/superpowers/specs/2026-10-04-practice-and-coach-design.md`. Hosting and the rename to Tricks: `docs/superpowers/specs/2026-10-05-cloudflare-and-rename-design.md`; where Tricks is going: `docs/superpowers/specs/2026-10-05-tricks-overview-design.md`.

```
src/engine/    Pure rules. One Game value, changed only by apply(game, actor, action, ctx).
src/ai/        Computer players: seat view -> action (with a reason code). drive.ts is the automatic loop every host shares.
src/coach/     Pure: the player's view and events -> notes. Topics, situation, hints, warnings, narration, review.
src/practice/  A practice game in the browser: local Session, virtual clock that waits for the player, saved to the device.
src/protocol.ts  Wire messages shared by client and server, and room names (`<game>-<CODE>`).
src/room/      TableRoom: identity, persistence, alarm, AI driving, over a small RoomHost interface. Tested in Node.
worker/        Cloudflare only: the fetch handler and the Room Durable Object, a thin adapter to TableRoom.
src/client/    Socket wrapper and the store the UI reads.
src/ui/        Screens and components. routes.ts maps paths to screens: /, /thunee, /thunee/<CODE>, /thunee/practice.
src/themes/    Theme tokens and the theme list.
src/presets/   Rule presets: storage, share links, descriptions.
scripts/       End-to-end scripts.
```

Dependency direction: `ui -> client -> engine`; `ui -> practice -> client, engine, ai, coach`; `ui -> coach`; `coach -> engine, ai`; `worker -> room -> engine, ai, protocol`; `ai -> engine`.

### Rules that keep it correct

- **The engine is pure.** Nothing in `src/engine/` reads the clock, generates randomness, or imports from other folders. Time and randomness arrive through `ctx`. `apply` never mutates its input and never throws on player input; it returns `{ rejected }`.
- **One source of truth.** Timers are deadlines inside the saved game. The room sets its Durable Object's single alarm to `nextDeadline(game)` after every change. Do not keep timer or game facts in server memory.
- **Rooms hibernate.** Cloudflare may drop a room between messages while its sockets stay open, then build it again; `onStart` runs on every wake and reloads the saved state. A human seat is connected exactly when an open socket's token maps to it. The token lives in the socket's state, which survives hibernation. Heartbeat pings are answered at the edge (`setWebSocketAutoResponse`), so they never wake a room.
- **Saves are not upgraded.** A change to the saved `Game` shape raises `FORMAT_VERSION` (`src/engine/types.ts`), and rooms saved in another format reset to an empty lobby on load. Pushing such a change to `main` resets every game in progress.
- **Abandoned rooms reset.** A room with no seated human connected for 24 hours (`ABANDONED_AFTER_MS` in `src/room/room.ts`) goes back to an empty lobby. The clock is `emptySince` in the saved state and shares the one alarm with game deadlines.
- **Shared validation.** `apply` checks round actions against `availableActions(viewFor(game, seat))`, the same function the UI uses to decide what to show. Add a new action there first.
- **Views hide information.** Clients only receive `viewFor(game, seat)`. Never send `Game`. Other hands, the stock, `handBefore`, `legal`, Jodhi `valid`, tokens, `aiSalt`, a hidden persona before game over, unrevealed trump, and the cards of any trick before the last completed one must not appear in a view; the simulation test checks this. Computer players, which run on the server, get `viewFor(game, seat, 'full')` and remember the whole round.
- **The coach is honest.** Coach functions take a `View` (the player's own, with `'full'` memory), never a `Game`, and never run a computer's decision for another seat. Only the round review sees the dealt hands, after the round. Advice comes from the computer's own `decide` with the honest mind, so the hint and the computers cannot disagree; `check` must return null for the advised action.
- **Practice time waits for the player.** The practice clock (`src/practice/clock.ts`) only runs while nothing waits on the player; timers there use the browser, since there is no server.
- **Identity is a secret token, not a connection.** The browser's token maps to a seat on the server. Clients only see seat numbers.
- **A room's name is its game.** Rooms are named `<game>-<CODE>` and live at `/parties/room/<name>`; the game is read from the name and never saved. Any other name is refused.
- **Storage keys.** Everything the browser keeps starts with `tricks-`; a game's own keys start with `tricks-<game>-` (for example `tricks-thunee-presets`).
- **Paced playback.** `src/client/playback.ts` holds each server message on screen for a dwell set by its events, and skips ahead when a backlog builds. Sending an action releases the hold. A new event type that should be seen needs a dwell there.
- **Computer personas.** Each computer seat has a persona (`src/ai/mind.ts`) that decides whether it cheats and how well it watches. Every AI chance is `roll(aiSalt, seat, id)`, a pure hash, so a decision never changes on re-evaluation and nothing about it is held in server memory. A stand-in for a human always plays as Straight.
- **Events, not diffs.** Sounds, toasts and celebrations are driven by numbered events from the server (`store.onEvent`), never by comparing one view with the last.
- **Rules are data.** Every variant is a field of `RuleSet` (`src/engine/rules.ts`), frozen into the game at start. Traditional is the default; a preset stores only its differences. A new rule needs: the field and its Traditional value, the engine branch, a line in `src/presets/describe.ts`, a line in `ruleOverridesSchema`, and tests under each value.
- **Themes are tokens.** Components use token-backed classes (`bg-surface`, `text-accent`, `.btn`, `.panel`) and never fixed colours or font families. A new theme is a block in `src/themes/tokens.css` plus an entry in `src/themes/index.ts`.

## Game Rules (Thunee)

- South African trick-taking card game, 2 or 4 players (4 play in teams of 2)
- 24-card deck: J, 9, A, 10, K, Q in each suit; values J=30, 9=20, A=11, 10=10, K=3, Q=2
- Play is counterclockwise. Four cards are dealt, players may call for the right to choose trump (10s window), trump is chosen, two more cards are dealt, then anyone may call Thunee.
- The counting team (the trumper's opponents) needs 105 points. First to 12 balls wins.
- Must follow suit. Breaking the rules is allowed by the app and recorded; an opponent may challenge for 4 balls.
- Special calls: Jodhi, Thunee, Double, Khanaak. Section 4 of the spec has the details and every configurable rule.

## Conventions

- Mobile-first layout; check screens at 390x844
- Game terminology: "call" not "bid", "balls" for game points
- UI copy in sentence case and plain language
- Timers use the Durable Object alarm, never `setTimeout`, on the server

## Environment Variables

None. The app and the rooms are served by the same Worker, so they always share an origin.

## Deployment

Pending. Tricks will run as one Cloudflare Worker named `tricks`, deployed by a push to `main`; the configuration and workflow are designed in `docs/superpowers/specs/2026-10-05-deploy-design.md` and not yet in place. Until then, nothing should reach `main`: Vercel's GitHub integration still builds every push to it.
