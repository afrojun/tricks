# Thunee

A multiplayer South African card game for two or four players, built with React, TypeScript and PartyKit.

## Features

- Two-player and four-player games, with computer players to fill seats
- Traditional rules by default, with house rules as named presets you can save and share by link
- Timed calling, Thunee, Jodhi, Double, Khanaak and 4-ball challenges
- Reconnects to your seat after a refresh or a dropped connection
- Three themes: Retro, Modern table and Minimal

## Local development

```bash
pnpm install

# Terminal 1: game server
pnpm party

# Terminal 2: frontend
pnpm dev
```

Open http://localhost:5173. To play alone, create a game, sit down, and add computer players to the other seats.

```bash
pnpm check   # type check
pnpm test    # tests
pnpm e2e     # browser games; needs both servers running and Chromium installed
```

## Deployment

1. Deploy the PartyKit server: `pnpm exec partykit login`, then `pnpm party:deploy`. Note the URL, `tuscan-thunee.YOUR_USERNAME.partykit.dev`.
2. Deploy the frontend to any static host (Vercel, Cloudflare Pages, Netlify) with `pnpm build`, serving `dist/` and rewriting all paths to `/`.
3. Set the `VITE_PARTYKIT_HOST` environment variable on the frontend host to the PartyKit URL and redeploy.

## How it is built

See `AGENTS.md` for the architecture and `docs/superpowers/specs/2026-10-04-thunee-rebuild-design.md` for the design, including every rule and setting.
