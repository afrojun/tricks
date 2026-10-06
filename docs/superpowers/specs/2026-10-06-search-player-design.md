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

Run 2026-10-06 on branch `tricks-search-player`: Node 24.18 and headless Chromium 152 on an 8-core desktop shared with other work. The player is `src/kit/search/` with Hearts' adapter in `src/games/hearts/ai/search.ts`; the gate is `src/games/hearts/ai/gate/`, and every result below, raw timings included, is saved in `src/games/hearts/ai/gate/results/` with its command and the machine's load. Points are per round, and fewer is better.

**Verdict: the gate fails, on strength and on speed. Hearts keeps the hand-written player.** The search player takes 1.4 points a round more than the hand-written player at 30 worlds, and still 0.9 more at 100; it is over the time bar even at 10 worlds. No number of worlds is both strong enough and fast enough.

### Strength

Each deal is played under all four pass directions. On each, the round is played with the baseline player at all four seats, then with the search player at each seat in turn against three baseline players. The search player's points are compared with the baseline's in the same seat of the same deal, and the 95% interval is taken over deals: one observation per deal, the mean of its sixteen differences.

| Search player | Against | Deals | Search | Baseline | Search − baseline [95% CI] |
|---|---|---|---|---|---|
| 30 worlds | hand-written | 400 | 8.103 | 6.654 | **+1.449** [1.281, 1.617] |
| 60 worlds | hand-written | 50 | 7.779 | 6.630 | +1.149 [0.567, 1.731] |
| 100 worlds | hand-written | 50 | 7.537 | 6.630 | +0.907 [0.398, 1.417] |
| 30 worlds | random | 100 | 1.764 | 6.630 | −4.866 [−5.093, −4.639] |

- **By direction**, at 30 worlds against the hand-written player: left +1.789 [1.450, 2.129], right +1.369 [1.038, 1.699], across +1.784 [1.439, 2.129], no pass +0.854 [0.543, 1.164]. It is worse in every direction.
- **More worlds** narrow the gap, as section 6 asks to check before concluding, but do not close it: 60 and 100 worlds are each 50 deals, at two and over three times the cost of 30 worlds a decision.
- **Agreement.** It chose what the hand-written player would in 49.8% of the 59,512 decisions it searched.
- **Which part loses.** Two diagnostics of 24 deals each at 30 worlds. Searching only the pass, with the hand-written player's card play, gives −0.146 [−0.699, 0.407]: no clear difference. Searching only the card play, with the hand-written pass, gives +1.138 [0.437, 1.839]. The loss is in card play.
- **Against random players** it does what the hand-written player does (−4.809 [−4.885, −4.734] in its own report). Its rollouts model random opponents exactly.
- **Four search players** take 6.955 points a round each over 200 rounds with 7 moons, exactly 6.5 + 13 × 7 / 200. Moons are three times as common as among four hand-written players (3.5% against 1.1%).

Why, as far as the decisions show: random rollouts play every seat at random, the searcher's own later cards included. A random player keeps no low cards to duck with and throws the queen of spades at random, so in the imagined deals holding high cards or the queen is far worse than it is for a player who plays on with care, and the estimates swing with each deal: the paired standard error of the gap between two cards is about one point at 30 worlds, as large as most gaps. The hand-written player encodes the care. In Thunee the spike's search beat a hand-written player that was itself only 0.43 balls a round better than random; Hearts' hand-written player is far stronger than random (4.8 points a round).

### Speed

The decisions of twenty seeded rounds of four search players, each timed once after a warm-up round, in the same Vite bundle in Node and in Chromium. "Searched" is every decision with more than one candidate; a single candidate is played at once. Milliseconds; Node is CPU time; Chromium is wall time with DevTools CPU throttling as a phone proxy. Load average about 2.

| | Worlds | Searched median | Searched p95 | Pass median / p95 | First trick median / p95 | Other play p95 | A round of four computers, median / max |
|---|---|---|---|---|---|---|---|
| Node | 10 | 6.9 | 29.3 | 29.1 / 48.1 | 9.7 / 20.3 | 22.1 | 364 / 567 |
| Node | 20 | 12.5 | 55.3 | 55.3 / 62.7 | 18.5 / 30.3 | 38.4 | 660 / 840 |
| Node | 30 | 18.2 | 83.6 | 83.9 / 91.6 | 28.4 / 38.9 | 56.0 | 999 / **1,245** |
| Chromium | 10 | 6.0 | 25.2 | 25.1 / 33.1 | 8.7 / 13.6 | 17.6 | 313 / 396 |
| Chromium | 30 | 15.8 | 72.3 | 72.5 / 81.9 | 24.2 / 35.9 | 49.6 | 856 / 1,123 |
| Chromium 4x | 10 | 26.7 | **109.4** | 109.5 / 165.3 | 38.0 / 59.8 | 79.0 | 1,305 / 1,988 |
| Chromium 4x | 20 | 48.1 | **208.2** | 209.1 / 282.6 | 70.2 / 140.8 | 144.5 | 2,532 / 3,486 |
| Chromium 4x | 30 | 71.1 | **312.1** | 312.2 / 385.8 | 105.9 / 169.1 | 225.6 | 3,815 / 4,941 |

- **Against the bar.** The 95th percentile in Chromium throttled four times is over 100 ms at 10, 20 and 30 worlds. A round of four computers stays under one second of CPU in Node at 10 and 20 worlds, but not at 30 (median 0.999 s, worst 1.245 s).
- **The pass sets the tail.** Eight candidates played to the end of the round: the searched p95 is about the median pass.
- **Where the time goes**, in a profile at 30 worlds: the engine's `step` is about 60%, most of it its own validation, which builds a view and the available actions for every action. Dealing, rebuilding and the rest of the search are under 10%. Two savings were taken before measuring: rollouts read the imagined game rather than building a view per action, and cards that play alike are searched once.
- **Under load** (averages 13 to 25, the first runs) the same decisions took two to three times as long; those runs are not reported.

### Cheating

500 rounds (seeds 20001 to 20500): Sly at seat 1 and Wild at seat 3 cheat, nobody accuses, and seat 0 is the search player, then the hand-written player on the same deal. Every world the search rebuilt was checked against `checkInvariants` and against the seat's own view.

- **No sampler failure** in 578,040 checked worlds.
- **Strength against cheats who are never challenged:** the search player takes 8.634 points a round, the hand-written player 7.270; the search player is worse by 1.364 [0.618, 2.110].
- Sly and Wild played 0.29 rule-breaking cards a round against the search player and 0.34 against the hand-written one. In 22 of 4,653 searched decisions the sampler dropped soft evidence that could not hold; evidence from a seat already shown to cheat is left out before sampling and is not counted there.

### Determinism

Five rounds of four search players at 30 worlds: each of the 276 decisions was asked again from the game saved at that moment and reloaded from JSON, and every one gave the same action and the same result in every world. The tests also show that two games that look the same to a seat give it the same decision.

### Not measured

Real phones and a deployed room's CPU per wake; whole games rather than single rounds; house rules other than Standard for strength (the others are covered for correctness); search partnered with or against people.

### Commands

```sh
./node_modules/.bin/tsx src/games/hearts/ai/gate/run.ts                       # the short gate, every part
GATE=full ./node_modules/.bin/tsx src/games/hearts/ai/gate/run.ts strength    # 400 deals at 30 worlds (23 min on 6 threads at load 20)
GATE=full GATE_DEALS=50 GATE_WORLDS=60,100 ./node_modules/.bin/tsx src/games/hearts/ai/gate/run.ts strength
GATE_DEALS=24 GATE_SEARCHES=play ./node_modules/.bin/tsx src/games/hearts/ai/gate/run.ts strength   # and GATE_SEARCHES=pass
GATE=full ./node_modules/.bin/tsx src/games/hearts/ai/gate/run.ts random self cheating determinism
GATE=full ./node_modules/.bin/tsx src/games/hearts/ai/gate/run.ts speed       # Node, 10, 20 and 30 worlds
GATE=full ./node_modules/.bin/tsx src/games/hearts/ai/gate/run.ts browser     # Chromium at 1x and 4x
./node_modules/.bin/vitest run src/kit/search src/games/hearts/ai             # the rules' tests and the gate in small
```

### Decision

Hearts keeps the hand-written player; its `decide` is unchanged. The search player stays in the kit, tested, for a game whose hand-written player is weak or missing, as the spike's decision foresaw for a third game. For Hearts, a stronger rollout than random (the spec's out-of-scope "per-game rollout policy") would be the next thing to try, and would have to clear this gate again.
