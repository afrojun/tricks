# Search-player spike — Design

Date: 2026-10-05
Status: run and reviewed. The answer is in section 7.
Depends on: nothing
Kind: a spike. Its output is an answer. The code is throwaway and is never merged.

## 1. The question

Can one computer player that knows no strategy, only the engine's own functions, play well enough and fast enough to be the opponent in every game?

Today's players are hand-written heuristics for Thunee (`src/ai/choose.ts`). Writing those for every game is slow and needs someone who plays the game well. If a search player holds up, a new game costs an engine and gets its computer players, practice and hints nearly free. The answer decides how Hearts gets its opponents and what the coach's first tier is built on.

The spike answers three things, in this order:

1. **Strength.** Does it play Thunee at least as well as the hand-written player?
2. **Speed.** Does a decision fit inside a room on Cloudflare and inside a phone browser?
3. **Cheating.** Does it keep working when opponents break the rules and the history stops making sense?

## 2. The player

Determinised Monte Carlo over the engine as it is:

1. **Sample a world.** From the seat's own view (`viewFor(game, seat, 'full')`), deal the cards it cannot see at random among the other hands and the stock, respecting what is known.
2. **Rebuild a game.** Turn the view plus that deal into a full `Game` the engine accepts (`checkInvariants` must pass). This is the inverse of `viewFor`, and it is the part each game would have to supply.
3. **Play it out.** For each candidate action, apply it, then play the round to its result with a rollout policy, using only `apply`, `viewFor`, `availableActions`, `seatsToAct` and `nextDeadline`.
4. **Score.** The round result from the seat's side: balls won as positive, balls conceded as negative.
5. **Choose** the action with the best average over the sampled worlds.

Scope: card play is decided by search. Calling, choosing trump and calling Thunee stay with the heuristic player for the first measurements; try them by search afterwards if time allows, and report separately.

What is known when sampling:
- The seat's own hand, and every card played (full memory).
- Hand sizes, the trumper, the call, and trump once revealed. If trump is hidden from this seat, sample it.
- **Shown voids**: a seat that did not follow suit holds none of that suit, for the rest of that half.
- **Claims**: a seat that claimed a Jodhi held those cards.

Rollout policies to compare:
- **Random**: a uniformly random legal card. This is the fully generic player.
- **Heuristic**: `chooseAction(view, HONEST)`. Not generic; it shows the ceiling.

Candidate actions are the legal cards only. The search player never cheats; a cheating persona would sit on top of it, as `chooseCheat` sits on top of the honest card today.

## 3. Measurements

### 3.1 Strength

- Search sits at seats 0 and 2, the hand-written player at 1 and 3. Four players, Traditional rules, all seats honest.
- Use duplicate deals: each seed is played twice with the sides swapped, so luck in the deal cancels.
- The unit is the round, not the game. Report mean balls per round for each side and the difference with a 95% interval. Play enough rounds that the interval is narrower than 0.1 balls per round, or 1,000 duplicate pairs, whichever comes first.
- Run at 10, 30 and 100 sampled worlds per decision, for both rollout policies.
- Also record how often search and the heuristic choose the same card.

### 3.2 Speed

- Per decision, in Node on this machine: median and 95th percentile milliseconds at each budget.
- Where the time goes. `apply` clones the whole game on every action (`structuredClone`); measure how much of a rollout that is. If it dominates, try one variant that applies actions to a single private copy without cloning, and report the gain. That would be a small, real engine change, so say what it would need.
- Target: 95th percentile under 100 ms at the budget that meets the strength bar. Phones are several times slower than this machine, and a room runs many decisions in one wake-up.

### 3.3 Cheating

- Put Wild and Sly personas at seats 1 and 3 so they renege and bluff Jodhis.
- A reneging opponent makes "shown voids" false, and later plays contradict them. The sampler must never throw, hang, or fail to produce a deal. Rule to implement: constraints from shown voids and claims are soft. When a seat's later play contradicts one, drop that constraint for that seat.
- Run at least 500 rounds. Report crashes (there must be none), how often constraints were dropped, and strength against cheats who are never challenged.

### 3.4 What it can explain

For a sample of decisions, record what the search could tell a player: the chosen card's average result against the next best, and how often each card won the trick. One paragraph on whether that is enough for a coach's hint. This feeds `2026-10-05-coach-tiers-design.md`.

## 4. The answer

| Result | Recommendation |
|---|---|
| Random rollouts are at least level with the heuristic player, within the time target, and nothing breaks under cheating | Adopt: one search player for every game. Each game supplies only "rebuild a game from a view". |
| Random rollouts are weaker, heuristic rollouts are strong and fast enough | Hybrid: shared search, with a small rollout policy written per game. |
| Neither is strong enough, or neither is fast enough | Hand-written players per game. Hearts gets its own. |

Also report how much code "rebuild a game from a view" took for Thunee, since every game would pay that.

## 5. How it is run

- All code under `src/spike/search/`, on its own branch. Do not change files outside that folder, except to add a results section to this document.
- Seeded and repeatable: one command reruns each measurement.
- The engine and the heuristic player are used as they are.
- Results go in section 6 below: the numbers in tables, then the recommendation in two or three sentences. Say plainly what was not measured.

## 6. Results

Run 2026-10-05 on branch `tricks-search-spike` (code in `src/spike/search/`). The branch was deleted on 2026-10-06; its code and raw results (`src/spike/search/results/`) are kept at the tag `archive/search-spike`, so `git checkout archive/search-spike` restores them and the commands below run from there. Node 24 on an 8-core desktop shared with other work. Every run is seeded; the command for each is listed at the end. "Search R/n" means search with rollout policy R at n sampled worlds per decision. Balls are per round.

### Strength (3.1)

Duplicate pairs on seeds 1-1000, Traditional, all seats honest. Search sits at 0 and 2, then 1 and 3, on the same deal. Calling, trump, Thunee, Double and Khanaak are the heuristic's for every seat, and both copies were checked to reach card play identically.

| Side A | Side B | Pairs | A balls | B balls | A − B [95% CI] | Same card as heuristic |
|---|---|---|---|---|---|---|
| Search random/10 | Heuristic | 1000 | 0.788 | 0.619 | **+0.170** [0.127, 0.212] | 49.8% |
| Search random/30 | Heuristic | 1000 | 0.823 | 0.591 | **+0.232** [0.192, 0.271] | 50.5% |
| Search random/100 | Heuristic | 1000 | 0.840 | 0.565 | **+0.275** [0.235, 0.314] | 51.7% |
| Search heuristic/10 | Heuristic | 1000 | 0.833 | 0.580 | +0.253 [0.209, 0.297] | 49.8% |
| Search heuristic/30 | Heuristic | 1000 | 0.872 | 0.546 | +0.326 [0.281, 0.370] | 50.7% |
| Search heuristic/100 | Heuristic | 1000 | 0.907 | 0.514 | +0.393 [0.349, 0.437] | 51.9% |
| Search heuristic/30 | Search random/30 | 1000 | 0.705 | 0.684 | +0.020 [−0.022, 0.062] | |
| *Sanity:* heuristic | heuristic | 1000 | 0.719 | 0.719 | 0 (identical copies) | |
| *Sanity:* random card | random card | 1000 | 0.705 | 0.712 | −0.007 [−0.057, 0.042] | |
| *Sanity:* search random/10 | itself | 1000 | 0.702 | 0.694 | +0.008 [−0.033, 0.049] | |
| *Scale:* random card | heuristic | 1000 | 0.500 | 0.934 | −0.434 [−0.479, −0.389] | |

- **Coverage.** Each interval fell below 0.1 balls wide between 650 and 850 pairs. All configurations ran the full 1,000.
- **Agreement.** Search runs on 59% of a side's card plays; the rest have one legal card. "Same card" counts only the plays it searched.
- **Two rulings, measured.**
  - Ties in balls are broken by card points: without that, random/30 gives +0.212 [0.172, 0.253].
  - Random rollouts make no Jodhi claims: with honest claims added, random/30 gives +0.259 [0.218, 0.299].

### Speed (3.2)

Milliseconds per decision with two or more legal cards (286 decisions from 20 rounds), applying actions to a private copy in place.

| Rollouts / worlds | Node median | Node p95 | Chromium p95 | Chromium 4x throttled p95 | Chromium 6x throttled p95 |
|---|---|---|---|---|---|
| random / 10 | 2.3 | 6.8 | 9.8 | 27.6 | 40.5 |
| random / 30 | 6.5 | 19.7 | 16.7 | 58.8 | 86.6 |
| random / 100 | 21.8 | 66.4 | 50.9 | 186.9 | 273.5 |
| heuristic / 10 | 3.8 | 12.8 | 10.5 | 38.8 | 58.2 |
| heuristic / 30 | 10.4 | 37.0 | 24.6 | 95.2 | 147.2 |
| heuristic / 100 | 37.9 | 125.4 | 70.4 | 305.6 | 476.5 |

- **How these were timed.**
  - The Node columns take the fastest of three runs per decision, at load average about 4. A single pass at load 15 gave p95 values of 14, 27, 99, 26, 280 and 1,208 ms, in the table's order.
  - Chromium is headless desktop Chromium 152 with DevTools CPU throttling, over the first 10 rounds' decisions. It is a phone proxy, not a phone.
- **Where the time goes** (30 worlds, in place): rollouts take 81-89%, rebuilding the game 8-14%, sampling 3-5%, and the knowledge of voids and claims under 1%.
- **The engine's `apply` as it is.** It clones the game on every action, and `structuredClone` takes **90-93%** of the search's time. Per decision:

  | Rollouts / worlds | Median | p95 | In place is faster by |
  |---|---|---|---|
  | random / 10 | 55.6 | 175.2 | 22.5x |
  | random / 30 | 167.7 | 545.9 | 26.2x |
  | heuristic / 10 | 53.3 | 180.1 | 13.6x |
  | heuristic / 30 | 163.7 | 535.3 | 15.0x |

  Skipping the re-validation of each rollout action (`availableActions(viewFor(...))`) would save another 1.4-1.8x.
- **The engine change it needs.** Split `apply` into an exported `applyInPlace(game, actor, action, ctx)` and `apply = applyInPlace(structuredClone(game), …)`, and test that a rejected action leaves the game untouched (every branch already validates before it mutates). The caller must own the copy: not frozen, and not shared with views still in use. A prototype is `src/spike/search/applyInPlace.ts`.

### Cheating (3.3)

Seeds 20001-21000, 1,000 rounds per row, every rebuilt world checked against `checkInvariants` and the seat's view (1.46 million worlds in all). Each seed is played with search at seats 0 and 2, then with the heuristic (Straight) there. Seats 0 and 2 never challenge.

| Design | Search | Crashes | Search: won − lost | Heuristic: won − lost | Difference in net [95% CI] | Rounds with a dropped constraint |
|---|---|---|---|---|---|---|
| Wild and Sly cheat and challenge | random/30 | 0 | 1.027 − 0.761 | 1.115 − 0.827 | −0.022 [−0.150, 0.106] | 70.7% |
| Wild and Sly cheat, nobody challenges | random/30 | 0 | 0.535 − 0.862 | 0.454 − 1.003 | **+0.222** [0.142, 0.302] | 73.3% |
| Honest control, nobody challenges | random/30 | 0 | 0.827 − 0.572 | 0.748 − 0.685 | +0.192 [0.112, 0.272] | 0% |
| Wild and Sly cheat and challenge | random/10 | 0 | 1.052 − 0.735 | 1.115 − 0.827 | +0.029 [−0.104, 0.162] | 70.4% |
| Wild and Sly cheat, nobody challenges | random/10 | 0 | 0.542 − 0.855 | 0.454 − 1.003 | +0.236 [0.153, 0.319] | 73.0% |
| Wild and Sly cheat and challenge | heuristic/30 | 0 | 1.129 − 0.699 | 1.115 − 0.827 | +0.142 [0.011, 0.273] | 69.4% |
| Wild and Sly cheat, nobody challenges | heuristic/30 | 0 | 0.590 − 0.805 | 0.454 − 1.003 | +0.334 [0.249, 0.419] | 72.0% |

- **No failures.** Nothing crashed, hung or failed to deal in 9,000 search rounds: 6,000 against cheats and 3,000 honest controls, over 1,000 deal seeds reused across the nine rows.
- **Constraints dropped.**
  - About 1.2 distinct constraints per round, and at least one in 43% of searched decisions, because knowledge is recomputed at each decision.
  - Counted per decision, about three quarters of the drops were bluffed Jodhi claims shown false (0.84 bluffs per round). About a fifth were voids contradicted by a later play (reneges, about 0.5 per round). About 2% were voids dropped only because they could not all hold.
  - The sampler fell back from exact rejection sampling for 1.5-1.8% of worlds (0.5% in honest play).
- **Why the first design is not a fair test.** There, every challenge is a wrong hunch by Wild and hands the honest side 4 balls. Those hunches fired 194 times against the heuristic but 151 times against search, so the comparison measures Wild's suspicion rather than card play. With nobody challenging, search keeps its honest-play edge against cheats who are never caught.

### What it can explain (3.4)

569 decisions from 40 heuristic rounds. For each legal card the search can report:
- its average result in balls,
- its average card-point margin,
- how often it wins the trick, for the player and for the team,
- with paired standard errors.

| | random/30 | random/100 | heuristic/100 |
|---|---|---|---|
| Best card ahead of the next by more than 2 standard errors, in balls | 9% | 18% | 22% |
| Best and next exactly level in balls (decided by card points) | 49% | 40% | 44% |
| Gap to the next best: median balls / card points | 0.067 / 7.3 | 0.040 / 6.1 | 0.030 / 4.3 |
| When it differs from the heuristic: the heuristic's card is clearly worse | 35 of 282 | 59 of 266 | 94 of 314 |

That is enough for a tier-1 hint and an honest "much worse" warning, but not for teaching.
- **A hint.** The numbers are honest by construction, since they come from deals consistent with the player's own view. They support a hint like: "across 100 deals that fit what you have seen, the 10 of hearts averages 23 more points than the jack, and your team wins this trick either way."
- **Units.** Card points must carry most hints, because balls are tied for the top two cards about half the time. Balls should win the wording when the two disagree near the 105 target: one decision showed +0.45 balls for −2.4 points.
- **A "much worse" warning.** It should require both a large gap and more than two standard errors. A gap beyond two standard errors between the best two cards appeared in only 9-22% of decisions, so the coach should search at 100 worlds. That costs 20-70 ms at the 95th percentile on this machine, which is fine for a hint on request.
- **What it cannot say.** It cannot say why. It names no idea a player could reuse (keep the boss jack, feed a partner's winning trick, draw trumps), so lessons stay hand-written (tier 2).

### Optional: calling, trump and Thunee by search

These were decided by search as well. The candidates are pass or the lowest call; each trump choice; and Thunee or pass. Inside rollouts, decisions before card play stay the heuristic's. Duplicate pairs on seeds 1-500, against the same search with the heuristic's calls:

| Side A | Side B | Pairs | A − B [95% CI] | Differs from the heuristic's choice |
|---|---|---|---|---|
| random/30, calls by search | random/30 | 500 | **+0.341** [0.265, 0.417] | calling 31%, trump 36%, Thunee 1 of 1,999 |
| heuristic/30, calls by search | heuristic/30 | 500 | +0.289 [0.209, 0.369] | calling 31%, trump 34%, Thunee 5 of 1,999 |

A decision took a median of 28 ms (p95 59 ms) at random/30, measured on a loaded machine. Part of this gain is opponent modelling, because the opponents' calls are exactly the heuristic's.

### Rebuild cost

For Thunee, "rebuild a game from a view" (`rebuild.ts`) is **66 lines** of code plus a 5-line `World` type. The game also supplies what is known about the hidden cards (`knowledge` in `sample.ts`): shown voids, Jodhi claims and dropping contradicted ones, 79 lines. Sampling a hidden trump adds about 9.

In all, Thunee's own part is about 160 lines. The generic part is about 230 lines: the sampler (places with capacities, forbidden suits, forced cards, with Hall's condition to keep a deal possible) and the search with its rollouts.

Calling, trump and Thunee need another 83 (`rebuildEarly` 47, its knowledge 23, its candidates 13).

The rebuild was checked on every card-play state of seeded games full of reneges, bluffs, Thunee calls and challenges, in four- and two-player games under Traditional and Classic rules:
- From the true deal, it reproduces the engine's hidden `handBefore`, `legal` and `valid` exactly.
- From 21,352 sampled deals, every rebuilt game passes `checkInvariants` and gives back an identical `viewFor`.

### The implementer's recommendation

This is what the spike's author concluded. Section 7 records the review of it and the decision taken, which is narrower.

**Adopt: one search player for every game, with random rollouts at 30 worlds.** It beats the hand-written player by 0.23 balls per round (0.17 even at 10 worlds). Its 95th-percentile decision takes 20 ms in Node and 87 ms in a 6x-throttled browser. It never broke in 6,000 rounds against cheats and kept its edge against them when they were never challenged. Each game supplies "rebuild a game from a view" and its constraints, about 160 lines for Thunee. There is one condition: the engine must first gain an in-place `apply`, since with today's cloning `apply` even 10 worlds takes 175 ms at the 95th percentile. Heuristic rollouts are not needed: they score higher only against the heuristic itself, and are level with random rollouts head to head.

### Not measured

- **Real devices.** Nothing was timed on a real phone or on Cloudflare: the phone figure is a throttled desktop Chromium, and the machine was shared with other heavy work (load averages are recorded with each run).
- **Strong opponents.** No play against strong humans, only against this heuristic, which is itself only 0.43 balls per round better than random card play.
- **Other rules.** Strength was measured only under Traditional four-player rules. Classic and two-player rules were checked for rebuild correctness only.
- **Whole games.** Only fresh rounds at 0-0 were played; corner-house and Khanaak-target effects never arose.
- **Search partnered with a human.**
- **Calling with less opponent modelling.** Calling by search was only measured against opponents whose calls the rollouts model exactly.
- **Not by search.** Double and Khanaak calls, Jodhi claims and challenges were never decided by search.
- **Richer inference.** Reading the calling, the trumper's choice of trump, or the undercut rule was not tried.

### Commands

```sh
./node_modules/.bin/vitest run --config src/spike/search/vitest.config.ts   # rebuild, sampler, in place = cloning
sh src/spike/search/run-strength.sh       # sanity pairs and the strength grid (3.1)
sh src/spike/search/run-extras.sh         # self-play, tiebreak, claims, policies head to head, calls by search
sh src/spike/search/run-cheating.sh       # 3.3, three designs x three budgets
./node_modules/.bin/tsx src/spike/search/speed.ts --rounds 20 --repeat 3 --only perDecision   # 3.2, Node
./node_modules/.bin/tsx src/spike/search/speed.ts --rounds 20 --budgets 10,30 --only cloning  # 3.2, cloning apply
./node_modules/.bin/tsx src/spike/search/speed.ts --rounds 20 --earlyRounds 5                  # 3.2, all sections incl. where the time goes
./node_modules/.bin/tsx src/spike/search/browser-speed.ts --rounds 10                          # 3.2, throttled Chromium
./node_modules/.bin/tsx src/spike/search/explain.ts --rounds 40 --spec search:random:100      # 3.4
./node_modules/.bin/tsx src/spike/search/tables.ts        # all tables from the saved results
./node_modules/.bin/tsx src/spike/search/count-lines.ts   # line counts
```

## 7. Review and decision

The spike was reviewed for the validity of the experiment, not its code. The reviewer recomputed every saved strength and cheating statistic from the result rows, reproduced a slice of the main comparison, and stepped the fast path against the real engine over 4,556 actions.

### What holds

- **The search is honest.** It decides from the seat's own view. No true card or true trump reaches the sampler, the rebuild, the candidates or the rollouts.
- **The comparison is fair and the statistics are right.** Duplicate deals are paired by deal; the baselines that should come out level do.
- **The fast path plays the same game** on every action the measurements used.
- **Thunee card play is stronger with search** than with the hand-written player, by 0.23 balls per round at 30 worlds.

### What does not

| | Finding | Consequence |
|---|---|---|
| 1 | One game's card play does not establish a player for every game. Calling, trump, Thunee, Double, Khanaak and Jodhi stayed with the heuristic, and the value function was a two-team ball count. Nothing was measured for Hearts: thirteen tricks, 39 hidden cards at the first lead, 286 possible passes, and each player for themselves. | "Every game" is not supported. Each game needs its own gate. |
| 2 | The 20 ms figure is the fastest of three warm runs on a desktop. A single pass under load gave 27 ms. Nothing ran on a phone or in a Durable Object, where the cost that matters is CPU per wake-up. | The speed target is met on a desktop only. |
| 3 | The sampler can deal a world the rules could never produce. Thunee redeals when the counting side holds no trump; sampled worlds are not held to that, and such worlds pass the spike's checks. | The "every rebuilt world is consistent" claim is false. The effect on strength is unknown. |
| 4 | The seeding, and the report's proposed time budget, would let a decision change on re-evaluation, which the project's rules forbid. | A real player must seed from the round's salt, the seat and the decision, and stop after a fixed amount of work. |
| 5 | The cheating runs were 6,000 rounds against cheats, not 9,000. | Corrected above. |

Smaller points: "level with heuristic rollouts" means no clear difference was detected, not that they are equal; with challenges enabled, search was only level with the hand-written player against Wild and Sly (-0.022, interval -0.150 to 0.106), and that result stands alongside the unchallenged one; a gap of two standard errors is not enough to tell a player their move was much worse.

### Decision

**Not adopted for every game. Pursued as a shared player that each game must earn.**

1. **Thunee keeps its hand-written player.** Its coach explains moves from that player's reasons, and the hint must come from the same player the computers use. A stronger opponent is not worth losing that.
2. **Hearts gets a hand-written player first.** It is needed in any case: as the baseline a search player must beat, and as the fallback if it does not.
3. **The search player is built properly in the kit, then tested on Hearts.** Properly means: one in-place step shared with `apply` and tested against it; hard rules of the deal kept separate from soft evidence that a cheat can falsify; seeding from the salt, the seat and the decision; a fixed number of worlds. Hearts adopts it only if it beats the hand-written Hearts player on seat-balanced duplicate deals, passing included, inside a time budget measured in a browser and in a room.
4. **A third game starts from search**, with a hand-written player only if it fails that game's gate.
