# Tricks

Trick-taking card games to play with friends or the computer, built with React, TypeScript and Cloudflare Workers. The first game is Thunee, the South African card game for two or four players, at `/thunee`. Hearts, for four, is at `/hearts`: its rooms, lobby and computer players work, and its table is still being built.

## Features

- Two-player and four-player Thunee, with computer players to fill seats
- Traditional rules by default, with house rules as named presets you can save and share by link
- Timed calling, Thunee, Jodhi, Double, Khanaak and 4-ball challenges
- Practice games against the computer with a coach
- Reconnects to your seat after a refresh or a dropped connection
- Three themes: Retro, Modern table and Minimal

## Local development

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173 and choose Thunee. `pnpm dev` runs the whole app: the pages, and the game rooms as a Cloudflare Worker inside Vite. To play alone, create a game, sit down, and add computer players to the other seats.

```bash
pnpm check   # type check the app and the Worker
pnpm test    # tests
pnpm e2e     # browser games; needs pnpm dev running and Chromium installed
```

## Deployment

Pending. The app and its rooms will deploy together as one Cloudflare Worker; see `docs/superpowers/specs/2026-10-05-deploy-design.md`.

## How it is built

See `AGENTS.md` for the architecture, `docs/superpowers/specs/2026-10-05-tricks-overview-design.md` for where Tricks is going, and `docs/superpowers/specs/2026-10-04-thunee-rebuild-design.md` for Thunee's design, including every rule and setting.
