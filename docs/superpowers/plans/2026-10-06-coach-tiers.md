# The Coach in Two Tiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One coach contract for every game. The kit builds a complete tier-1 coach for any game from its honest computer player and a phrase for each of its reason codes; Thunee's hand-written coach stands behind the same contract without a word changed; Hearts gets practice with the tier-1 coach.

**Architecture:** `Note`, `DecisionRecord`, `TopicOf` and `GameCoach` move from `src/practice/contract.ts` to `src/kit/coach.ts`, which practice re-exports, so a coach is pure and the kit can build one. `baselineCoach(basis)` takes what a game already has or can say in a few words: its `decide(view, mind)`, a phrase per reason code, what the player is asked to do, one optional line, an action's name and cards, and why an action breaks a rule (from the engine's excuses). It calls `decide` with the honest mind only and is given only the player's view. Thunee's six coach functions are gathered into `thuneeCoach` in `src/games/thunee/coach/index.ts`; its own follow-suit or undercut judgement reads the engine's excuses. Hearts' basis and phrases live in `src/games/hearts/coach/`; `heartsPractice` in `src/games/hearts/practice.ts` is handed to the shell through `practiceClient`.

**Tech Stack:** TypeScript, React, Vitest.

**Specs:** `docs/superpowers/specs/2026-10-05-coach-tiers-design.md` (binding; section 3 in its second form: reason codes and phrases, no "much worse" warning, a review of rule-breaking plays only); `2026-10-04-practice-and-coach-design.md` (the honesty rule); `2026-10-05-hearts-design.md` sections 7.1 and 9; `2026-10-05-game-modules-design.md` section 7. Notes: `.superpowers/sdd/tricks/D2-generic-room-report.md`, `D3-shell-report.md`, `E1-hearts-players-report.md`, `D1-thunee-kit-report.md`.

## Global Constraints

- Not one word the Thunee coach says changes. Every Thunee coach test passes unchanged, `rules-accuracy.test.ts` included; `src/games/thunee/ai/decisions.test.ts` is unchanged and passes.
- Nothing about how either game plays changes. No edits to either engine, either game's `ai/`, `src/kit/module.ts`, `src/kit/search/**`, `src/games/hearts/ui/**`, or `src/ui/**`.
- `src/games/hearts/client.ts` and `src/games/thunee/client.ts` change only in their `practice` member (and the imports it needs).
- The coach is honest: it is given the player's own view with full memory, never a `Game`; it never runs a computer's decision for another seat; only the review sees the dealt hands, after the round. A test shows it for the baseline.
- No search-based explanations, no Hearts topics, lessons or narration, no screens.
- Tools run from `node_modules/.bin`; the full check is `corepack pnpm run check`; full test runs use `--testTimeout=60000`.

## Review Focus

1. **Same words.** Thunee's coach is gathered, not rewritten; its follow-suit or undercut judgement comes from `excusesFor` and agrees with the engine's record of every play.
2. **Honest by construction.** The baseline takes no module and no `Game`; it calls `decide` only with `HONEST` and only with the view it was given; a view that hides a marked card gets no note that mentions it.
3. **The advice is never warned against.** For every game with a coach, over seeded practice games, `check(view, advise(view).action)` is null, and any advice is something the engine accepts from the player at that moment.

---

## File map

| File | Change |
|---|---|
| `src/kit/coach.ts` | New: `Note`, `DecisionRecord`, `TopicOf`, `GameCoach`; `Reason`, `Phrases`, `CoachBasis`, `baselineCoach` |
| `src/practice/contract.ts` | The coach's types come from the kit and are re-exported |
| `src/games/thunee/coach/index.ts` | New: `thuneeCoach`, the six hand-written functions as a `GameCoach` |
| `src/games/thunee/coach/note.ts` | `Note` extends the kit's; `DecisionRecord` is the kit's for Thunee |
| `src/games/thunee/coach/check.ts`, `review.ts` | `illegalKind(phase, card, rules)` reads the engine's excuses |
| `src/games/thunee/practice.ts` | `coach: thuneeCoach` |
| `src/games/hearts/coach/` | New: the phrase table and the basis; `heartsCoach` |
| `src/games/hearts/practice.ts` | New: `heartsPractice` |
| `src/games/hearts/client.ts` | `practice: practiceClient(heartsPractice, dwell)` |
| Tests | `src/kit/coach.test.ts`, `src/practice/coaches.test.ts`, `src/games/thunee/coach/excuses.test.ts`, `src/games/hearts/coach/phrases.test.ts`, `src/games/hearts/practice.test.ts` |

---

### Task 1: The coach contract, and Thunee's coach behind it

**Files:** Create `src/kit/coach.ts`, `src/games/thunee/coach/index.ts`, `src/practice/coaches.test.ts`; modify `src/practice/contract.ts`, `src/games/thunee/coach/note.ts`, `src/games/thunee/practice.ts`.

- [ ] Test first (`src/practice/coaches.test.ts`): for every game with a practice, two- and four-player where it has both, over seeded practice games in which the player follows the advice: `check(view, advice.action)` is null, and any advice is accepted by the engine from the player at that moment (so there is none when the player has nothing to decide). Thunee's practice coach is `thuneeCoach`, which is exactly its six functions.
- [ ] `Note`, `DecisionRecord`, `TopicOf`, `GameCoach<V, A, E, N = Note, D = unknown, S = unknown>` in `src/kit/coach.ts`; `src/practice/contract.ts` imports and re-exports them. Thunee's `Note` extends the kit's with its own topics and warnings; its `DecisionRecord` is the kit's for its view and action. `thuneeCoach` in `src/games/thunee/coach/index.ts`; `thuneePractice.coach` is it.
- [ ] Every test passes; `tsc` passes. Commit.

### Task 2: Thunee's coach judges a broken rule by the engine's excuses

**Files:** Create `src/games/thunee/coach/excuses.test.ts`; modify `src/games/thunee/coach/check.ts`, `review.ts`.

- [ ] Test first: over seeded games with cheating computers, for every play the engine recorded as breaking a rule, the coach's `illegalKind` from that seat's view before the play names the engine's first broken rule (`renege` is follow, `undercut` is undercut); a low trump on another suit's lead from a hand holding that suit breaks both and is follow; and the coach's warning and review for each wording are unchanged.
- [ ] `illegalKind(phase, card, rules)` is `brokenRules(hand, excusesFor(card, trick, trump, rules))[0]`; `checkPlay` chooses its wording from it. `review.ts` passes the card and rules. No string changes.
- [ ] Every test passes, the coach's own unchanged. Commit.

### Task 3: The baseline coach

**Files:** Modify `src/kit/coach.ts`; create `src/kit/coach.test.ts`.

- [ ] Test first, over a toy game of two seats whose player sees its own hand and the cards played: `situation` is null with nothing to decide, otherwise what the player is asked and the game's line; `advise` is the honest decision with its title, cards and the phrase for its reason; `check` warns only for an action that breaks a rule, with the game's reason and risk, and never for the advice; `narrate` and `topicsFor` say nothing; `review` lists the rule-breaking plays only. `decide` is called only with `HONEST` and the view the coach was given. With a `viewFor` that hides a marked card no note mentions it; with one that shows it, the same check finds it.
- [ ] `Reason`, `Phrases<V, R>` (a phrase for every code, checked by `tsc`), `CoachBasis<V, A, R>`, `baselineCoach(basis): GameCoach<V, A, unknown>`.
- [ ] Every test passes. Commit.

### Task 4: Hearts' coach

**Files:** Create `src/games/hearts/coach/phrases.ts`, `src/games/hearts/coach/index.ts`, `src/games/hearts/coach/phrases.test.ts`.

- [ ] Test first: on designed deals, the advice for each honest reason code names its card (or the three passed) and what the code carries (the card it stays under, the shooter, the suit it voids); the situation for a pass, a lead and a follow; a rule-breaking card is warned with its rule (follow suit, the first trick, leading hearts) and the 26-point risk, and the advice is not. No phrase says "bid"; every phrase is in sentence case.
- [ ] `HEARTS_PHRASES: Phrases<View, Reason>`, `heartsBasis`, `heartsCoach = baselineCoach(heartsBasis)`.
- [ ] Every test passes. Commit.

### Task 5: Hearts practice

**Files:** Create `src/games/hearts/practice.ts`, `src/games/hearts/practice.test.ts`; modify `src/games/hearts/client.ts` (`practice` only), `src/practice/coaches.test.ts`.

- [ ] Test first: Hearts practice plays whole games through `PracticeGame` and through the generic session with fake timers, following the advice; the round log keeps every round's deal, with or without passing; saves under `tricks-hearts-practice` with Hearts' format version and reloads to the same view; the session shows the situation and a hint for the pass and for a play; no note during a round names a card another seat holds. Hearts joins the coaches test.
- [ ] `heartsPractice`: seat names, setup (three Straight computers, Standard rules), the trick pause, decisions, the round log, the opening deal, the summary, and `heartsCoach`. `heartsClient.practice = practiceClient(heartsPractice, dwell)`.
- [ ] Every test passes; `tsc` passes. Commit.

### Task 6: End to end, and the report

- [ ] `corepack pnpm run check`; `vitest run --testTimeout=60000`.
- [ ] On a dev server at 5473: `scripts/e2e-practice.ts`; `/hearts` offers practice, `/hearts/practice` opens with no page errors and continues after a reload. Stop the server.
- [ ] Report to `.superpowers/sdd/tricks/F-coach-report.md`.
