# Thunee Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Thunee app with a pure rules engine, a thin PartyKit room, an event-driven React client, themes, and shareable rule presets.

**Architecture:** One serializable `Game` value changed only by `apply(game, actor, action, ctx)`. The server validates, applies, saves, and sends each connection its own `View` plus numbered events. The client renders the view and plays events once. Rules are a `RuleSet` frozen into the game.

**Tech Stack:** TypeScript, Vite, React, Tailwind, PartyKit, Zod, pnpm, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-04-thunee-rebuild-design.md` — read it first; rule details live there and are not repeated here.

**Execution:** Native, in one session. The user approved the spec and waived plan review. Test-first within each task; commit after each task.

## Global Constraints

- `src/engine/` imports nothing from `party/`, `src/ai/`, `src/client/`, `src/ui/`. It never calls `Date.now()`, `Math.random()` or `crypto`. Time and randomness arrive through `ctx`.
- `apply` never throws on player input; it returns `{ rejected: reason }`. It never mutates its input.
- No client ever receives another seat's hand, the stock, `handBefore`, `legal`, Jodhi `valid`, a token, or trump before reveal (except the trumper).
- Play is counterclockwise: `next(seat) = (seat + 1) % n`. Teams are seat parity.
- Game terms in UI copy: "call" not "bid", "balls" for game points.
- UI components use theme tokens only; no hard-coded colours or font families.
- Package manager pnpm (run as `corepack pnpm`); tests with Vitest; `pnpm check` must pass before each commit.
- Old `src/` and `party/` code stays until Task 9 removes it; new code lives in new paths and Vitest only includes new paths.

## Review Focus

1. **Same token in two tabs, one closes** — the seat must stay connected while any connection for it remains. Test in Task 6.
2. **Stale action after a phase change** (card played during the trick pause, call after the window closed) — rejected with a reason, state unchanged. Test in Task 3.
3. **Hostile or sloppy names and codes** (empty, 200 characters, whitespace only, lower-case room code) — names are trimmed and capped at 16 characters, empty names rejected, room codes upper-cased. Tests in Tasks 2 and 9.
4. **Corrupted, truncated or newer-version share link** — a clear "can't read this preset" message, no crash, unknown settings ignored. Test in Task 11.
5. **Client clock differs from server clock** — countdowns use the server's `now` sent with each sync, not the local clock alone. Test in Task 8.

## File Structure

```
src/engine/
  cards.ts        Suit, Rank, Card, deck, shuffle, points, comparison
  rules.ts        RuleSet, TRADITIONAL, CLASSIC_APP, resolveRules, diffRules
  types.ts        Game, Phase variants, RoundPlay, Action, Actor, GameEvent, RoundSummary, View, RejectReason
  seats.ts        next, teamOf, partnerOf, seat helpers
  tricks.ts       isLegalPlay, legalPlays, trickWinner, trickPoints
  deal.ts         startRound, dealFinal, startSecondHalf
  scoring.ts      scoreNormal, scoreThunee, scoreDouble, scoreKhanaak, scoreChallenge, finishRound
  view.ts         viewFor
  available.ts    availableActions(view)
  lobby.ts        lobby and seat actions
  round.ts        calling, trump, thunee window, play, claims, challenges
  apply.ts        apply (dispatch), tick, nextDeadline, seatsToAct
  invariants.ts   checkInvariants
  schema.ts       Zod schemas: actionSchema, ruleOverridesSchema
  index.ts        public exports
  testing.ts      seeded rng, deck builders, game drivers for tests
src/ai/
  evaluate.ts     hand strength
  choose.ts       chooseAction(view, rng), chooseJodhi(view), fallbackAction(view)
party/
  server.ts       ThuneeRoom: identity, queue, persistence, alarm, AI driving
  protocol.ts     wire message types and schemas
src/client/
  identity.ts     device token
  connection.ts   PartySocket wrapper
  store.ts        GameStore: view, version, event queue, server clock offset
  hooks.ts        React bindings
src/ui/           screens/, table/, components/, sound.ts
src/themes/       tokens.css, retro/, modern/, minimal/, index.ts
src/presets/      storage.ts, share.ts
```

## Core Interfaces (the contract between tasks)

```ts
type Seat = number                       // 0..playerCount-1
type Team = 0 | 1
type Actor = Seat | null | 'system'      // null = unseated connection
type Ctx = { now: number; rng: () => number }

apply(game: Game, actor: Actor, action: Action, ctx: Ctx):
  { game: Game; events: GameEvent[] } | { rejected: RejectReason }
createGame(): Game                                   // lobby, 4 players, Traditional
viewFor(game: Game, seat: Seat | null): View
availableActions(view: View): Available
nextDeadline(game: Game): number | null              // min(phase deadline, aiActAt)
seatsToAct(game: Game): Seat[]
isAiControlled(game: Game, seat: Seat): boolean
checkInvariants(game: Game): void

// src/ai
chooseAction(view: View, rng: () => number): Action
chooseJodhi(view: View): Action | null
fallbackAction(view: View): Action

// wire
type ClientMessage = { action: Action }
type ServerMessage =
  | { type: 'sync'; version: number; now: number; seat: Seat | null; view: View; events: NumberedEvent[] }
  | { type: 'rejected'; reason: RejectReason }
  | { type: 'error'; message: string }
```

`apply` validates every seated round action by checking it against `availableActions(viewFor(game, actor))`, so the UI and the server cannot disagree.

---

## Stage 1 — Engine

### Task 1: Tooling, cards, rules

**Files:** `package.json`, `pnpm-lock.yaml`, `vitest.config.ts`, `src/engine/cards.ts`, `src/engine/rules.ts`, `src/engine/seats.ts`, tests beside each.

- [ ] Remove `bun.lock`, set `packageManager`, add `vitest` and `zod`, scripts `test` = `vitest run`, `check` = `tsc --noEmit`. Vitest `include`: `src/engine/**`, `src/ai/**`, `src/client/**`, `src/presets/**`, `party/server.test.ts`.
- [ ] Tests: deck has 24 unique cards and totals 304 points; `shuffle` is deterministic for a seeded rng and is a permutation; rank order J > 9 > A > 10 > K > Q; `resolveRules({})` equals `TRADITIONAL`; `diffRules(CLASSIC_APP)` round-trips through `resolveRules`; `next`, `teamOf`, `partnerOf` for 2 and 4 seats.
- [ ] Implement, run, commit.

### Task 2: Types, lobby, view, available actions

**Files:** `types.ts`, `lobby.ts`, `view.ts`, `available.ts`, `apply.ts` (lobby dispatch only), `testing.ts`, tests.

- [ ] Tests: first to sit becomes host; sitting in a taken seat is rejected; names are trimmed, capped at 16, empty rejected; only host may `addAi`, `removeAi`, `setRules`, `setPlayerCount`, `start`; `start` rejected until every seat is filled; `setPlayerCount` to 2 rejected while seat 2 or 3 is occupied; host passes to the next connected human when the host disconnects or leaves; `apply` does not mutate its input (deep-frozen game).
- [ ] Implement, run, commit.

### Task 3: Calling, trump, Thunee window

**Files:** `deal.ts`, `round.ts`, `apply.ts` (`tick`, `nextDeadline`, `seatsToAct`), tests.

- [ ] Tests: deal gives 4 cards each starting at dealer's right and leaves 8 in stock; valid call amounts; first call rejected from the default trumper; raise rejected from the highest caller's partner; each call resets the deadline; window closes on `tick` past the deadline and early when all eligible seats pass; preselect is honoured and cleared on outcall; trump must be a held suit or `lastCard`; final deal gives 6 cards; no-trump redeal under the setting; Thunee eligibility under `anyone` and `trumperOnly`; six-of-a-suit may not call; counting-team call is held and overridden by the trumper's team; default trumper under `dealerRight` and `teamAhead`; stale actions (call after the window, `chooseTrump` by a non-trumper) rejected with no state change; views in these phases hide other hands, the stock and unrevealed trump.
- [ ] Implement, run, commit.

### Task 4: Play, claims, challenges, scoring

**Files:** `tricks.ts`, `scoring.ts`, `round.ts`, tests.

- [ ] Tests: trick winner with and without trump; illegal play accepted and recorded `legal: false`; card not in hand and out-of-turn rejected; undercut restriction both ways; trump revealed after the first lead; first leader is `next(trumper)`; Thunee leader, trump and winner under each setting, partner catch pays 8; Jodhi timing and values, `inHand` versus `dealt`; Double success and failure, refused on corner house; Khanaak strict and simple, forward and backward, and the 13-ball setting; challenge of a cheat, of an honest play, of a true and a false Jodhi; normal scoring lines with `transfer` and `bonus`, call-and-lost; dealer rotation under both settings; game over at target and with `twoToClear`; rematch.
- [ ] Regression tests named for the old bugs: Thunee in round 2 is judged on round 2 only; nothing carries over between rounds; the winner announced matches the team that reached the target.
- [ ] Implement, run, commit.

### Task 5: Two-player game, invariants, simulation

**Files:** `deal.ts`, `scoring.ts`, `invariants.ts`, `schema.ts`, `index.ts`, `src/ai/*`, tests.

- [ ] Tests: second half deals the remaining 12 cards, keeps trump and call, sixth-trick winner leads; scored once after twelve tricks with the last-trick adjustment applied once; Thunee ends the round after the first half; Double and Khanaak unavailable.
- [ ] `checkInvariants`: 24 cards accounted for across hands, stock and tricks; no duplicate cards; `seatsToAct` non-empty or a deadline pending in every non-terminal phase except `lobby`, `roundResult`, `gameOver`.
- [ ] AI (`src/ai/`): legal play choice, calling from hand strength, trump choice, honest Jodhi, conservative Thunee/Double/Khanaak, `fallbackAction`.
- [ ] Simulation test: 2,000 seeded games each for 4P Traditional, 4P Classic, 2P Traditional, 2P Classic, driven by the AI plus random cheating and random challenges; invariants after every action; every game reaches `gameOver`; AI actions are never rejected; card points across both teams total 304 in every normally scored round.
- [ ] Zod `actionSchema` accepts every action the simulation produced and rejects malformed ones.
- [ ] Implement, run, commit.

## Stage 2 — Server

### Task 6: PartyKit room

**Files:** `party/server.ts`, `party/protocol.ts`, `party/server.test.ts`, `partykit.json` (main → `party/server.ts`), `scripts/play.ts`.

- [ ] Tests against a fake room with a controllable clock and in-memory storage: a token that sat reconnects to the same seat with its hand; two connections on one token, closing one keeps the seat connected; an unknown token is a spectator and receives no hands; a non-host `start` is rejected to the sender only; malformed JSON and unknown actions are rejected without a state change; state is written before any sync is sent; a new room instance built from the same storage mid-call-window resumes and closes the window when the alarm fires; AI seats act on alarms and a 4-seat game with three AIs and one scripted human reaches `gameOver`; `replaceWithAi` and `reclaimSeat`; an unreadable `formatVersion` starts a fresh lobby; a newly connected client receives a view with no events.
- [ ] `scripts/play.ts`: connects real sockets to `partykit dev` and plays a full game; run it once against the dev server.
- [ ] Implement, run, commit.

## Stage 3 — Client

### Task 7: Tooling upgrade and theme tokens

- [ ] Upgrade React, Vite, Tailwind, TypeScript to current; remove the old `src/` app code, old `party/` code and `@types/bun`; define token CSS variables and the Retro theme; port the card face, card backs and sounds from the old code into the Retro theme.

### Task 8: Client store

**Files:** `src/client/*`, tests.

- [ ] Tests: a sync replaces the view and appends only events with a number above the last seen; a reconnect sync does not replay events; a stale version is ignored; `serverNow()` applies the offset measured from the last sync, so a client clock 30 s off still counts down correctly; a rejection surfaces once.
- [ ] Implement, run, commit.

### Task 9: Screens

**Files:** `src/ui/**`, `src/App.tsx`, `src/main.tsx`, `index.html`.

- [ ] Home, Lobby, Table, Round result, Game over, history and rules sheets, connection banner, error boundary, event-driven sounds and celebration. Room codes are upper-cased on entry.
- [ ] Play a full game in a real browser at phone size: one human with three AIs, then a two-tab game with a refresh and a dropped connection mid-hand.
- [ ] Update `AGENTS.md`, `README.md`, and the deploy workflow for pnpm and the new paths. Commit.

## Stage 4 — Themes and presets

### Task 10: Modern Table and Minimal themes

- [ ] Two further themes built only from tokens and card renderers; theme switcher on Home and in the table menu; check each at phone size in the browser. Commit.

### Task 11: Presets and share links

**Files:** `src/presets/storage.ts`, `src/presets/share.ts`, tests, rule editor UI.

- [ ] Tests: save, list, rename, delete; built-ins are read-only; a share string round-trips; unknown settings are ignored and missing ones take Traditional values; truncated, non-base64 and wrong-version strings return an error result instead of throwing.
- [ ] Rule editor in the lobby (host), preset picker on Home, "save shared preset" prompt when a share link is opened. Commit.

## Final

- [ ] Full test run, type check, production build, one more full browser game per theme, then a whole-branch review by a fresh reviewer.
