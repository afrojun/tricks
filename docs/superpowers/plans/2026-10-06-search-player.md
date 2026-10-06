# The Search Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One computer player in the kit that samples the cards a seat cannot see and plays imagined deals out with the engine itself, and the gate that decides whether Hearts adopts it for passing and play.

**Architecture:** Hearts' `apply` becomes `structuredClone` then an exported in-place `step`; `GameModule` gains an optional `step`. `src/kit/search/` holds a game-agnostic player: `types.ts` (what a game supplies, `SearchGame`), `seed.ts` (a decision's random stream from the salt, the seat and a decision id), `sample.ts` (an exact sampler over places with sizes, hard constraints and soft evidence, dropping evidence that cannot hold), `search.ts` (worlds, candidates, random legal rollouts through `step`, paired results), `explain.ts` (means, standard errors, trick wins). `src/games/hearts/ai/search.ts` is Hearts' adapter: knowledge from a `full` view, `rebuild`, candidates (legal cards; a pruned set of passes around the hand-written player's), value, decision id, worlds. The gate (`src/games/hearts/ai/gate.test.ts` plus a browser timing script) measures strength, speed, cheating and determinism; its results go in `src/games/hearts/ai/results/` and section 9 of the search-player spec.

**Tech Stack:** TypeScript, Vitest, playwright-core with `/usr/bin/chromium`, Vite (to bundle the browser timing).

**Specs:** `docs/superpowers/specs/2026-10-06-search-player-design.md` (binding: sections 3 to 8), `docs/superpowers/specs/2026-10-05-search-player-spike-design.md` (sections 2, 6, 7), `docs/superpowers/specs/2026-10-05-hearts-design.md` (sections 2 to 7), `docs/superpowers/specs/2026-10-05-game-modules-design.md` (sections 3 to 5).

## Global Constraints

- Edit only `src/kit/search/**` (new), `src/kit/module.ts` (the optional `step` member), `src/games/hearts/engine/apply.ts` (the `step` export), `src/games/hearts/index.ts`, `src/games/hearts/ai/**`, tests for these, the two specs' result sections, and this plan.
- `src/kit/search/` imports only the kit. Nothing there or in the adapter decides from a `Game`: the search is handed a `full` view and a `Mind`, and only `rebuild` makes a game, an imagined one, from the view and a sampled world.
- The only randomness is the stream from `seed(aiSalt, seat, decisionId)`. No `Math.random`, no clock, no module state. A fixed number of worlds.
- Candidates are legal actions only. A rejected candidate or rollout action throws: it is a bug.
- Existing tests pass untouched, except where the spec's layout forces a change; any such change is recorded.
- Tools: `corepack pnpm install`; `./node_modules/.bin/vitest run --testTimeout=60000`; `corepack pnpm run check`; `./node_modules/.bin/tsx` for scripts. The machine is shared: the headline strength run is kept to 20 to 30 minutes of compute.

## Review Focus

1. **Step is apply.** `apply` is `structuredClone` then `step`, and a seeded run of whole games, including refused actions, gives identical states, events and rejections both ways; a refusal leaves the draft untouched.
2. **Hard before soft.** No sampled world breaks a hard constraint; soft evidence is dropped for a seat shown to cheat, and dropped newest first when it cannot all hold; every rebuilt world passes `checkInvariants` and gives back the seat's view exactly.
3. **Determinism and honesty.** The same view and mind give the same action, after a save and reload too; two games with the same view for a seat give that seat the same decision, whatever the hidden hands.
4. **The gate is fair.** Duplicate deals, every seat in turn, every pass direction, paired by deal; the interval actually obtained is reported, and the decision follows section 6.

---

## File map

| File | Responsibility |
|---|---|
| `src/games/hearts/engine/apply.ts` | `step(draft, actor, action, ctx)`; `apply` = clone then step |
| `src/kit/module.ts` | Optional `step` on `GameModule` |
| `src/kit/search/step.test.ts` | Step equals apply for every listed module that has a step |
| `src/kit/search/types.ts` | `SearchGame`, `Knowledge`, `Constraint`, `World` |
| `src/kit/search/seed.ts` | `seed(salt, seat, decisionId)`: a repeatable stream |
| `src/kit/search/sample.ts` | `prepare(knowledge)`: drops soft evidence that cannot hold, then samples worlds exactly uniformly |
| `src/kit/search/search.ts` | `search(game, view, mind)`: worlds, candidates, rollouts, results |
| `src/kit/search/explain.ts` | Means, standard errors, paired gaps, trick wins |
| `src/games/hearts/ai/search.ts` | Hearts' `SearchGame` and its `decide` |
| `src/games/hearts/ai/gate.test.ts` | The gate: strength, speed in Node, cheating, determinism |
| `src/games/hearts/ai/gate-browser.ts` | Speed in headless Chromium, throttled four times |
| `src/games/hearts/ai/results/` | The gate's saved results and raw timings |

---

### Task 1: One step, shared with apply

- [ ] Kit test first: for every module in `GAMES` with a `step`, seeded whole games (the contract runner, with mischief) and the malformed-action sweep go through a wrapped `apply` that also runs `step` on a clone with the same random draws, and compares states, events, rejections and draws; a rejected step must leave its draft equal to the input. Also checks that a module without `step` is simply skipped, and that Hearts has one.
- [ ] Export `step` from Hearts' `apply.ts`; `apply` becomes clone then step. Add the optional member; wire it in `index.ts`.
- [ ] Commit "Split Hearts' apply into a clone and an in-place step, and check step against apply for every game that has one".

### Task 2: The kit's sampler and seed

- [ ] Tests: the seed is the same for the same salt, seat and id, and differs otherwise; the sampler respects sizes, known cards, hard absences and a hard "at least one" (a Thunee-like redeal rule on a synthetic deal, where some deals would be refused), is uniform on a small case, drops soft evidence that cannot hold (newest first) but never hard, and never throws on a feasible input; it throws on infeasible hard constraints.
- [ ] Implement `types.ts`, `seed.ts`, `sample.ts`. Commit "Add the kit's search seed and a sampler that keeps hard constraints and drops soft evidence that cannot hold".

### Task 3: The kit's search and explanation

- [ ] Tests on a toy game: the best action is found; the same view and mind give the same result, a different salt may differ; a single candidate is returned without search; a rejected candidate throws; `explain` gives means, standard errors and paired gaps.
- [ ] Implement `search.ts`, `explain.ts`. Commit "Add the kit's search player: worlds, legal candidates, random rollouts through step, and explanation data".

### Task 4: Hearts' adapter

- [ ] Tests: knowledge (own hand, played cards, passed cards held by the receiver as hard, shown voids soft, dropped for a seat shown to cheat, hard with cheating off); every rebuilt world from seeded games (cheats included) passes `checkInvariants` and reproduces the view; pass candidates (the hand-written pass first, at most eight, swaps by the hand-written order); decision ids; value with both moon rules; honesty (two games with one view give one decision); determinism through a save and reload; whole games with search at every seat, cheating on and off, never reject an action.
- [ ] Implement `src/games/hearts/ai/search.ts`; the drive test's source check admits it as the one other file that makes (imagined) games. Commit "Add Hearts' search adapter: knowledge, rebuild, pruned passes and value".

### Task 5: The gate

- [ ] `gate.test.ts`: a short default run; the full run behind `GATE=full` (and sizes behind `GATE_DEALS`, `GATE_WORLDS`). Strength on duplicate deals, every seat and direction, paired by deal, 95% interval; search against random; four search players' average against 6.5 plus moons. Speed in Node: twenty seeded rounds, per decision, single pass, warm; median and p95, first-trick and pass decisions apart; a whole round's CPU. Cheating: Sly and Wild, 500 rounds, every world checked, nobody challenging. Determinism: replay from saved points. Raw timings and summaries written to `results/`.
- [ ] `gate-browser.ts`: the same decisions bundled with Vite, timed in headless Chromium at 1x and 4x.
- [ ] Run the short gate; then the headline strength run in the background (20 to 30 minutes), with fallbacks at other world counts as section 6 says if it fails on one count alone.
- [ ] Commit "Add the search player's gate for Hearts" and, with results, "Record the Hearts gate's results".

### Task 6: The decision

- [ ] If the gate passes: `decide` takes its honest pass and card from the search, personas unchanged on top, reason codes carrying the search's estimates; tests updated where reasons are asserted. If it fails: `decide` unchanged.
- [ ] Section 9 of the search-player spec and 7.3 of the Hearts spec record the result and the decision. Full suite and check. Commit.
