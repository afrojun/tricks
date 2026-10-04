# Motion and UX Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add paced playback, card travel, big-moment overlays, clearer table status and better hand controls to the Thunee client.

**Architecture:** A playback queue in `src/client/` releases server messages to the store with per-event dwell times. The UI animates with the Motion library, driven by the store's numbered events and by layout identity for the player's own cards.

**Tech Stack:** React 19, Motion (`motion/react`), Tailwind v4 tokens, Vitest, Playwright scripts.

**Spec:** `docs/superpowers/specs/2026-10-04-motion-and-ux-design.md`

**Execution:** Native, one session. The user waived document review.

## Global Constraints

- No changes under `src/engine/`, `src/ai/` or `party/`.
- Presentation is driven by store events, never by comparing views (AGENTS.md "Events, not diffs").
- Components use theme tokens only.
- `prefers-reduced-motion` must remove travel and keep the game fully playable.
- A refresh or reconnect must not replay a deal, a moment or a celebration.

## Review Focus

1. A backlog after a backgrounded tab: the table must jump to the current state, not replay.
2. A card dragged a short way and released: it must return and not be played.
3. A drag followed by the tap event: one action, not two plays.
4. Reduced motion: every flow still completes.
5. A countdown that started before the message was shown: the bar and number must agree with the server deadline.

## Tasks

### Task 1: Playback queue
**Files:** `src/client/playback.ts`, `src/client/playback.test.ts`, `src/client/connection.ts`
- [ ] Tests first: first message delivered immediately; a second waits for the first's dwell; dwell is the largest among a message's events; `rejected` bypasses; more than 6 waiting delivers only the newest; `reset()` clears; arrival time is what the store receives.
- [ ] Implement `Playback`; route `connection.ts` through it and call `reset()` on socket open.

### Task 2: Motion foundation and card travel
**Files:** `package.json`, `src/themes/index.ts`, `src/App.tsx`, `src/ui/Card.tsx`, `src/ui/Table.tsx`, `src/index.css`
- [ ] Add `motion`; per-theme transition; `MotionConfig` at the root.
- [ ] Hand and trick share layout identity for own cards; seat-direction entry for others; exit toward the winner; staggered deal entry with no first-render animation.

### Task 3: Moments, score track and celebration
**Files:** `src/ui/Moments.tsx`, `src/ui/GameScreen.tsx`, `src/ui/Table.tsx`, `src/ui/sound.ts`, `src/index.css`
- [ ] Moment queue from events; two-beat challenge; ball-by-ball fill from `roundScored`; one burst on `gameOver`.

### Task 4: Table clarity and hand controls
**Files:** `src/ui/Table.tsx`, `src/ui/session.tsx`, `src/index.css`
- [ ] Turn ring, countdown bar, dealer and trumper badges, round-facts line, trick counts in the strip.
- [ ] Larger adaptive hand, drag to play, shake and "Play anyway" above the card, button prominence, vibration.

### Task 5: Verify
- [ ] Update both e2e scripts; run them in all three themes and with reduced motion; record a play-through per theme; full test suite, type check and build; fresh-context review of the branch.
