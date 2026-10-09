# Drills — Design

Date: 2026-10-09
Depends on: `2026-10-04-practice-and-coach-design.md`, `2026-10-05-coach-tiers-design.md`

## 1. Purpose

A practice game teaches a rule only when the deal happens to need it: a learner may play many rounds before they hold a Jodhi, and may never see a Khanaak. A **drill** is one moment of a game, set up the same way every time, so a learner can practise one rule on demand: "Call a Jodhi", "Call Khanaak", "Dump the queen".

The practice design left room for this ("scripted lessons, a fixed seed and a goal"). A drill is that: practice started from an arranged position instead of a fresh deal, with the coach's own words for the moment, and a verdict when the moment has passed.

### Decisions

| Question | Decision |
|---|---|
| Name | "Drill". "Lesson" already names the written topics in `CoachSheets.tsx`. |
| Length | One moment: usually one trick. A drill ends as soon as its verdict is known; one that is about the last trick ends with the round, and its result shows behind the verdict. |
| How a position is made | Engine actions only, after one direct change: the deal is stacked. Everything before the moment (calls, trump, earlier tricks, a Jodhi, a renege) is played through `apply` as written, every seat's part included, so the position is one the engine itself reached and its invariants hold. No seeds hunted for: a seed would break whenever the shuffle or a computer changed. |
| What follows | From the moment on, the drill is ordinary practice: honest computers, the clock that waits, Hint, warnings. The hint is the honest computer's, so a drill is only kept if following the hint passes it (tested). |
| Coach's words | Before: a brief (what this drill teaches, with its cards and a link to the topic). During: a guide line for the moment, in place of the coach's usual line. After: the verdict, passed or missed, saying why. |
| Saving | Not saved. A reload starts the drill again; the saved practice game is never touched. The ids of drills passed are kept, to tick them in the list. |
| Where | `/<game>/practice?drill=<id>`. The game's home lists the drills in a sheet from "Learn to play". |

### Out of scope

Drills for the two-player game, chains of drills with a score, drills written by players, and drills online.

## 2. The contract

A game's `GamePractice` gains `drills`. Each is:

```ts
interface Drill<G, A, V, N> {
  id: string
  title: string                 // "Call a Jodhi"
  summary: string               // one line in the list
  playerCount: number
  lobby?: readonly A[]          // house rules the drill needs, after the practice's own
  arrange(table: DrillTable<G, A>): void
  brief: N
  guide(view: V): N | null
  verdict(view: V, decisions: readonly DecisionRecord<V, A>[]): { passed: boolean; note: N } | null
}

interface DrillTable<G, A> {
  readonly game: G
  patch(change: (game: G) => G): void   // to stack the deal
  act(actor: Actor, action: A): void    // as written: computers do not react; throws if refused
  tick(): void                          // the clock to the next deadline, and the system's tick
}
```

`guide` and `verdict` are given the player's own view, with full memory, and the player's decisions since the drill began: a drill's words are as honest as the coach's.

## 3. Practice

- `PracticeGame.drill(practice, drill, seed, name)` starts a practice game of the drill's size with its lobby actions, runs `arrange`, and starts the round log there.
- The session, given `drill`, starts from it and does not save. Topics do not open by themselves: the brief stands in for them, and holds the clock until the player starts. The strip shows `guide` before the coach's own line.
- After every change the session asks `verdict`. Once it answers, the clock stops for good, nothing more is sent, the verdict is shown with the table sync it describes, and a pass is recorded under `tricks-<game>-drills`. A round that ends before the drill's verdict (a challenge, say) is a miss, so every drill ends.
- The coach gains `startDrill()` (closes the brief) and `openDrill(id)` (again, or the next one). `restart` leaves the drill for an ordinary practice game.

## 4. Screens

- **Home**: "Learn to play" gains a **Drills** button; its sheet lists each drill's title and summary, ticked once passed.
- **Brief**: a sheet over the table, with the drill's title, its note and cards, a topic link, and **Start**.
- **Verdict**: a sheet, "Well played" or "Not quite", with the note, **Try again**, **Next drill** and **All drills**. Closing it leaves the table in view and the strip offers **Try again**.
- **Round result**: in a drill, no "Deal next round".
- **Trick pause**: Hint stands beside Continue whenever the coach has advice in a pause (a Jodhi to call, a renege to challenge), in any practice game, not only drills.

## 5. The first drills

Thunee, four players: **Call a Jodhi** (win the first trick holding a king and queen, then call it), **Call Khanaak** (the last trick, after your side's Jodhi), **Call Thunee** (a hand that wins every trick), **Catch a renege** (an opponent failed to follow suit, then led it).

No Double yet: the computer calls one only when it plays last to the last trick and sees its card win, and a side that has won the first five always leads the sixth, so the hint never advises it. A Double drill waits for the computer, and so the coach, to call it from the lead.

Hearts: **The first trick** (void in clubs, holding hearts and the queen), **Leading hearts** (on lead before hearts are broken), **Give away the queen** (void in the suit led).

## 6. Testing

For every drill of every game: it arranges without error and its game keeps the invariants; it has no verdict at the start; following the hint reaches a passing verdict within a few moves, and the hint is never warned against; a typical mistake reaches a missed verdict. The session test covers the brief holding the clock, the verdict stopping it, passes being recorded, and the saved practice game being left alone.
