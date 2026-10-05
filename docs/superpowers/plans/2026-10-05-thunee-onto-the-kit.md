# Thunee onto the Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thunee's engine and computer players run on the shared kit (`src/kit/`), in place, so the copies the kit was made from disappear; and Thunee gains the house rule `allowCheating`.

**Architecture:** Thunee's `Game` extends the kit's `TableState` and its `View` extends `TableView`. `apply` stays a thin "clone, then change the draft" wrapper: table actions go to `tableAction`, `setRules` to `checkLobbyHost`, round actions to Thunee, and `settle` runs after every applied action. Thunee's two rules of play, `renege` and `undercut`, are written once as excuses (`excusesFor` in `src/engine/tricks.ts`). Legal cards, the hidden `broke` record of each play, the verdict on an accusation and the `SeenPlay` list a computer proves cheats from all come from it. The computers keep their own strategy, salience, Jodhi proofs and hunches, and take `playProofs`, `noticed`, `exposes`, `noticeOdds`, `chanceOfVoid` and the minds from the kit.

**Tech Stack:** TypeScript, Vitest, Zod.

**Specs:** `docs/superpowers/specs/2026-10-05-game-modules-design.md` sections 3, 5, the engine and computer parts of 6, 8, and steps 3 and 4 of 9. Notes from sub-project C: `.superpowers/sdd/tricks/C-kit-hearts-report.md`, "For sub-project D".

## Global Constraints

- Thunee's files stay where they are (`src/engine/`, `src/ai/`, `src/coach/`, `src/ui/`). No module contract, generic room, client or practice yet; those touch only renamed fields and moved imports.
- Players see no change except the new rule in the rules list. Computers make the same decisions for the same salt; a pinned test proves it.
- Every existing test passes. A test changes only where a renamed field or a moved import forces it, and no assertion is weakened.
- The kit stays pure and imports nothing from the app. A change to it is minimal, keeps Hearts' tests passing, and is recorded.
- `apply` never mutates its input and never throws on player input. Round actions are checked against `availableActions(viewFor(game, seat))`.
- The saved shape changes (`acting` → `waiting`, `legal` → `broke`, `allowCheating`), so `FORMAT_VERSION` rises, and the practice save's format with it.
- Tools run from `node_modules/.bin`: `./node_modules/.bin/vitest run`, `./node_modules/.bin/tsc --noEmit`; the full check is `corepack pnpm run check`.

## Review Focus

1. **Same decisions.** Proof ids keep their form (`renege:…`, `undercut:…`, `jodhi:…`), salience is multiplied in today's order, `noticed` sees only proofs that can be accused, and `holdBack`'s `exposes` agrees with today's shown voids. The pinned hash of whole seeded games checks all of it.
2. **One description of a rule.** `available.legal`, `PlayRecord.broke`, the verdict and `seenPlays(view)` all come from `excusesFor`.
3. **Cheating off.** `play` equals `legal`, a false Jodhi is refused, nobody may accuse, every computer is Straight, and the lobby offers no personas. The simulation runs with it off, and the invariants refuse any rule-breaking card or false claim.

---

## File map

| File | Change |
|---|---|
| `src/engine/types.ts` | `Game extends TableState`, `View extends TableView`; `waiting`; `PlayRecord` is the kit's; table types re-exported; `FORMAT_VERSION` 3 |
| `src/engine/apply.ts` | `tableAction`, `checkLobbyHost`, `settle`; `untimedSeats`; `isAction` guard |
| `src/engine/lobby.ts` | Deleted |
| `src/engine/available.ts` | Loses `canStart`, `replaceableSeats`, `STALL_MS`; `play`, `legal` and the accusation lists follow `allowCheating` |
| `src/engine/seats.ts`, `cards.ts`, `testing.ts`, `view.ts` | Generic parts come from the kit; Thunee keeps teams, ranks, values, `strength` |
| `src/engine/tricks.ts` | `excusesFor`, `isLegalPlay`, `legalPlays`, `seenPlays`, `trickWinner` over the kit |
| `src/engine/round.ts`, `scoring.ts` | `recordPlay`, `firstCheat`, the verdict's `rule`; a false claim refused with cheating off |
| `src/engine/invariants.ts` | `waiting` matches; nothing rule-breaking accepted with cheating off |
| `src/engine/rules.ts`, `schema.ts`, `src/presets/describe.ts` | `allowCheating` |
| `src/ai/mind.ts` | Deleted |
| `src/ai/suspicion.ts`, `cheat.ts`, `drive.ts` | `playProofs`, `noticed`, `exposes`, kit odds and minds, kit `Step`/`Ask` |
| `src/ai/decisions.test.ts` | New: the pinned hash of computers' decisions |
| `src/kit/integrity.ts` | `playProofs` takes an optional salience |
| `src/ui/Table.tsx`, `Lobby.tsx`, `Hand.tsx`, `personas.ts`, `text.ts` | No accuse control, personas or "play anyway" with cheating off; the new reject reasons |
| `src/practice/game.ts` | `PRACTICE_FORMAT` 2 |

---

### Task 1: Pin what computers decide

**Files:** Create `src/ai/decisions.test.ts`.

- [ ] Seeded whole games, two and four players, Traditional and Classic, every persona and a surprise: computers driven only through `dueStep` and `reactions` as a host does, one human seat that takes the honest choice and now and then plays any card, bluffs a Jodhi or accuses. Fold every applied `(actor, action)` into one FNV-1a hash.
- [ ] Compute the hash on today's code and pin it, with the action count. Commit "Pin what Thunee's computers decide, before the engine moves onto the kit".

### Task 2: The table from the kit

**Files:** Modify `src/engine/types.ts`, `apply.ts`, `available.ts`, `view.ts`, `seats.ts`, `invariants.ts`, `schema.ts`, `index.ts`, `src/practice/game.ts`. Delete `src/engine/lobby.ts`.

- [ ] Test first: `waiting` in `play.test.ts`-style cases (the turn is waited on with its start time, a trick pause waits on nobody, the same seat keeps its `since`); a message that is not an action is refused, never thrown.
- [ ] `Game` and `View` extend the kit's table types; `acting` becomes `waiting`. `apply` dispatches table actions to `tableAction` (then deals on `start`, ticks on `tick`), `setRules` through `checkLobbyHost`, and calls `settle(draft, ctx, seatsToAct, untimedSeats)`. `actionSchema` uses `tableActionSchemas([2, 4])`. Seat helpers, `isAiControlled`, `cleanName`, `canStart`, `replaceableSeats`, `STALL_MS` and the persona list come from the kit, re-exported by the engine's index. The invariants check that `waiting` is the untimed seats. `FORMAT_VERSION` 3, `PRACTICE_FORMAT` 2.
- [ ] Every test passes, the pin included. Commit "Seat Thunee at the kit's table: lobby, host, stand-ins and who is waited on".

### Task 3: Cards, tricks and test helpers from the kit

**Files:** Modify `src/engine/cards.ts`, `tricks.ts`, `testing.ts`, `view.ts`.

- [ ] `Card` is the kit's `Card<Rank>`; `SUITS`, `shuffle`, `sameCard`, `hasCard`, `removeCard`, `cardId`, `SUIT_SYMBOL`, `SUIT_NAME`, `cardText` are the kit's, re-exported. Thunee adds `strength(card)`. `trickWinner(plays, trump)` is the kit's with Thunee's order. `seededRng`, `deepFreeze`, `collectCards` and `Memory` are the kit's.
- [ ] Every test passes. Commit "Take cards, the trick winner and test helpers from the kit".

### Task 4: Rules of play as excuses

**Files:** Modify `src/engine/tricks.ts`, `round.ts`, `scoring.ts`, `types.ts`, `index.ts`; tests in `src/engine/excuses.test.ts`.

- [ ] Tests: each `isLegalPlay` case gives the same answer through `excusesFor`; a renege records `['renege']`, an undercut `['undercut']`, a renege that undercuts both, a legal play nothing; the verdict names the first rule broken; `seenPlays` from a full view rebuilds every record's `broke`; table memory derives no excuse for a trick it cannot see.
- [ ] `excusesFor(card, trick, trump, rules)` names `renege` and `undercut`. `isLegalPlay` and `legalPlays` derive from it; `playCard` stores `recordPlay(...)`; `challengePlay` uses `firstCheat`; the summary's challenge carries `rule`. `legal: boolean` becomes `broke: string[]`.
- [ ] Every test passes. Commit "Write Thunee's renege and undercut once, as excuses, and record what a play broke".

### Task 5: Proofs and covering tracks from the kit

**Files:** Modify `src/ai/suspicion.ts`, `cheat.ts`, `drive.ts`, `src/kit/integrity.ts`, `src/kit/integrity.test.ts`.

- [ ] Kit test: `playProofs` takes an optional salience from the cheat and the revealing play, 1 without it.
- [ ] `findProofs` is `playProofs(seenPlays(view), opponent, salience)` plus Thunee's Jodhi proofs (`rule: null`). `chooseChallenge` passes `noticed` only proofs it may accuse. `noticeOdds` and `chanceOfVoid` are the kit's. `holdBack` keeps a card back when `exposes` says it would show up an excuse of its own this half. `Step` and `Ask` are the kit's.
- [ ] Every test passes, the pin included. Commit "Prove cheats with the kit's proofs, and cover tracks with exposes".

### Task 6: `allowCheating`

**Files:** Modify `src/engine/rules.ts`, `schema.ts`, `available.ts`, `apply.ts`, `round.ts`, `invariants.ts`, `types.ts`, `src/presets/describe.ts`, `src/ai/*`, `src/coach/*`, `src/practice/*`, `src/room/room.test.ts`, `scripts/play.ts`, UI files; delete `src/ai/mind.ts`; tests in `src/engine/cheating.test.ts`, `src/ai/simulation.test.ts`, `src/presets/presets.test.ts`.

- [ ] Tests under each value: `play` and `legal`; a rule-breaking card refused (`illegalCard`) or accepted and recorded; a false Jodhi refused (`falseClaim`) or accepted; accusation lists; every computer Straight through `mindFor`; the describe line and schema line; the simulation with cheating off, where the invariants refuse any accepted rule-breaking card or false claim.
- [ ] The field, `true` in Traditional; the engine branch; the description and schema lines. Minds come from the kit (`src/ai/mind.ts` deleted). The screens hide the accuse control, the personas and "play anyway" with cheating off.
- [ ] Every test passes. Commit "Add allowCheating to Thunee's house rules".

### Task 7: Housekeeping

**Files:** Modify `src/coach/check.test.ts`, `src/ai/simulation.test.ts`, `package.json`, `AGENTS.md`.

- [ ] Explicit timeouts with headroom for the two slow simulation tests. `test:soak` runs `src/ai` and the Hearts simulation. `AGENTS.md` names the kit where it now holds what Thunee used to.
- [ ] Commit "Give slow simulations room, soak Hearts too, and point the docs at the kit".

### Task 8: Verification

- [ ] `corepack pnpm run check`; `./node_modules/.bin/vitest run`; `SIM_GAMES=400` over Thunee's and Hearts' simulations; the browser scripts and `scripts/play.ts` against a dev server on 5273.
- [ ] No file under `src/kit/` imports from outside it; nothing the kit provides remains duplicated in `src/engine/` or `src/ai/`.
