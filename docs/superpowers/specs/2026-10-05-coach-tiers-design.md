# The coach in two tiers — Design

Date: 2026-10-05
Status: ready to build after sub-project D. Section 3 is settled by the search spike (its spec, section 7).
Depends on: `2026-10-05-search-player-spike-design.md`, `2026-10-05-game-modules-design.md`

## 1. Purpose

Thunee's coach is the most written part of the app: topics, narration, warnings and a review, all in prose about one game. Promising that for every game would make the coach the limit on how many games Tricks can have. So the coach is split.

- **Tier 1, for every game:** what the situation is, a hint, a warning before a rule is broken or a much worse move is made, and a review of the decisions that mattered. Generated from the game's module and its computer player.
- **Tier 2, game by game:** lessons, narration of what just happened, and warnings that name a specific mistake. Written by hand. Thunee has all of it today.

Success: a new game has a useful practice mode on the day its engine and computer player exist, and Thunee's coach reads exactly as it does now.

### Decisions

| Question | Decision |
|---|---|
| Where a hint comes from | The game's own honest computer player, as now. The hint and the computers cannot disagree. |
| What the coach may know | The player's own view with full memory. Never the game. Only the review sees the dealt hands, after the round. |
| How tiers combine | One coach contract. A game supplies what it has written; the kit fills the rest. |

### Out of scope

Scripted lessons, coaching in online games, and hint styles other than today's.

## 2. The contract

```ts
export interface GameCoach<V, A, E> {
  situation(view: V): Note | null
  advise(view: V): { note: Note; action: A } | null
  /** A warning for the action the player is about to take. Must be null for the advised action. */
  check(view: V, action: A): Note | null
  narrate(event: E, view: V): Note | null
  topicsFor(view: V, event: E | null): string[]
  review(input: { decisions: DecisionRecord<V, A>[]; summary: unknown; dealt: unknown; you: Seat; view: V }): Note[]
}
```

This is the shape `src/practice/session.ts` already calls. `Note` keeps its form; `topic` and `rule` become strings owned by the game.

`baselineCoach(module, player)` in the kit returns a complete tier-1 coach. A game's coach starts from it and replaces any member.

## 3. Tier 1

What the kit can say without knowing the game:

| Member | Generated from |
|---|---|
| `situation` | Whose turn it is and what the player may do, from the table view and `availableActions`. A game may supply one line of its own (what is led, what is trump). |
| `advise` | The honest computer's decision for the player's view. |
| `check` | Two warnings. *Rule-breaking*: the action is accepted but not legal. *Much worse*: see below. |
| `narrate` | Nothing. Narration is tier 2. |
| `topicsFor` | Nothing. |
| `review` | The decisions where the player's choice differed from the advice and was much worse, each with the advice it had. |

The explanation of a hint, and "much worse", depend on the computer player a game uses. Thunee and Hearts start with hand-written players, so tier 1 is built first in the second form below. A game that adopts the search player through its gate moves to the first.

- **With the search player.** The search already has the numbers. The explanation states them in the game's own unit: "In the deals this could be, playing the 9 of spades costs you 1 point on average. The queen costs 9." *Much worse* is a gap above a threshold the game sets. This is honest by construction, since the search samples only from the player's view. Two cautions from the spike's review: these numbers are estimates from imagined deals and the hint must say so; and a gap of two standard errors was not enough to call a move much worse, so the threshold is validated on fresh samples before that warning ships.
- **With hand-written players.** The player returns a reason code with each decision, as Thunee's does, and the game supplies a short phrase for each code. There is no *much worse* warning, because a heuristic has no measure of how bad the alternative was. The review lists the rule-breaking plays, then up to three moments where the player chose otherwise than the hint, each put as what the hint was and its reason, never as a mistake. The game says which choices are as good as the hint's (Spades' and Hearts' touching cards) and what rode on each (a call in Spades, the points in a Hearts trick), so the three are the ones that mattered most. A round of the hint's choices says so. (Until 2026-10-10 the review listed only the rule-breaking plays, and a fair round's review was always empty.)

## 4. Tier 2

Thunee keeps `topics.ts`, `narrate.ts`, `situation.ts`, `check.ts`, `review.ts` and `words.ts`, moved to `src/games/thunee/coach/` and gathered into a `GameCoach`. Its tests move with it and pass unchanged, including `rules-accuracy.test.ts`.

Hearts starts with tier 1 only. Its written topics are listed in the Hearts spec, section 9.

## 5. Practice

`src/practice/session.ts` calls a `GameCoach` and no longer imports from `src/coach/`. The seen-topics list is stored per game. Everything about the waiting clock is unchanged.

## 6. Testing

- For every game with a coach: over a seeded practice game, `check(view, advise(view).action)` is always null, and `advise` is null whenever the player has nothing to decide.
- The baseline coach is given only views. A test builds it with a module whose `viewFor` hides a marked card and confirms no note mentions it.
- Thunee's coach tests pass unchanged.

## 7. Build order

1. The `GameCoach` contract; Thunee's coach behind it; practice calling it.
2. `baselineCoach`, in the form the spike's answer allows.
3. Hearts practice on the baseline.
