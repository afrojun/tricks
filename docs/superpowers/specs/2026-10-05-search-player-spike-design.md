# Search-player spike — Design

Date: 2026-10-05
Status: ready to run (sub-project B in `2026-10-05-tricks-overview-design.md`)
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

Not yet run.
