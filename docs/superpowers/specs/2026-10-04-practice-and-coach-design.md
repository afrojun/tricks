# Practice games with a coach — Design

Date: 2026-10-04
Status: implemented on `t3code/ai-guided-tutorial-mode`
Depends on: `2026-10-04-ai-personas-design.md` (lands first)

## 1. Purpose

Thunee has many rules, and the only way to learn it today is to be told them at a real table. This adds **practice games**: one person against computer players, in the browser, with a **coach** that explains what happened, describes the situation on each of the player's decisions, offers a suggested move with its reason, and warns before a mistake.

Success: someone who has never played can start a practice game, follow the coach through whole rounds of two- and four-player Thunee, and then play a real game without needing the rules explained.

### Decisions

| Question | Decision |
|---|---|
| Shape | Coached free play with random deals. Built so scripted lessons (a fixed seed and a goal) can be added later. |
| How much the coach helps | The situation is always shown; the suggested move is behind a Hint button; a fixed list of mistakes triggers a warning the player can override. Showing the suggestion always, and coaching only afterwards, are later options. |
| Players and rules | Two or four players, Traditional rules only. |
| What the coach knows | During a round, only what the player could know: their own hand and every card played face up so far. After the round, everything, in a review. |
| Where it runs | In the browser. No PartyKit room. |
| Opponents | Computer players with the Straight persona: honest, and they challenge a renege they can prove. |

### Out of scope

Hint styles other than the one above, scripted lessons, house rules in practice, undo, choosing opponents' personas, and coaching in online games.

## 2. Architecture

```
src/practice/   Local game session: holds the Game, runs the AI, pauses the clock, saves to the device.
src/coach/      Pure: views and events -> notes. Situation, advice, warnings, narration, review, topics.
src/ai/drive.ts Pure: the next automatic step for a game (tick, AI reaction, AI turn). Shared with the server.
```

Dependency direction becomes: `ui -> practice -> client, engine, ai, coach`; `ui -> client -> engine`; `coach -> engine, ai`; `party -> engine, ai`; `ai -> engine`.

The coach only ever receives the player's own view (`viewFor(game, you, 'full')`) and, after a round, the dealt hands. It never receives a `Game` and never runs `decide` for another seat. That is what keeps "only what the player could know" true.

## 3. Shared automatic driver (`src/ai/drive.ts`)

The loop in `party/server.ts` (`drive`, `aiJodhi`, and the `aiChallenge` hook from the personas change) moves into one pure function:

```ts
type Step = { actor: Actor; action: Action }
nextAutomaticStep(game: Game, now: number): Step | null
```

In order, it returns:
1. `tick` when a phase deadline has passed;
2. an AI reaction: a Jodhi an AI seat holds and may claim now, or a challenge an AI seat decides to make;
3. an AI seat's turn when `aiActAt` has passed, using `decide` with a `'full'` view;
4. `null`.

The server keeps identity, persistence, the alarm and the abandoned-room reset. It loops `nextAutomaticStep` and applies each step through `act`, falling back to `fallbackAction` as it does now. Practice runs the same loop. Online behaviour must not change; the existing server tests guard that.

Reactions are worked out from the current state, not from the last action's events, so the function stays pure. The personas design already makes a challenge decision a pure function of saved state (the salt and proof id).

## 4. AI decisions with reasons (`src/ai/choose.ts`)

`decide(view, persona, salt): Decision` returns `{ action, reason }`. `chooseAction` becomes `decide(...).action`. The computer players' behaviour does not change.

`reason` is a structured code, never text:

| Phase | Codes |
|---|---|
| Calling | `callStrong { jacks, backedJack, high }`, `passWeak { jacks, high }` |
| Trump | `strongestSuit { suit, cards }`, `lastCard` |
| Thunee window | `thuneeSure { suit }`, `thuneeUnsafe` |
| Play | `leadBoss { card }`, `leadLow`, `thuneeLeadHigh`, `feedPartner { card }`, `holdUnderPartner`, `cheapestWinner { card }`, `cannotWin` |
| Special calls | `sureDouble`, `sureKhanaak` |
| Jodhi | `jodhiHeld { suit, withJack }` |
| Challenge | `proof { proofId }` |
| Other | `fallback` |

The coach calls `decide` with the `straight` persona for the player's own view, so it never suggests cheating. From the personas change, `src/ai/suspicion.ts` must export its proof detection (`findProofs(view)`) so the coach can point out a renege the player can prove.

## 5. Practice session (`src/practice/`)

### Starting

Home gets a "Learn to play" panel: *Practice with 2* and *Practice with 4*, or *Continue practice* and *Start over* when a saved game exists. Both go to `/practice`.

The session builds the game with ordinary engine actions: `createGame`, `setPlayerCount`, `sit` (seat 0, the player's name or "You"), `addAi` with persona `straight` for every other seat, `setRules` with no overrides, `start`. Computer seats are named by position: *Partner*, *Left*, *Right* in four-player, *Opponent* in two-player.

### Session

`openPracticeSession(...)` returns the same `Session` (`{ store, send, close }`) as `openSession`, so `Table`, `RoundResult`, sounds and moments work unchanged.

- It holds the full `Game`. Every applied action's events are numbered, and a `sync` message with `viewFor(game, 0)` (`'table'` memory) goes through a `Playback` into the `GameStore`, exactly as the socket path does. `send` calls `playback.release()` first, as online.
- Rejections reach the store as `rejected` messages.
- After each applied action it runs `nextAutomaticStep` until it returns `null`, then sets a browser timer for the next virtual deadline. (The rule against `setTimeout` is for the server; the browser has no alarm.)
- RNG: a small seeded generator whose state is a number saved with the game. The first seed comes from `crypto.getRandomValues`.

### A clock that waits for the player

The session passes the engine a virtual `now` that only advances while nothing is waiting on the player. The clock stops while:

- the player is in `seatsToAct`;
- the call window is open, the call is not the player's, and the player has not passed;
- the Thunee window is open and the player has not decided;
- the trick pause is showing; it ends when the player taps Continue;
- a topic introduction or a warning is open.

AI turns run on the same clock, so the whole table waits. When it runs, it runs in real time, with the normal AI delays.

### Saving

After every applied action the session writes `{ formatVersion, game, rng, clock, eventCount, round }` to `localStorage` under `thunee-practice`. `round` holds the hands dealt this round and the decision record (section 6.6). A save with a different `formatVersion`, or one that fails validation, is discarded and a new game starts. Topics the player has seen are kept separately under `thunee-coach-seen`.

### Holding an action for a warning

`send` runs `check` (section 6.3) on the action first. If it returns a warning, the action is held and the warning shown; *Play anyway* sends it and *Choose again* drops it.

## 6. The coach (`src/coach/`)

Every output is a `Note`:

```ts
interface Note {
  tone: 'info' | 'suggest' | 'warn'
  title: string
  body: string
  cards?: Card[]   // highlighted in the hand or the trick
  seats?: Seat[]   // highlighted at the table
  topic?: TopicId  // "Learn about …" link
}
```

All copy follows the project's conventions: sentence case, plain language, "call" not "bid", "balls" for game points. The coach can assume Traditional rules.

### 6.1 `situation(view): Note | null`

One or two sentences whenever the player has a decision: what is at stake and who is winning. Examples: "Partner's J♥ is winning. You play last. This trick is worth 41." "Left has called 20. Call 30 to choose trump yourself, or pass."

### 6.2 `advise(view): Note`

The suggested action (in `cards`, or naming the button), from `decide(view, 'straight')`, with:
- the reason, from the reason code;
- why the other main options are worse, worked out by comparing the alternatives (for a card: whether it wins, what it costs);
- a topic link.

When the player can prove a renege (`findProofs`), the advice for that moment is to challenge, naming the trick and card.

### 6.3 `check(view, action): Note | null`

A warning only for this fixed list; any other difference from the advice is not a warning:

1. A play that breaks follow-suit (or the undercut restriction). Shown inside the existing *Play anyway* popover with the reason and the 4-ball risk.
2. Four-player only: taking the trick from a partner who is already winning it, when another legal card would not.
3. Giving 10 or more points to a trick the opponents are winning, when a card worth less was legal.
4. A call more than one step of `CALL_AMOUNTS` above the hand's `callLimit`.
5. Calling Thunee when `decide` says `thuneeUnsafe`.
6. Continuing past the trick pause with a Jodhi held and claimable.
7. A challenge with no proof in the view (a Straight opponent never cheats, so it costs 4 balls).

`check` on the advised action always returns `null`.

### 6.4 `narrate(event, view): Note | null`

A fuller explanation of each event, shown in the coach strip and kept in the round log:
- `trickWon`: who won, with which card and why it beat the others, the points in the trick, and each side's running points against the target.
- `called`, `passed`, `trumpChosen`, `trumpRevealed`, `thuneeCalled`, `jodhiClaimed`, `doubleCalled`, `khanaakCalled`, `challengeResolved`, `dealCancelled`, `dealt` (including the second half in two-player): what it means for the player.
- Other seats' plays include `reads(view)`: what the play shows from public information alone, such as "Left played a club on a heart lead, so Left has no hearts."

Narration never explains a computer's move by its own reasoning, only by what was seen.

### 6.5 Topics

`TOPICS: Record<TopicId, { title; paragraphs; example?: Card[] }>`: card order and values, following suit, calling, trump and last card, the counting side and 105, the last trick, balls, Jodhi, Thunee, Double, Khanaak, challenges, and the two-player game (halves and the stock).

Each topic has a trigger: the first phase or event where it matters (for example, Jodhi on the first time the player may claim one). The first time a trigger fires, the topic opens unasked; after that it is reachable only from links and from *How to play*.

### 6.6 `review(record, summary, dealt): Note[]`

At round end:
1. The score in words, from `RoundSummary`'s lines.
2. Up to three key moments where the player did not follow the advice, in order of points at stake, each with what was advised and why.
3. Illegal plays no one challenged: "Left could have challenged trick 3 for 4 balls."

`record` holds, for each of the player's decisions this round, the coach view, the advice and the action taken. `dealt` is every seat's dealt hands, saved by the session when cards are dealt. *See all hands* shows `dealt` with the cards that beat the player marked.

## 7. Screens (390×844, on the current table)

The table fills the screen, so the coach takes over existing slots and uses sheets. It never covers the trick.

- **`CoachContext`** is provided only in practice (`null` online). `Table` renders `<CoachStrip>` in place of the status `Hint` line when it is present, and `Hand` takes an optional `suggested` card. These are the only changes to the existing table.
- **Coach strip** (at most two lines): on the player's decision, `situation` plus a **Hint** button (Hint lifts and rings the suggested card or button, and opens a sheet with the advice). On others' turns, the latest narration. In the trick pause, that trick's narration and a **Continue** button. A **log** button opens "This round": every narration line, newest first.
- **Warnings:** the follow-suit warning appears in the existing *Play anyway* popover; the others in a small sheet with *Play anyway* and *Choose again*.
- **Topic introductions:** a sheet with the topic and *Got it*.
- **Round result:** a *Coach's review* section below the scoring lines, and *See all hands*.
- **Menu in practice:** *How to play* (every topic), *New practice game*, *Leave*. Online-only items are hidden.

## 8. Testing

- **Driver:** the existing server tests pass unchanged. Unit tests for `nextAutomaticStep`: a passed deadline gives `tick`; a held Jodhi gives the claim; a due AI turn gives the AI's action; nothing due gives `null`.
- **Reasons:** each reason code produced from a fixed hand or position. The simulation checks `chooseAction(view) === decide(view).action` and still asserts every Straight play is legal.
- **Coach, unit:** fixed views for each `situation`, `advise`, `check` rule, `narrate` event, `reads` inference and `review` part. `check` is tested to warn on each listed mistake and on nothing else from a sample of positions.
- **Coach, simulation:** seeded practice games in which the player always follows `advise`, two- and four-player, run through the practice session with a fake clock. Every game reaches game over; `check(view, advise(view))` is always `null`; every event has narration or is deliberately silent.
- **Honesty:** two games whose `'full'` views for seat 0 are identical but whose hidden hands differ give the same `situation`, `advise`, `check`, `narrate` and `reads`.
- **Session:** with a fake clock and fake storage: the clock stops for each listed case and resumes after the player acts; the trick pause holds until Continue; a held warning is sent on *Play anyway* and dropped on *Choose again*; reloading from storage resumes the same view; a save with an old `formatVersion` starts a new game.
- **Copy:** no coach string contains "bid"; every topic and reason code has text (an exhaustive `switch`, checked by the type checker).
- **End to end:** `scripts/e2e-practice.ts` at 390×844 starts a four-player practice game from Home, plays one round by using Hint each turn, and reaches the coach's review. It needs only the dev server, not PartyKit.

## 9. Documentation

`AGENTS.md` gains the new folders and dependency arrows, the rule that the coach takes views and never a `Game`, and `pnpm e2e` gains the practice script.

## 10. Changes made during the build

These differ from the sections above and are what the code does.

- **Reactions stay event-triggered.** Section 3 said computer reactions would be worked out from state. The server asks each computer once per triggering event (`trickWon` for Jodhi; `cardPlayed` and `jodhiClaimed` for challenges), so `src/ai/drive.ts` keeps that: `dueStep(game, now)` for deadlines and turns, and `reactions(game, events)` returning one question per seat that each host asks in order.
- **Extra reason codes.** `leadTrump` (leading with only trumps left) and `cheapOvertake` (the cheapest legal card still beats a partner who is winning).
- **Topics are a priority list.** `topicsFor(view, event)` returns every topic worth introducing; the session shows the first the player has not seen.
- **Countdowns stand still.** While practice waits on the player the table shows "No rush: the table waits for you" instead of a countdown, because countdowns run on real time.
- **Reading holds the clock.** An open hint, log or other sheet holds the practice clock as well as topics and warnings.
- **The hint carries out its suggestion.** The hint sheet has a button that makes the suggested move, which also covers calls, trump and Thunee, where there is no card to lift.
- **All hands are not marked.** The round result has no trick history, so *See all hands* shows the dealt hands without marking the cards that beat the player.
- **The review survives a reload.** It is built whenever the game is at a round result, not only when the round is scored.
- **Wording.** Two-player tricks are numbered within their half ("trick 1 of the second half"); the coach states the undercut rule, both targets (105 and 125), the twelfth trick in two-player, each player's role in a Thunee, and the partner-catch penalty.
