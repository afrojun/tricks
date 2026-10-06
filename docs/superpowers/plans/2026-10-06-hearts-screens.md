# Hearts' Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hearts' placeholder table becomes a real one, so four people, or one person and three computers, can play Hearts end to end on a phone at 390 by 844: pass three cards, play thirteen, accuse, read the round result, and play on to the end of the game.

**Architecture:** The parts both games need move out of Thunee's table into `src/ui/` first, each in its own commit and without changing what Thunee draws: seat placement and the seat badge, the trick area and the last-trick sheet, the accuse sheet, the rules sheet, "Take over" and the your-turn alert. The shared `Hand` learns a row of thirteen and a mode for choosing several cards; Thunee's hand keeps its sizes. Hearts' table (`src/games/hearts/ui/`) is then built from those parts in the visual language of Thunee's: opponents at left, top and right, placed clockwise; the trick, the pass direction and hearts broken in the middle; the viewer's points, hint line, hand and controls at the foot. Every Hearts event gets its sound, toast or moment in `present` and its hold in `dwell`. Nothing outside the screens changes.

**Tech Stack:** TypeScript, React, Motion, Tailwind v4 over theme tokens, Vitest, Playwright (scripts).

**Specs:** `docs/superpowers/specs/2026-10-05-hearts-design.md` sections 2 to 6 (rules and the view) and 8 (screens, binding); `docs/superpowers/specs/2026-10-05-game-modules-design.md` section 4.2 and the Shell paragraph of section 7; `docs/superpowers/specs/2026-10-04-motion-and-ux-design.md`. Notes: `.superpowers/sdd/tricks/D3-shell-report.md` (what the shell left for this step), `E1-hearts-players-report.md` (how the computers behave).

## Global Constraints

- Thunee's players notice nothing. Each extraction commit leaves the markup of Thunee's table identical for every view a seeded game reaches (checked by rendering the table to static markup before and after; the harness is not committed). Its four end-to-end scripts pass unchanged; `src/games/thunee/ai/decisions.test.ts` is untouched.
- Edit only `src/games/hearts/ui/**`, `src/games/hearts/client.ts` (not `practice`), `src/ui/**` where a part is extracted or generalised, Thunee's table where a part leaves it, `scripts/e2e-hearts.ts`, tests and this plan. Untouched: every engine, every `ai/`, `src/kit/**`, `src/practice/**`, coaches, `src/games/hearts/practice.ts`.
- The screens render only what the view carries; no event is shown by comparing views. A gap in the view is recorded, not filled.
- Mobile first at 390 by 844; sentence case and plain language; token-backed classes only.
- Tools from `node_modules/.bin`; `corepack pnpm run check`; full runs with `--testTimeout=60000`; a dev server for the scripts on port 5273.

## Review Focus

1. **Extraction is extraction.** The extraction commits move code into `src/ui/` and change nothing Thunee draws.
2. **Thunee's hand is unchanged.** The thirteen-card row and the choosing mode are opt-in props.
3. **The view is the limit.** The table shows only view fields; received cards are marked from `received`, the receiver of a pass is named from the public rule.

---

## File map

| File | Change |
|---|---|
| `src/ui/Seat.tsx` | New: `usePosition`, `SeatBadge` (name, persona, the game's lines, away, card backs), `TakeOver`, `useTurnAlert` |
| `src/ui/Trick.tsx` | New: `TrickArea`, `LastTrick` |
| `src/ui/Accuse.tsx` | New: `AccuseSheet` |
| `src/ui/Rules.tsx` | `RulesSheet` |
| `src/games/thunee/ui/Table.tsx` | Uses the parts above; draws the same |
| `src/ui/Hand.tsx`, `src/ui/hand.ts` (+ test), `src/index.css` | A row sized for many cards (`most`), the fan's tilt bounded, choosing several (`choose`), marked cards (`marked`) |
| `src/games/hearts/ui/text.ts` (+ test) | Hand order with alternating colours, pass words, who is still choosing, the round's headline |
| `src/games/hearts/ui/session.ts` | Typed session hook |
| `src/games/hearts/ui/Table.tsx`, `RoundResult.tsx` | The table, passing, play, controls, round result and game over |
| `src/games/hearts/ui/present.ts`, `dwell.ts` (+ test) | A moment when hearts break, the exchange named, every event held long enough |
| `src/games/hearts/client.ts` | Comment only: the table is real |
| `scripts/e2e-hearts.ts` | A human plays through the real table in two browsers |

---

### Task 1: Extract the shared table parts from Thunee's table

**Files:** Create `src/ui/Seat.tsx`, `src/ui/Trick.tsx`, `src/ui/Accuse.tsx`; modify `src/ui/Rules.tsx`, `src/games/thunee/ui/Table.tsx`.

- [ ] Render Thunee's table to static markup for every view of seeded games (2 and 4 players, cheating on and off, every seat and a spectator) and keep it.
- [ ] Move `usePosition`, the seat badge (Thunee keeps its role badges and bubbles as the badge's lines), "Take over", the your-turn alert, the trick area (an optional winner line), the last trick, the accuse sheet (title, risk, choices) and the rules sheet. One commit for seats, one for the trick, one for the sheets.
- [ ] After each: the markup is byte-identical, check and the full suite pass.

### Task 2: A hand of thirteen, and choosing several

**Files:** Create `src/ui/hand.ts`, `src/ui/hand.test.ts`; modify `src/ui/Hand.tsx`, `src/index.css`.

- [ ] Test first: the fan's tilt is Thunee's for up to six cards and stays within ±10° for thirteen; picking toggles a card, ignores a card past the limit, and keeps order.
- [ ] `most`: cards sized and spaced so that many fit one row at 390 wide with each index showing; spacing widens as the hand shrinks. `choose`: taps pick and put back, nothing is dragged or played. `marked`: a small tag on cards just received.
- [ ] Thunee's markup unchanged; screenshots of a thirteen-card hand in each theme. Commit.

### Task 3: Hearts' words and what a view shows

**Files:** `src/games/hearts/ui/text.ts`, `text.test.ts`.

- [ ] Test first: the hand is grouped clubs, diamonds, spades, hearts (colours alternate), highest first; "Pass left", "to Bheki"; who is still choosing; the headline for a normal round, a moon under each rule, a guilty and an innocent accusation; whether received cards are still marked.
- [ ] Implement. Commit.

### Task 4: The table

**Files:** `src/games/hearts/ui/Table.tsx`, `session.ts`.

- [ ] Header (round, menu, end score); opponents placed clockwise with name, persona, cards held, points this round and total; the middle: the pass panel or the trick, the pass direction and hearts broken; the foot: the viewer's points, hint line, "Take over", the hand and the action bar.
- [ ] Passing: choose three, "Pass left" (right, across) names the direction and the receiver; after choosing, the cards given and who is still choosing; received cards marked until the viewer plays.
- [ ] Play: your turn unmistakable (ring, accent line, sound, vibration); a rule-breaking card asks for a second tap when cheating is on; the opening lead allows only the two of clubs.
- [ ] Controls: last trick, accuse ("Challenge", absent with cheating off), rules, menu (stand-ins and leaving). Commit.

### Task 5: Round result and game over

**Files:** `src/games/hearts/ui/RoundResult.tsx`.

- [ ] This round's points and the totals by seat, the reason for a moon or an accusation (who, the rule, the verdict), "Next round" for any human; game over names the winner, "Play again" for the host. Commit.

### Task 6: Events

**Files:** `src/games/hearts/ui/present.ts`, `dwell.ts`, `present.test.ts`.

- [ ] Test first: hearts breaking is a moment; the exchange names who gave the viewer cards; every event that is shown holds the screen long enough for it.
- [ ] Implement. Commit.

### Added during the build: the coach, when one is present

Asked for while Task 4 was under way, because Hearts practice (on another branch) gives the table a coach.

- [ ] Move Thunee's coach strip, its sheets (hint, warning, log, lessons, all hands) and the coach's review into `src/ui/coach/`, generic: a game passes its written lessons and how its dealt hands are shown. Thunee's markup unchanged with a stub coach in every state. One commit.
- [ ] Hearts' table draws the strip, the hint, the review (which says so when it has nothing to point out) and, in the hand's second tap, the coach's warning, which it asks of the coach in context through an optional `check`. Nothing imported from Hearts' practice or coach.

### Task 7: End to end

**Files:** `scripts/e2e-hearts.ts`.

- [ ] Two browsers and two computers: both pass three cards, play (one card after a second tap), the host accuses once, both see the same trick, a round result, "Next round", and the second round's pass to the right. A disconnected player is stood in for from the menu and takes the seat back. Screenshots at 390 by 844 under `/tmp/hearts-screens/`.
- [ ] Check, full suite, build (chunk sizes; Thunee's chunk only loses the extracted parts); every script on port 5273. Commit.
