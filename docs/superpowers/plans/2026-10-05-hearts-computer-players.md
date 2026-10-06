# Hearts Computer Players Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real computer players for Hearts: a hand-written player that passes and plays sensibly and says why, with personas on top that cheat, cover their tracks, catch cheats and act on hunches. It replaces the random legal player in `dueStep` and `reactions`.

**Architecture:** Thunee's shape, in `src/games/hearts/ai/`. `decide(view, mind)` takes a seat's `full` view and a `Mind` and returns an action with a reason code; it never sees the `Game`. The honest choice comes first (`choose.ts`, reading the round through `read.ts`); a cheating persona may replace it with a renege (`cheat.ts`), and a careful one first holds back cards that would expose an earlier cheat, through the kit's `exposes`. Catching (`catch.ts`) builds proofs from the kit's `playProofs`, sets their salience, and rolls them through the kit's `noticed`; personas with hunches also weigh suspicion signals. `drive.ts` is the only file that touches the `Game`, to make views.

**Tech Stack:** TypeScript, Vitest.

**Specs:** `docs/superpowers/specs/2026-10-05-hearts-design.md` (7.1, 7.2; sections 2 to 6 as the rules), `docs/superpowers/specs/2026-10-05-game-modules-design.md` (4.1, 5).

## Global Constraints

- Edit only `src/games/hearts/ai/**`, `src/games/hearts/index.ts`, Hearts test files (including the test-only `src/games/hearts/contract.ts`), and this plan. The kit, Thunee's engine, AI and coach are not touched.
- Decisions take a `View` (with `full` memory) and a `Mind`. Only `drive.ts` imports `Game`.
- Every chance is `roll(aiSalt, seat, id)`. No module state, no `Math.random`, no clock: the same view and mind always give the same decision, whatever the order of the cards in the hand.
- Persona traits come from the kit's `TRAITS`. With `allowCheating` off, `mindFor` already makes everyone Straight; `chooseCheat` also refuses any card the engine would not accept.
- The honest player's card is always in `availableActions(view).legal`; the fallback is always acceptable.
- `random.ts` stays: the simulations and the strength check use it.
- Tools: `corepack pnpm install`; `./node_modules/.bin/vitest run`, `./node_modules/.bin/tsc --noEmit`, `corepack pnpm run check`.

## Review Focus

1. **Never an illegal honest card.** The honest player chooses only from `legal` (or the `holdBack` subset of it). The simulation checks every honest action under every rule value that changes play, with cheats at the table.
2. **No false proofs.** A computer accuses without a proof only on a hunch, and only Sharp and Wild have hunches. Straight and Sly accusations must always be guilty. The contract check is relaxed for hunches, not for proofs.
3. **One look per proof and per signal.** Proof and signal ids are stable, and mood is judged as of the signal's trick, so a decision never changes on re-evaluation.
4. **Strength is measured fairly.** Duplicate deals, every seat taken in turn, paired by deal, every pass direction.

---

## File map

| File | Responsibility |
|---|---|
| `src/games/hearts/ai/reasons.ts` | `Reason`, `Decision`, `PassWhy`: why a computer chose what it did, as data |
| `src/games/hearts/ai/read.ts` | Reading the round from a view: history, unseen cards, who is winning, points taken, a moon threat, mood |
| `src/games/hearts/ai/choose.ts` | `decide`, `chooseAction`, `fallbackAction`, the honest pass and the honest card |
| `src/games/hearts/ai/cheat.ts` | `chooseCheat` (a renege that dodges points), `holdBack` (through `exposes`) |
| `src/games/hearts/ai/catch.ts` | `findProofs` with salience, `findSignals`, `chooseChallenge` (proofs through `noticed`, then hunches) |
| `src/games/hearts/ai/drive.ts` | `dueStep`, `reactions`, using the new player |
| `src/games/hearts/ai/*.test.ts` | `choose`, `cheat`, `catch`, `personas`, `simulation`, `strength` |

---

### Task 1: Read the round and play honestly

**Files:** Create `reasons.ts`, `read.ts`, `choose.ts`, `choose.test.ts`.

- [ ] Tests, one deal each: the pass priorities (spades with fewer than five, high hearts, emptying a short club or diamond suit highest first, highest cards left) with each pick's reason; the opening lead; the highest club on the first trick, and as any other trick with `pointsOnFirstTrick`; a fishing spade lead while the queen is out; a low lead from a suit where it is unlikely to win, never the queen or a high heart while anything else is left; ducking under the winner; winning clean when last; the lowest otherwise; void discards in order; stopping a moon; taking the jack of diamonds; the fallback; the same decision for the same view and for the hand in any order.
- [ ] Run `./node_modules/.bin/vitest run src/games/hearts/ai`: fails.
- [ ] Implement. Pass. Commit "Add the honest Hearts player: passing and play with reasons".

### Task 2: Honest whole games

**Files:** Create `src/games/hearts/ai/simulation.test.ts`.

- [ ] Seeded whole games under each rule value that changes play (`passing` x3, `pointsOnFirstTrick`, `queenBreaksHearts`, `jackOfDiamonds`, both `moon` values), cheating on (with Sly and Wild at the table) and off. Every Straight action is legal, accepted at once (the fallback is never needed), breaks no rule, and is the same when asked twice. `SIM_GAMES` sets the number of games.
- [ ] Pass. Commit "Check the honest Hearts player in whole games under every house rule".

### Task 3: Strength

**Files:** Create `src/games/hearts/ai/strength.test.ts`.

- [ ] Duplicate deals, each under every pass direction: the hand-written player at each seat in turn against three random legal players, against the all-random round on the same deal; report the mean difference in points per round with a 95% interval, paired by deal. Then four hand-written players: 6.5 points per round each, no seat favoured. `SIM_DEALS` sets the number of deals; the default run is short.
- [ ] Refine the heuristics where the numbers show a weakness; record each change under Rulings in the report.
- [ ] Commit "Measure the Hearts player against random play on duplicate deals".

### Task 4: Cheating and covering tracks

**Files:** Create `cheat.ts`, `cheat.test.ts`; modify `choose.ts`.

- [ ] Tests: Straight and Sharp never cheat; Wild reneges to dodge the queen or a costly trick, bolder when behind; Sly does only when its giveaway is far off and nobody who passed to it knows it holds the suit; a cheat breaks only `followSuit`; with cheating off no cheat is offered; after a renege Sly holds back the giveaway while it has another legal card, and Wild does not.
- [ ] Implement. Pass. Commit "Let cheating Hearts personas renege to dodge points and hold back the giveaway".

### Task 5: Catching, signals and hunches

**Files:** Modify `catch.ts`; create `catch.test.ts`.

- [ ] Tests: a proof's salience rises when the cheat dodged the queen of spades and when the dodged trick fell to the observer; a seat that passed cards proves a renege at once when the receiver shows out of a suit it gave; persona attention sets the rate; a missed proof stays missed; signals for an unlikely early void and for a discard on a trick holding the queen; Sharp hunches only from three signals, Wild from one and more often when behind; Straight and Sly never accuse without a proof.
- [ ] Implement. Pass. Commit "Catch Hearts cheats by persona, with salience, signals and hunches".

### Task 6: Wiring and personas in whole games

**Files:** Modify `drive.ts`, `drive.test.ts`, `src/games/hearts/contract.ts`; create `personas.test.ts`.

- [ ] `dueStep` and `reactions` use `chooseAction` and `fallbackAction` from `choose.ts`.
- [ ] The contract check allows an innocent computer accusation only from a persona with hunches.
- [ ] Personas in whole games: Straight and Sharp never cheat; Straight never sees a proof that is not there; Sly's and Wild's cheats are reneges that avoid points; Wild cheats more than Sly; Straight and Sly accusations are always guilty; with `allowCheating` off nobody cheats or accuses. A source check: only `drive.ts` imports `Game`.
- [ ] Full suite with `--testTimeout=60000`; `corepack pnpm run check`. Commit "Drive Hearts computers with the hand-written player and personas".
