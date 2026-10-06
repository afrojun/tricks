# Final Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every finding of the final whole-branch review of Tricks that is this wave's (`.superpowers/sdd/tricks/final-review-1.md`): C1, I1, M1, M3 and M4. M2 (splitting wire schemas from the kit's table helpers) and M5's sentence in `AGENTS.md` belong to others.

**Architecture:** The room looks a connection's token up only among its own saved tokens and accepts only a whole seat a human holds; every send to one connection is tried on its own, and the alarm is armed before anyone is told. The client's store takes the first sync after a (re)connect as the baseline for events as well as for the view. The rules editor's number field keeps a draft, and − and + step from it. Two overlays read new theme tokens. The Hearts browser script plays a whole game.

**Tech Stack:** TypeScript, React, Vitest, Playwright (scripts), Tailwind v4 over theme tokens.

**Specs:** `docs/superpowers/specs/2026-10-05-cloudflare-and-rename-design.md` sections 2 and 3 (the room, the host interface, hibernation); `AGENTS.md`.

## Global Constraints

- Edit only `src/room/**`, `src/client/**`, `src/ui/Rules.tsx` and its tests, `src/index.css`, `src/themes/tokens.css`, `scripts/e2e-hearts.ts`, `scripts/play.ts`, tests for these and this plan. Another implementer owns `wrangler.jsonc`, `.github/workflows/**`, `AGENTS.md`, `README.md`, `package.json` scripts and the deploy specs.
- Nothing about how either game plays changes: no engine, kit, player or coach code. No existing assertion is weakened.
- Test first for C1, I1 and M1: the test fails, then the fix. One commit per finding.
- Tools from `node_modules/.bin`; `corepack pnpm run check`; full runs with `--testTimeout=60000`; a dev server for the scripts on port 5273 (`APP_URL=http://localhost:5273`).

## Review Focus

1. **A stranger cannot stall a room.** No token outside the room's own saved map resolves to a seat, and no one connection's failure stops the save, the alarm, the computers or anyone else's view.
2. **A reset room is heard.** After a reconnect, new events play even when the room's numbers started again from one; history is still not replayed and duplicates are still dropped.
3. **One tap, one change.** A typed number then − or + sends one change, stepped from what was typed.

---

## File map

| File | Change |
|---|---|
| `src/room/room.ts` | `seatOf` reads own properties only and checks the seat; tokens rebuilt with own data properties; sends guarded per connection; alarm armed before the broadcast |
| `src/room/room.test.ts` | Inherited-name tokens in the lobby, in play and across a wake, for both games; a throwing socket; a client reconnecting to a format reset |
| `src/client/store.ts`, `store.test.ts` | The first sync after a (re)connect resets the event watermark |
| `src/ui/Rules.tsx`, `src/ui/Rules.test.ts` | A number rule's draft, `leaveField` and `stepField`; − and + keep the field's focus |
| `src/themes/tokens.css`, `src/index.css` | `--card-dim` and `--backdrop` in every theme |
| `scripts/e2e-hearts.ts` | A whole Hearts game with one human: thirteen tricks to the result, on to game over, the host's rematch, the scores added up; a typed end score stepped by − |
| `scripts/play.ts` | Comment: Hearts has screens |

---

### Task 1 (C1): A token named like an inherited property is a stranger

**Files:** `src/room/room.ts`, `src/room/room.test.ts`.

- [ ] Tests: for `__defineGetter__`, `propertyIsEnumerable`, `constructor` and `toString`, in a Thunee and a Hearts room: connecting in the lobby is a spectator, and starting the game afterwards saves it, arms the alarm and serves everyone with no error; connecting during play is a spectator and play goes on; a wake that must tell the table about a lost seat completes and keeps the alarm. A socket whose `send` throws: the others still get the new version, the alarm is armed, the failure is logged.
- [ ] See them fail. `seatOf` requires `Object.hasOwn` and an integer seat that a human holds; the tokens map is rebuilt with `Object.fromEntries`; `send`, `sendTo` and `broadcast` try each connection on its own; `act` arms the alarm right after the save.
- [ ] Pass; the room's other tests pass unchanged. Commit.

### Task 2 (I1): The first sync after a reconnect is the events' baseline

**Files:** `src/client/store.ts`, `src/client/store.test.ts`, `src/room/room.test.ts`.

- [ ] Tests: events 1 to 75 seen, a reconnect to version 0 with no events, then event 1 plays. Duplicates after the baseline are still dropped. In the room's tests, a store fed from a real connection hears the first event of a room reset by a format change.
- [ ] See them fail. On the first sync after a (re)connect, `lastEvent` becomes the highest number in that sync, or zero.
- [ ] Pass. Commit.

### Task 3 (M1): − and + step from the typed number

**Files:** `src/ui/Rules.tsx`, `src/ui/Rules.test.ts`.

- [ ] Tests: with the room at 100 (step 25), typing 101 then + sends exactly one change, 126; leaving the field first then + ends at 126 too; an invalid draft steps from the room's value; at the limit nothing is sent unless a number was typed.
- [ ] See them fail (the helpers do not exist). Implement `leaveField` and `stepField`; the number editor keeps its draft in state, keyed by the room's value, and its buttons keep the field's focus on mouse down.
- [ ] Pass. Commit.

### Task 4 (M4): Dimming and backdrops are tokens

**Files:** `src/themes/tokens.css`, `src/index.css`.

- [ ] Add `--card-dim: rgb(60 60 60 / 0.22)` and `--backdrop: rgb(0 0 0 / 0.5)` to every theme block, today's values, and use them.
- [ ] A screenshot per theme of a dimmed card and an open sheet at 390 by 844. Commit.

### Task 5 (M3): A whole Hearts game in the browser

**Files:** `scripts/e2e-hearts.ts`, `scripts/play.ts`.

- [ ] A new room, one human and three Straight computers, the end score typed as 50 then stepped by − to 25 (one change sent, checked on the socket). Pass each round, play every card by tapping it; at each result the round's points add up to 26 (78 for a moon), the totals are the sums of the rounds, the first round ended after thirteen tricks with thirteen cards from the human. Then game over: the winner holds the fewest points and someone reached 25. The host's "Play again" starts round one at zero.
- [ ] Fix the comment in `scripts/play.ts`. All browser scripts and `play.ts` pass against port 5273. Commit.

## Rulings

Recorded in the report as they are made.
