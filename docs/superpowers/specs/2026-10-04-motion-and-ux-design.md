# Motion and UX Pass — Design

Date: 2026-10-04
Status: approved in conversation; review of this document waived by the user
Branch: `motion`

## Purpose

The rebuilt table works but has almost no motion: cards fade in where they land, moves arrive as fast as the server sends them, and calls, challenges and balls awarded are carried by a small toast. This pass makes play readable and satisfying on a phone. It covers four areas the user chose: card motion and pacing, big moments, table clarity, and hand and controls.

Out of scope: the home and lobby screens, new sound design beyond one per-ball tone, and any change to `src/engine/`, `src/ai/` or `party/`.

## 1. Playback queue (`src/client/playback.ts`)

Sits between the socket and the store.

- Each `sync` message is delivered to the store, then held for a dwell time before the next is delivered. The dwell is the largest value among the message's events:

  | Event | Dwell (ms) |
  |---|---|
  | `cardPlayed` | 450 |
  | `passed` | 300 |
  | `dealt`, `trumpRevealed` | 600 |
  | `trumpChosen` | 700 |
  | `called` | 800 |
  | `jodhiClaimed` | 1400 |
  | `dealCancelled` | 1500 |
  | `doubleCalled`, `khanaakCalled` | 1600 |
  | `thuneeCalled` | 1800 |
  | `challengeResolved` | 2200 |
  | anything else | 0 |

- A message that arrives when nothing is held is delivered at once, so a player's own action is never delayed.
- `rejected` and `error` messages bypass the queue.
- If more than 6 messages are waiting, the queue delivers only the newest and drops the rest. `reset()` (called when the socket reopens) clears the queue and the hold.
- The store's clock offset is measured from the time a message arrived, not the time it was delivered.

## 2. Card motion

Uses the Motion library (`motion/react`). A theme supplies its default transition; `MotionConfig reducedMotion="user"` honours the system setting.

- **Own cards** share a layout identity between the hand and the trick, so a played card travels from one to the other. The hand closes up with a layout animation.
- **Other players' cards** enter the trick from the direction of their seat.
- **A won trick** exits toward the winner's seat when the trick pause ends. Each side's trick count sits in the score strip and pops when it rises; tapping it opens the trick history.
- **The deal**: cards that appear in the hand after first render enter from the dealer's direction with a stagger. Nothing animates on first render, so a refresh does not replay a deal.

Theme feel: Retro short and linear, Modern table a spring, Minimal a short ease-out.

## 3. Big moments (`src/ui/Moments.tsx`)

One overlay, fed by events, showing one moment at a time.

- Thunee, Double, Khanaak: a banner naming the caller. Jodhi: a banner with suit and points.
- Challenge: two beats, first who challenges whom, then the verdict with the card or suit.
- `roundScored`: the winning side's new balls fill one at a time on the score track, each with a tone.
- `gameOver`: one celebration burst in the winning side's colour.
- The toast remains for call amounts, trump chosen and revealed, a cancelled deal and the second-half deal.

## 4. Table clarity

- The seat to act has a ring; countdowns show a shrinking bar as well as the number.
- Dealer and trumper carry small badges on their seats.
- A round-facts line under the score strip: trump, the call, and what the counting side must reach; under Thunee, who must win every trick.
- The centre button of the score strip becomes a plain menu button.

## 5. Hand and controls

- Larger cards whose overlap adapts to the number held.
- Tap to play, or drag a card up onto the table.
- An illegal card shakes and shows "Play anyway" directly above it; tapping elsewhere cancels.
- Jodhi, Double and Khanaak are prominent only when available. Challenge is a quiet button.
- A short vibration when it becomes the player's turn, where supported.

## Testing

- Unit tests for the playback queue with a fake clock: immediate first delivery, dwell ordering, bypass for rejections, backlog skip, reset, and clock offset from arrival time.
- Existing unit, server and simulation tests unchanged and passing.
- `scripts/e2e.ts` and `scripts/e2e-two.ts` updated for the new controls and passing in all three themes.
- A recorded play-through per theme at 390x844, and one run with reduced motion emulated.
