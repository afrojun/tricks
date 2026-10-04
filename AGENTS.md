# Thunee - Multiplayer Card Game

## Commands

```bash
pnpm install        # install dependencies
pnpm dev            # frontend dev server (localhost:5173)
pnpm party          # PartyKit game server (localhost:1999)
pnpm check          # type check
pnpm test           # unit, server and simulation tests (Vitest)
pnpm test:soak      # 400 simulated games per configuration
pnpm e2e            # browser games and hand controls (needs dev + party running, and Chromium)
pnpm e2e:sockets    # a full game over real sockets (needs party running)
pnpm build          # production build
pnpm party:deploy   # deploy PartyKit to production
```

To try a game alone: create a game, sit down, and use "Add computer" on the other seats.

In development Vite proxies `/parties` to PartyKit, so the app needs only one URL. To play from another device, point an HTTPS tunnel (for example `tailscale serve`) at `127.0.0.1:5173`; `*.ts.net` hosts are already allowed in `vite.config.ts`.

## Tech Stack

- **Frontend**: Vite + React + TypeScript
- **Styling**: Tailwind CSS v4 over theme tokens (CSS custom properties)
- **Real-time**: PartyKit (WebSocket game server)
- **Validation**: Zod
- **Package manager**: pnpm; **tests**: Vitest

## Architecture

The design is written up in `docs/superpowers/specs/2026-10-04-thunee-rebuild-design.md`.

```
src/engine/    Pure rules. One Game value, changed only by apply(game, actor, action, ctx).
src/ai/        Computer players: seat view -> action.
src/protocol.ts  Wire messages shared by client and server.
party/server.ts  PartyKit room: identity, persistence, alarm, AI driving.
src/client/    Socket wrapper and the store the UI reads.
src/ui/        Screens and components.
src/themes/    Theme tokens and the theme list.
src/presets/   Rule presets: storage, share links, descriptions.
scripts/       End-to-end scripts.
```

Dependency direction: `ui -> client -> engine`; `party -> engine, ai`; `ai -> engine`.

### Rules that keep it correct

- **The engine is pure.** Nothing in `src/engine/` reads the clock, generates randomness, or imports from other folders. Time and randomness arrive through `ctx`. `apply` never mutates its input and never throws on player input; it returns `{ rejected }`.
- **One source of truth.** Timers are deadlines inside the saved game. The server sets PartyKit's single alarm to `nextDeadline(game)` after every change. Do not keep timer or game facts in server memory.
- **Abandoned rooms reset.** A room with no seated human connected for 24 hours (`ABANDONED_AFTER_MS` in `party/server.ts`) goes back to an empty lobby. The clock is `emptySince` in the saved state and shares the one alarm with game deadlines.
- **Shared validation.** `apply` checks round actions against `availableActions(viewFor(game, seat))`, the same function the UI uses to decide what to show. Add a new action there first.
- **Views hide information.** Clients only receive `viewFor(game, seat)`. Never send `Game`. Other hands, the stock, `handBefore`, `legal`, Jodhi `valid`, tokens, `aiSalt`, a hidden persona before game over, unrevealed trump, and the cards of any trick before the last completed one must not appear in a view; the simulation test checks this. Computer players, which run on the server, get `viewFor(game, seat, 'full')` and remember the whole round.
- **Identity is a secret token, not a connection.** The browser's token maps to a seat on the server. Clients only see seat numbers.
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
- Timers use the PartyKit alarm API, never `setTimeout`, on the server

## Environment Variables

```bash
# For production deployment
VITE_PARTYKIT_HOST=your-app.partykit.dev
```

## Deployment

### PartyKit server

```bash
pnpm exec partykit login
pnpm party:deploy
```

Server URL will be `tuscan-thunee.USERNAME.partykit.dev`. Pushes to `main` that touch the server deploy automatically through `.github/workflows/deploy-partykit.yml`.

### Frontend (Vercel recommended)

```bash
vercel
```

Set `VITE_PARTYKIT_HOST` in Vercel dashboard → Settings → Environment Variables, then redeploy. Any static host works: `pnpm build` and serve `dist/` with all paths rewritten to `/`.
