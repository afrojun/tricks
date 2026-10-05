# The Shared Kit and the Hearts Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A small pure kit (`src/kit/`) that holds what trick-taking games share, and the Hearts engine (`src/games/hearts/`) built on it, with a complete `GameModule` and a random legal player. Thunee is not touched.

**Architecture:** The kit is copied and generalised from Thunee's `lobby.ts`, the table half of `apply.ts`, `available.ts`, `cards.ts`, `testing.ts`, `src/ai/mind.ts` and parts of `src/ai/suspicion.ts`, with Thunee's tests ported alongside. Cheating rests on one idea, the excuse: Hearts writes one function, `excusesFor(card, situation, rules)`, and its legal cards, the hidden `broke` record of each play, and the `SeenPlay` list a computer proves cheats from all come from it. Hearts' engine follows Thunee's shape: one `Game` value changed only by `apply`, `viewFor`, `availableActions`, `seatsToAct`, `nextDeadline`, `checkInvariants` and Zod schemas.

**Tech Stack:** TypeScript, Vitest, Zod.

**Specs:** `docs/superpowers/specs/2026-10-05-game-modules-design.md` (sections 3, 4.1, 5, 8, 9 steps 1 and 2), `docs/superpowers/specs/2026-10-05-hearts-design.md` (sections 2 to 6 and 10, and the random legal player of section 7).

## Global Constraints

- New files only, under `src/kit/` and `src/games/hearts/`. Nothing in `src/engine/`, `src/ai/` or elsewhere changes, except `vitest.config.ts`, which must list the new test folders or Vitest never runs them.
- The kit imports nothing from the app; Zod is allowed. Hearts imports only the kit and Zod.
- Both are pure: no clock, no `Math.random`. Time and randomness arrive through `ctx`; computer chances come from `roll(aiSalt, seat, id)`.
- `apply` never mutates its input and never throws on player input. Round actions are checked against `availableActions(viewFor(game, seat))`.
- Views never carry another hand, another seat's chosen or passed cards, cards of tricks before the last completed one (with `table` memory), `handBefore`, `broke`, `aiSalt`, or a hidden persona before game over.
- Every rule is a field of `HeartsRules` with its Standard value, a schema line, and tests under each value.
- Tools run from `node_modules/.bin`: `./node_modules/.bin/vitest run`, `./node_modules/.bin/tsc --noEmit`.

## Review Focus

1. **One description of a rule.** `available.legal`, `PlayRecord.broke` and `seenPlays(view)` must all come from `excusesFor`. The simulation checks after every card that the engine's `broke` equals `brokenRules(handBefore, excuses)` for the excuses an observer derives from the full view.
2. **No false proofs.** A computer accusation comes only from a proof, so it must always be guilty. The simulation checks every one.
3. **Passing with four seats waiting at once.** `waiting` holds every seat that has not chosen, a host can replace one who stalls, and a seat that finishes passing and then holds the two of clubs starts a fresh wait.
4. **Kit behaviour pinned to Thunee's.** The table, minds and odds are copies; their ported tests must keep today's expectations.

---

## File map

| File | Responsibility |
|---|---|
| `src/kit/cards.ts` | `Suit`, `SUITS`, `Card<R>`, `sameCard`, `hasCard`, `removeCard`, `shuffle`, `cardId`, `SUIT_SYMBOL`, `SUIT_NAME`, `cardText` |
| `src/kit/rules.ts` | `CommonRules`, `resolve`, `diff`, `TRICK_PAUSE_MS` |
| `src/kit/mind.ts` | `Persona`, `PERSONAS`, `Traits`, `TRAITS`, `Mind`, `HONEST`, `roll`, `mindFor` |
| `src/kit/table.ts` | `TableState`, `TableView`, table actions, `tableAction`, `settle`, `tableView`, `replaceableSeats`, seat helpers, table action schemas |
| `src/kit/tricks.ts` | `trickWinner(plays, { trump, strength })`, `ledSuit`, `followSuit` |
| `src/kit/integrity.ts` | `Excuse`, `PlayRecord`, `brokenRules`, `legalCards`, `recordPlay`, `firstCheat`, `SeenPlay`, `Proof`, `playProofs`, `exposes`, `noticeOdds`, `chanceOfVoid`, `noticed` |
| `src/kit/module.ts` | `Memory`, `Step`, `Ask`, `GameModule` |
| `src/kit/testing.ts` | `seededRng`, `deepFreeze`, `collectCards` |
| `src/kit/contract.ts` | `runContract`: the seeded simulation every module must pass (tests only) |
| `src/games/hearts/engine/*.ts` | Cards, rules, types, excuses, round, scoring, view, available, apply, invariants, schema, testing |
| `src/games/hearts/ai/random.ts` | The random legal player and an honest catcher |
| `src/games/hearts/ai/drive.ts` | `dueStep`, `reactions` |
| `src/games/hearts/contract.ts` | Hearts' side of the contract: its random player, mischief and hidden cards |
| `src/games/hearts/index.ts` | The Hearts `GameModule` |

---

### Task 1: Kit cards, rules, minds and test helpers

**Files:** Create `src/kit/cards.ts`, `src/kit/rules.ts`, `src/kit/mind.ts`, `src/kit/testing.ts`, and tests `cards.test.ts`, `rules.test.ts`, `mind.test.ts`. Modify `vitest.config.ts` (two include lines).

- [ ] Port the shuffle, `roll` and persona tests from `src/engine/basics.test.ts` and `src/ai/mind.test.ts`; add `mindFor` with cheating off gives Straight; `resolve`/`diff` round trip over a made-up rule set.
- [ ] Run `./node_modules/.bin/vitest run src/kit`: fails (modules missing).
- [ ] Copy and generalise. `Card<R extends string = string>`; `mindFor(game, seat)` reads `game.rules.allowCheating`.
- [ ] Tests pass; `tsc --noEmit`; commit "Start the shared kit with cards, rules, minds and test helpers".

### Task 2: The table

**Files:** Create `src/kit/table.ts`, `src/kit/table.test.ts`.

**Produces:** `Seat`, `Actor`, `Ctx`, `SeatInfo`, `ViewSeat`, `Waiting`, `TableState`, `TableView`, `TableAction`, `TableReject`, `TableEvent`, `isTableAction`, `tableAction(game, actor, action, ctx, events, { seatCounts })`, `checkLobbyHost(game, actor)`, `settle(game, ctx, toAct, untimed)`, `tableView(game, seat)`, `replaceableSeats(view, now)`, `canStart`, `revealPersonas`, `isAiControlled`, `actingHost`, `fixHost`, `cleanName`, `emptySeats`, `allSeats`, `seatsFrom`, `nextSeat`, `STALL_MS`, `tableActionSchemas(seatCounts)`.

- [ ] Port every test in `src/engine/lobby.test.ts`, the stalled-seat and host tests in `src/engine/play.test.ts`, and the persona tests, against a toy game in the test file. Add: `settle` keeps `since` for a seat still waited on, stamps a new one, drops the rest, and waits on several seats at once; `setPlayerCount` refuses a count not in `seatCounts`; a stalled seat among several waited on can be replaced.
- [ ] Run: fails.
- [ ] Implement by copying `lobby.ts`, the table half of `apply.ts`, `schedule` and `replaceableSeats`; `acting` becomes `waiting`.
- [ ] Tests pass; commit "Add the shared table: seats, lobby, host, stand-ins and who is waited on".

### Task 3: Tricks and integrity

**Files:** Create `src/kit/tricks.ts`, `src/kit/integrity.ts`, `src/kit/module.ts`, tests `tricks.test.ts`, `integrity.test.ts`.

- [ ] Tests: Thunee's trick-winner cases with Thunee's strength; following suit through `followSuit` and `legalCards`; a broken excuse is recorded; a legal play records nothing; a later card proves an earlier excuse false, with Thunee's ids and gaps for its "clumsy" and "patient" cheats; a card from a different deal proves nothing; suspects only; `exposes`; `noticed` is stable across calls and matches `noticeOdds`; `noticeOdds` and `chanceOfVoid` keep Thunee's numbers; `firstCheat`.
- [ ] Run: fails. Implement. Pass. Commit "Add tricks, excuses, proofs and the game module contract to the kit".

### Task 4: Hearts cards, rules, state and schemas

**Files:** Create `src/games/hearts/engine/cards.ts`, `rules.ts`, `types.ts`, `schema.ts`, `basics.test.ts`, `schema.test.ts`.

- [ ] Tests: 52 cards, ace high and two low, points (hearts 1, queen of spades 13, 26 in all); Standard and Omnibus; pass directions by round under each `passing` value and their targets; schemas refuse system actions, a wrong number of passed cards, bad cards and out-of-range rules.
- [ ] Implement, pass, commit "Add Hearts cards, house rules, state and wire schemas".

### Task 5: Dealing, passing, play and views

**Files:** Create `excuses.ts`, `round.ts`, `view.ts`, `available.ts`, `apply.ts`, `testing.ts`, `index.ts` under `src/games/hearts/engine/`, with `passing.test.ts`, `play.test.ts`, `view.test.ts`.

- [ ] Tests: start deals 13 each; passing each direction, the no-pass round, cards stay in hand until the exchange, choosing twice and bad choices rejected, a seat cannot see what it will receive, every seat not chosen is waited on and a host can replace one who stalls; the two of clubs leads and is the only card accepted (cheating on and off); follow suit, first-trick and hearts-lead rules each recorded when broken and not when legal, rejected with cheating off, `pointsOnFirstTrick` and `queenBreaksHearts` under each value; the highest card of the led suit wins and its winner leads; the queen of spades may be led any time; views carry exactly section 5's list; legality, `broke` and `seenPlays` agree.
- [ ] Implement, pass, commit "Deal, pass and play Hearts, with excuses behind every rule".

### Task 6: Scoring, accusations and the end of the game

**Files:** Create `scoring.ts`, `scoring.test.ts`, `challenge.test.ts` under `src/games/hearts/engine/`.

- [ ] Tests: 26 points in a normal round; both moon rules; the jack of diamonds on and off, including with a moon; the game ends at `gameEndsAt` (two values) with the lowest score winning, and plays on while the lowest is shared; accusations guilty and not guilty, the summary, the round ends at once, who may accuse whom, none with cheating off; `nextRound` from any human; `rematch` by the host.
- [ ] Implement, pass, commit "Score Hearts rounds, judge accusations and end the game".

### Task 7: Invariants, the random player and the module

**Files:** Create `src/games/hearts/engine/invariants.ts`, `src/games/hearts/ai/random.ts`, `src/games/hearts/ai/drive.ts`, `src/games/hearts/ai/drive.test.ts`, `src/games/hearts/index.ts`.

- [ ] Tests: `dueStep` ticks a passed deadline, gives a due computer seat's legal choice with a fallback, is null when nothing is due; a computer passes three of its cards; reactions to a card let a computer accuse a proven cheat and never an honest player; the module exposes every field of `GameModule`.
- [ ] Implement, pass, commit "Add the Hearts module with a random legal player".

### Task 8: The contract simulation

**Files:** Create `src/kit/contract.ts`, `src/games/hearts/contract.ts`, `src/games/hearts/simulation.test.ts`.

- [ ] `runContract` plays a seeded game with one human seat and computers elsewhere: the human's legal actions, computer steps through `dueStep` and `reactions`, deadlines through ticks, and a little mischief (rule-breaking cards, right and wrong accusations). After every applied action: invariants, no view leaks a hidden card, a secret key or a hidden persona, every client action parses, and legal and computer actions are never rejected.
- [ ] Hearts adds: excuse agreement after every card, 26 points a normal round, computer accusations always guilty, and with cheating off no rule-breaking card accepted and no accusation possible. Configurations cover every rule value. `SIM_GAMES` sets the number of games (default 30).
- [ ] Run once with `SIM_GAMES=400`. Commit "Run Hearts through the module contract in a seeded simulation".
