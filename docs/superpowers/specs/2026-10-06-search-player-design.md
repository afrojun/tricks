# The search player — Design

Date: 2026-10-06
Status: ready to build after sub-project D2 (sub-project E2 in `2026-10-05-tricks-overview-design.md`)
Depends on: `2026-10-05-search-player-spike-design.md` (sections 6 and 7: the measurements and the decision), `2026-10-05-game-modules-design.md`, `2026-10-05-hearts-design.md` section 7.3

## 1. Purpose

One computer player, written once in the kit, that plays any game whose engine meets a small extra contract, by sampling the cards it cannot see and playing imagined deals out with the engine itself. The spike showed it stronger than the hand-written player at Thunee card play; its review showed the spike's version could not be shipped as it was. This is the version that can.

A game adopts the search player only through a gate: it must beat that game's hand-written player on seat-balanced duplicate deals inside a measured time budget. Hearts is the first gate. Thunee keeps its hand-written player either way, because its coach is written around that player's reasons.

Success: the search player passes every rule in section 3; Hearts' gate (section 6) is run and its result recorded in this document; if it passes, Hearts' computers use search for passing and play, with the personas unchanged on top.

### Decisions

| Question | Decision |
|---|---|
| Method | Determinised Monte Carlo with random legal rollouts, a fixed number of worlds, as measured in the spike. No per-game rollout policy. |
| Where it runs | Inside the engine's own functions, on the server and in the browser for practice. |
| Determinism | Seeded from the round's salt, the seat and a decision id; a fixed amount of work. Never a clock. |
| Thunee | Not adopted. Its hand-written player stays. |
| The gate | Section 6. Run once per game before adoption, and again whenever the player or the game's adapter changes. |

### Out of scope

Searching more than one decision ahead for other seats' simultaneous choices (Hearts' pass is searched against sampled passes, not solved), opponent modelling beyond the sampled deal, and any use of search by Thunee.

## 2. Layout

```
src/kit/search/
  types.ts     SearchGame: what a game supplies.
  seed.ts      A decision's random stream from (aiSalt, seat, decisionId).
  sample.ts    Dealing the hidden cards: hard constraints, then soft evidence.
  search.ts    Worlds, candidates, rollouts, scores; picks the action.
  explain.ts   What a coach may say about a decision (section 7).
src/games/hearts/ai/search.ts    Hearts' SearchGame, and its decide() behind the gate.
```

`src/kit/search/` imports only the kit. A game's adapter imports its own engine and the kit.

## 3. The rules it must keep

These come from the spike's review. Each has a test.

1. **One step, shared with `apply`.** Each engine exports `step(draft, actor, action, ctx)`, the half of `apply` that changes a draft in place, and `apply` is exactly `structuredClone` followed by `step`. On a rejection, `step` leaves the draft unchanged. A test runs seeded games through both and compares every state, every event and every rejection.
2. **Honest.** The player decides from `viewFor(game, seat, 'full')` and a `Mind`. Nothing in `src/kit/search/` or an adapter imports a `Game` type for deciding; only `rebuild` constructs one, from a view and a sampled world.
3. **Hard before soft.** Constraints the rules guarantee (hand sizes; cards known to be in a place; a forced holder such as the two of clubs; Thunee's "the counting side holds a trump") are never violated by a sampled world. Evidence from other seats' play (a shown void, a declaration) is soft: it is dropped for that seat the moment a later play contradicts it, because a cheat can falsify it. A sampled world is checked with `checkInvariants` and must reproduce the seat's own view exactly.
4. **Deterministic.** The random stream for a decision is `seed(aiSalt, seat, decisionId)`, where `decisionId` names the decision from public facts (round, trick, cards on the table, and the kind of decision). The number of worlds is fixed by the game's adapter. The same view and mind always give the same action, and a room that wakes from hibernation or a practice game reloaded from storage gets the same answer.
5. **Never cheats, never falls back.** Candidates are the legal actions only. If the engine rejects the chosen action, that is a bug, and the simulation test fails.
6. **Bounded.** Each decision does a fixed amount of work. Timing is measured and recorded (section 6), not enforced with a clock.

## 4. What a game supplies

```ts
export interface SearchGame<G, A, V> {
  /** The in-place half of apply (rule 1). */
  step(draft: G, actor: Actor, action: A, ctx: Ctx): { events: unknown[] } | { rejected: string }
  /** Where every card is or may be, from one seat's view: known places, hidden places and their sizes,
   *  hard constraints, and soft evidence (rule 3). */
  knowledge(view: V): Knowledge
  /** A full game the engine accepts, from the view and one sampled placing of the hidden cards. */
  rebuild(view: V, world: World): G
  /** The legal actions open to the viewer now. */
  candidates(view: V): A[]
  /** A random legal action for any seat in an imagined game, for rollouts. */
  rollout(view: V, rng: () => number): A
  /** The round's result for one seat once it is over: higher is better for that seat. */
  value(game: G, seat: Seat): number
  /** Names this decision from public facts (rule 4). */
  decisionId(view: V): string
  /** Worlds per decision. */
  worlds: number
}
```

`Knowledge`, `World` and the sampler are the kit's. The sampler fills hidden places uniformly at random subject to the hard constraints, applies soft evidence while it is consistent, and never throws on a valid view.

`value` is per seat, so games with and without teams are the same to the search: Thunee's adapter would return its team's balls as positive and the other team's as negative; Hearts' returns the negative of its own points for the round, with a moon scored as the rules say.

## 5. Hearts' adapter

- **Knowledge.** Known: the viewer's hand, every card played, and the three cards the viewer gave, which the receiver holds until played (hard, because the exchange is simultaneous). Hidden: the other hands, with sizes from `handCounts`. Soft: a seat that did not follow suit holds none of that suit.
- **Rebuild.** A `playing` or `passing` game with the viewer's own `received` and `gave`, other seats' passes sampled, `heartsBroken` and `taken` as the view shows, past tricks as full memory shows, `aiSalt` as the engine's view does not reveal it: zero.
- **Candidates.** In play, `availableActions(view).legal`. For the pass, a pruned set: the hand-written player's choice, plus every pass that swaps one of its three cards for another card of the hand, with the hand-written player's own ordering deciding which of those are kept, up to eight in all.
- **Decision id.** `${roundNumber}:pass` for the pass; `${roundNumber}:${tricks completed}:${cards on the table}` for a play.
- **Worlds.** 30 to start; the gate decides.
- **The personas** stay exactly as sub-project E1 built them: the search gives the honest choice, and the cheat, the holding back and the catching sit on top as they do now.

## 6. The gate

Run as a seeded script that one command repeats, with results committed as a results section here.

- **Strength.** Duplicate deals, with the search player taking each seat in turn against three hand-written players, and every pass direction, paired by deal. Report points per round for each player and the paired difference with a 95% interval over deals. Pass: the interval is clear of zero in search's favour. Also report search against random, and four search players' average (which must be 6.5 plus moons).
- **Speed.** For the decisions of twenty seeded rounds: per-decision time at the median and the 95th percentile, single pass, warm, in Node and in headless Chromium throttled four times, and the first-trick and pass decisions separately, since they have the most hidden cards and candidates. Save the raw timings. Pass: the 95th percentile in throttled Chromium is under 100 ms, and a whole round of four computers' decisions in Node is under one second of CPU.
- **Cheating.** Against Sly and Wild, 500 rounds: no sampler failure, and strength against cheats who are never challenged.
- **Determinism.** Replaying a saved game from any point gives identical decisions.

If the gate fails on strength alone, report at 60 and 100 worlds before concluding. If it fails on speed alone, report at 10 and 20 worlds. Record the result in section 8 and the decision in `2026-10-05-hearts-design.md` section 7.3.

## 7. What a coach may say

`explain.ts` returns, for the chosen action and each alternative, the mean value over the sampled worlds and its standard error, and for cards, how often each won the trick. The coach's first tier (`2026-10-05-coach-tiers-design.md`) words these as estimates ("in the deals this could be, …"). A "much worse" warning is not derived from these numbers until its threshold has been validated on fresh samples, as the spike's review required.

## 8. Testing

- Rule 1: the step-equals-apply test over seeded whole games for every module in the list, including rejections.
- Rules 2 and 3: the sampler on constructed views, including a Thunee view where the redeal rule bites (so the kit's sampler is tested against a hard constraint even though Thunee does not adopt search), and Hearts views with contradicted voids; a sampled world must pass `checkInvariants` and reproduce the view.
- Rule 4: the same view and mind twice give the same action; a different `aiSalt` may differ.
- Rule 5: the Hearts simulation with the search player at every seat, cheating on and off, never rejects an action.
- The gate itself, as a script with a short default run.

## 9. Results

Not yet run.
