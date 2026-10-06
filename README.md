# Tricks

Trick-taking card games to play with friends or the computer, at [tricks.afrojun.dev](https://tricks.afrojun.dev). Built with React, TypeScript and Cloudflare Workers.

There are two games, each complete:

- **Thunee** (`/thunee`), the South African card game for two or four players.
- **Hearts** (`/hearts`), for four: pass three cards, avoid the hearts and the queen of spades, or take them all and shoot the moon.

## Features

- Online rooms: create a game, share its code or link, and play from any phone or computer
- Computer players to fill any seat, each with a persona of its own
- Practice against the computer with a coach that explains its hints, run entirely in your browser
- Traditional Thunee and Standard Hearts by default, with house rules as named presets you can save and share by link
- Thunee's timed calling, Thunee, Jodhi, Double, Khanaak and 4-ball challenges
- Cheating, unless a house rule turns it off: a rule-breaking card may be played, and the other side may accuse whoever played it
- Reconnects to your seat after a refresh or a dropped connection
- Three themes: Retro, Modern table and Minimal

## Local development

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173 and choose a game. `pnpm dev` runs the whole app: the pages, and the game rooms as a Cloudflare Worker inside Vite. To play alone, create a game, sit down, and add computer players to the other seats; or use "Learn to play" on a game's home.

```bash
pnpm check        # type check the app and the Worker
pnpm test         # tests
pnpm e2e          # browser games; needs pnpm dev running and Chromium installed
pnpm build        # production build: the pages and the Worker
pnpm preview      # serve the production build locally, rooms included
```

## Deployment

The pages and the rooms are one Cloudflare Worker, `tricks`, at `tricks.afrojun.dev`. Every push to `main` runs `.github/workflows/deploy.yml`: install, type check, tests, build, then `wrangler deploy` with the repository's `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets. Nothing else is deployed.

A deploy restarts the rooms, and games in progress carry on. A change to how a game is saved resets that game's rooms; `AGENTS.md` explains when. What the first deploy needs is in the "Status" section of `docs/superpowers/specs/2026-10-05-deploy-design.md`.

## How it is built

See `AGENTS.md` for the architecture, the commands and the rules that keep the code correct, `docs/superpowers/specs/2026-10-05-tricks-overview-design.md` for how Tricks is put together, and `docs/superpowers/specs/2026-10-04-thunee-rebuild-design.md` and `2026-10-05-hearts-design.md` beside it for each game's rules and settings.
