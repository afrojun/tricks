# Tricks - Multiplayer Trick-Taking Card Games

Tricks hosts trick-taking card games. Thunee is at `/thunee`; Hearts is at `/hearts`, where its rooms work but its table is still a placeholder.

## Commands

```bash
pnpm install        # install dependencies
pnpm dev            # the whole app, pages and rooms, in one Vite server (localhost:5173)
pnpm check          # type check the app (tsconfig.json) and the Worker (worker/tsconfig.json)
pnpm test           # unit, room and simulation tests (Vitest)
pnpm test:soak      # 400 simulated games per configuration, Thunee's and Hearts'
pnpm e2e            # browser games, hand controls, a practice round and a Hearts room (needs dev running, and Chromium)
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
src/kit/            Pure and shared by every game: cards, the table (seats, lobby, host, stand-ins), tricks, integrity (excuses, proofs), minds, rule helpers, the module contract (GameModule) and the contract runner. Imports nothing from the app, and no React.
src/games/index.ts  The server's list of games by id. The room, the Worker's name check and the tests read it; the browser never imports it.
src/games/<id>/     One game, which imports no other:
  engine/           Its pure rules, on the kit. One Game value, changed only by apply(game, actor, action, ctx), which is structuredClone then the in-place step.
  ai/               Its computer players: seat view -> action (with a reason code). drive.ts is the automatic loop every host shares.
  coach/            Its coach (Thunee's so far). Pure: the player's view and events -> notes.
  ui/               Its screens: the table, present (sound, toast, moment per event), dwell, its rule book, its words.
  index.ts          Its GameModule: what the room, practice and tests use.
  client.ts         Its GameClient: what the shell uses, loaded only on the game's addresses.
  practice.ts       Its GamePractice (Thunee's so far). contract.ts and testing.ts are for tests.
src/practice/       A practice game in the browser for any game with a GamePractice: local Session, virtual clock that waits for the player, saved to the device. practiceClient is what a game's client hands the shell.
src/protocol.ts     Wire messages shared by client and server, generic over a game's view, action and event types, and room names (`<game>-<CODE>`).
src/room/           TableRoom: finds its game from its name, then identity, persistence, alarm, AI driving, over a small RoomHost interface. Knows games only through their modules. Tested in Node.
worker/             Cloudflare only: the fetch handler and the Room Durable Object, a thin adapter to TableRoom.
src/client/         Socket wrapper, paced playback and the store the UI reads, for any game.
src/ui/             The shell, for any game: the Tricks home, a game's home, the lobby, the practice screen and the frame around a table, all driven by the game's GameClient (contract.ts). games.ts is the browser's static list of games with one dynamic import each; routes.ts maps /, /<game>, /<game>/<CODE> and /<game>/practice. Shared parts for games' screens: Card, Hand, Sheet, Moments, Timer, GameMenu, ThemePicker, seat placement by direction (seats.ts), and the session and coach hooks (session.tsx, coach/context.tsx).
src/presets/        Rule books (book.ts), presets saved per game, and share links that open the game's home.
src/themes/         Theme tokens and the theme list.
scripts/            End-to-end scripts.
```

Dependency direction: `ui -> client, practice, presets, kit`, and `ui -> games/<id>/client.ts` only through the dynamic imports in `src/ui/games.ts`; a game's `client.ts` and `ui/ -> src/ui` (the contract and shared parts), `practice`, `presets`; `games/<id> -> kit`, never another game; within a game `coach -> engine, ai` and `ai -> engine`, and the engine imports only the kit; `practice -> client, protocol`; `client -> protocol`; `room -> games, protocol`; `worker -> games, room`; `kit` imports nothing from the app. `room`, `protocol`, `client`, `practice` and the shell know a game only through its module, its `GamePractice` or its `GameClient`.

### Adding a game

1. **Engine** (`src/games/<id>/engine/`), on the kit. `Game` extends `TableState`; the view extends `TableView` and carries its `rules` (a rule set with `allowCheating`); `availableActions` is what both `apply` and the screens check; `apply` is `structuredClone` then an exported `step`; a `FORMAT_VERSION`. Its rules of play are excuses. Tests under `allowCheating` true and false.
2. **Computer players** (`ai/`), driven only through the module's `dueStep` and `reactions`.
3. **Module** (`index.ts`): its `GameModule`, added to `GAMES` in `src/games/index.ts`. The room and the Worker then hold its rooms.
4. **Contract fixture** (`contract.ts`): a start, a random legal player, mischief, the cards each seat may not see, and the view's secrets. Add it to `FIXTURES`, and its first-round phases and action fields to `COVERAGE`, in `src/games/index.test.ts`.
5. **Client** (`client.ts`): its `GameClient` (`src/ui/contract.ts`): name, tagline, direction, seat counts, `dwell`, `present`, `Table`, a `RuleBook` (`src/presets/book.ts`, and a line in `src/presets/books.test.ts`), lobby teams, words for its own refusals, and practice. Add it to `GAMES` and `LOADERS` in `src/ui/games.ts`; `src/ui/games.test.ts` holds the list to the client. Its screens read the table through `sessionHooks` and the coach through `coachHooks`, typed by the game.
6. **Practice** (`practice.ts`): a `GamePractice` with its coach (`src/practice/contract.ts`), handed to the shell as `practiceClient(practice, dwell)`. Until then `practice: null`, and its practice address says practice is coming.

### Rules that keep it correct

- **Engines are pure.** Nothing in a game's `engine/` reads the clock, generates randomness, or imports from other folders except the kit, which is pure too. Time and randomness arrive through `ctx`. `apply` never mutates its input and never throws on player input; it returns `{ rejected }`.
- **One source of truth.** Timers are deadlines inside the saved game. The room sets its Durable Object's single alarm to `nextDeadline(game)` after every change. Do not keep timer or game facts in server memory.
- **Rooms hibernate.** Cloudflare may drop a room between messages while its sockets stay open, then build it again; `onStart` runs on every wake and reloads the saved state. A human seat is connected exactly when an open socket's token maps to it. The token lives in the socket's state, which survives hibernation. Heartbeat pings are answered at the edge (`setWebSocketAutoResponse`), so they never wake a room.
- **Saves are not upgraded.** A change to a game's saved `Game` shape raises its `FORMAT_VERSION` (Thunee's in `src/games/thunee/engine/types.ts`), which its module carries as `formatVersion`, and rooms saved in another format reset to an empty lobby on load. Pushing such a change to `main` resets every game of it in progress. A practice save checks the same version.
- **Abandoned rooms reset.** A room with no seated human connected for 24 hours (`ABANDONED_AFTER_MS` in `src/room/room.ts`) goes back to an empty lobby. The clock is `emptySince` in the saved state and shares the one alarm with game deadlines.
- **Shared validation.** `apply` checks round actions against `availableActions(viewFor(game, seat))`, the same function the UI uses to decide what to show. Add a new action there first.
- **Views hide information.** Clients only receive `viewFor(game, seat)`. Never send `Game`. Other hands, the stock, `handBefore`, `broke`, Jodhi `valid`, tokens, `aiSalt`, a hidden persona before game over, unrevealed trump, and the cards of any trick before the last completed one must not appear in a view; the simulation test checks this. Computer players, which run on the server, get `viewFor(game, seat, 'full')` and remember the whole round.
- **The coach is honest.** Coach functions take a `View` (the player's own, with `'full'` memory), never a `Game`, and never run a computer's decision for another seat. Only the round review sees the dealt hands, after the round. Advice comes from the computer's own `decide` with the honest mind, so the hint and the computers cannot disagree; `check` must return null for the advised action.
- **Practice time waits for the player.** The practice clock (`src/practice/clock.ts`) only runs while nothing waits on the player; timers there use the browser, since there is no server.
- **Identity is a secret token, not a connection.** The browser's token maps to a seat on the server. Clients only see seat numbers.
- **A room's name is its game.** Rooms are named `<game>-<CODE>` and live at `/parties/room/<name>`; the game is read from the name on every wake and never saved. Any name whose game is not in `src/games/index.ts` is refused.
- **Every game keeps the contract.** A game is a `GameModule` (`src/kit/module.ts`): the room, practice and tests use nothing else of it. `apply` never throws, whatever the message or the actor; `checkMalformed` in `src/kit/contract.ts` checks every game in the list.
- **Storage keys.** Everything the browser keeps starts with `tricks-`; a game's own keys start with `tricks-<game>-` (for example `tricks-thunee-presets`).
- **Paced playback.** `src/client/playback.ts` holds each server message on screen for a dwell set by its events, and skips ahead when a backlog builds. Sending an action releases the hold. Each game says how long its events hold the screen; a new event that should be seen needs a dwell in its `ui/dwell.ts`.
- **One definition of a rule.** Each rule of play is an excuse: "you may play this only if you hold none of those" (Thunee's `excusesFor` in `src/games/thunee/engine/tricks.ts`, Hearts' in `src/games/hearts/engine/excuses.ts`, the machinery in `src/kit/integrity.ts`). Legal cards, the hidden `broke` record of each play, the verdict on an accusation, the proofs computers find and the cards a careful cheat holds back all come from it.
- **Computer personas.** Each computer seat has a persona (`src/kit/mind.ts`) that decides whether it cheats and how well it watches. Every AI chance is `roll(aiSalt, seat, id)`, a pure hash, so a decision never changes on re-evaluation and nothing about it is held in server memory. A stand-in for a human, and every computer while `allowCheating` is off, plays as Straight. `src/games/thunee/ai/decisions.test.ts` pins what Thunee's computers decide.
- **Events, not diffs.** Sounds, toasts and celebrations are driven by numbered events from the server (`store.onEvent`), never by comparing one view with the last. The frame shows what the game's `present` returns for each; a game's table may listen for its own, as Thunee's does for its balls.
- **The shell knows no game.** Nothing in `src/ui` names a game except the static list in `src/ui/games.ts`. Each game's screens are a chunk of their own (`vite build` names it after the game), fetched only on its addresses; the Tricks home loads none.
- **Rules are data.** Every variant is a field of the game's rule set (Thunee's `RuleSet` in `src/games/thunee/engine/rules.ts`), frozen into the game at start. The defaults (Thunee's Traditional, Hearts' Standard) come first; a preset stores only its differences, under `tricks-<game>-presets`, and a share link opens `/<game>`. A new rule needs: the field and its default, the engine branch, a line in the game's rule book (`ui/rules.ts`), a line in its `ruleOverridesSchema`, and tests under each value.
- **Themes are tokens.** Components use token-backed classes (`bg-surface`, `text-accent`, `.btn`, `.panel`) and never fixed colours or font families. A new theme is a block in `src/themes/tokens.css` plus an entry in `src/themes/index.ts`.

## Game Rules (Thunee)

- South African trick-taking card game, 2 or 4 players (4 play in teams of 2)
- 24-card deck: J, 9, A, 10, K, Q in each suit; values J=30, 9=20, A=11, 10=10, K=3, Q=2
- Play is counterclockwise. Four cards are dealt, players may call for the right to choose trump (10s window), trump is chosen, two more cards are dealt, then anyone may call Thunee.
- The counting team (the trumper's opponents) needs 105 points. First to 12 balls wins.
- Must follow suit. Breaking the rules is allowed by the app and recorded; an opponent may challenge for 4 balls. The house rule `allowCheating` turns this off: the app then refuses a rule-breaking card or a false Jodhi, and nobody may challenge.
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
