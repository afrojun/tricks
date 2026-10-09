# Table talk: lines, emotes, throws and Again

**Date:** 2026-10-09. **Status:** designed, not built.
**Builds on:** `2026-10-06-sunburst-look-and-sound-design.md` (the look, and the voices of section 5), `2026-10-04-ai-personas-design.md` (personas).
**Split out:** signals to a partner are `2026-10-09-signals-design.md`; the thinking card (a card back lifting while a person holds a card raised) is designed separately.

## 1. The gap

At a real table people talk: a groan at a lost trick, a laugh when someone is caught, a nudge for the one who takes forever, a wink to a partner. Tricks has none of it. Players can make the calls, and in a room of friends on a video call that is enough, but a room of strangers or a game with computers is silent. The planned voices (sunburst section 5) answer the game on their own and put words in the mouths of people who never said them.

## 2. What it is

Three pieces. The first two share one channel.

| | Piece | Saved? |
|---|---|---|
| 1 | **Lines and emotes**: a tray of the seven recorded lines and eight emotes; one shows at your seat for everyone, and computers say them too | no |
| 2 | **Throws**: something sent to another player's seat, flying across the table; a nudge also buzzes their phone | no |
| 3 | **Again**: at game over, each person taps Again; the game restarts when everyone is in | yes |

Typed chat is not part of it, now or later: slow on a phone, it stops the game, and it needs moderating. Every line, emote and throw is a fixed id, so nothing anyone sends can be offensive beyond a chappal.

## 3. The look

Designed by Fable; the mockup is `tricks-table-talk.html` in the artifacts folder. Every curve is the app's overshoot, `cubic-bezier(.3,1.45,.5,1)`; reduced motion keeps fades and drops the travel and spin.

**Entry points.**
- **Talk button.** A round button (40px, `.btn-quiet`) at the right end of the hint row above the hand, never over the hand, the action bar or Thunee's calling panel. A tap opens the tray.
- **A name pill.** Tapping another player's name pill opens a paper menu that hangs from it with a yellow plate (pops in over 220 ms). It holds the five throws, and "Mute <name>" under a rule. A side seat's menu opens inward.
- **Game menu.** "Reactions on" / "Reactions off", beside "Sound on". With reactions off, the talk button goes, a name's menu holds only Mute, and nothing from others shows.

**The tray.** A paper strip (`.panel` colours, 14px top radius, a yellow plate above its top edge). It rises in 220 ms and closes in 160 ms. It has no backdrop and covers the hand only while open. A pick or a tap outside closes it. Its rows:
- **Say:** pills of 36px in the bubble style, reading Yoh!, Haibo!, Ekse!, Eish!, Aweh!, Lekker! and Ha ha ha.
- **Emotes:** eight stickers of 44px.

**Stickers.** Inline SVG `<symbol>`s on a 48-unit grid, each a die-cut paper disc with a 2.5px ink outline. Fills are flat, in `--paper`, `--ink`, `--red`, `--blue` and `--yellow` only. They show with a few degrees of tilt and a solid drop, like the cards. Never system emoji.

| Emotes | Throws |
|---|---|
| `clap`: two yellow hands, red ticks | `chappal`: blue sole, red straps, yellow post |
| `howl`: crying with laughter, yellow face, blue tears | `rose`: red bloom, blue leaves |
| `facepalm`: a hand over one eye | `tomato`: red, blue calyx |
| `fire`: red flame, yellow core | `chip`: a blue poker chip with paper notches and a yellow star, for respect |
| `eyes`: blue irises looking aside | `nudge`: yellow knuckles, two red knock marks; buzzes the target's phone twice for 40 ms |
| `sweat`: a blue drop, a wobbly mouth | |
| `pray`: hands together, red ticks | |
| `sleepy`: closed eyes, blue z's | |

**On a seat.**
- **A line** is the existing `.bubble` in the seat's `seat-said` slot, landing yellow as calls do. It shows for 2500 ms, then fades over 300 ms.
- **A sticker** takes the same slot at 46px. It scales in from 0.2 over 220 ms, tilted 8°, and starts to go at 2200 ms.
- **Your own** lines and stickers show in the hint row, as your calls do.

**Throttled.** The limit is one shared budget for lines, stickers and throws together: one every 3000 ms. A tap inside it keeps the pressed pill pressed and yellow. Every other tray button dims to 40%, and a 2px ink line along the tray's top edge draws back over the 3000 ms. If the tray has closed, the talk button dims instead. It shows no text.

**A throw.**
- **Flight.** It leaves from the thrower's name, or from the top edge of your hand for your own. It lobs across in 640 ms: across in a straight line, up then down over the trick, with one full spin.
- **Landing.** It lands with a squash (1.25/0.8 back to 1, over 200 ms). The target's name shakes ±7° over 600 ms, and a tomato also squashes it.
- **After.** The sticker sits at 40px, tilted 14°, for 2500 ms, on the corner of the name away from its speech slot.

**Again.**
- **The button.** "Again". Once tapped it stays pressed and reads "You're in", over "Waiting for Asha and Devi."
- **The host** alone also has a quiet "Start now" beside it.
- **The names.** The panel shows each player's name as a pill. Those who are in wear a yellow "In" tag; those still to tap wear the pulsing yellow name the table already uses for "waiting on you".
- **Well played.** Tapping a name on the game-over panel opens a kind set only: `clap`, `chip`, `rose` and Lekker!. A chappal there reads as sore losing.
- **Muted.** A muted player wears a quiet "Muted" tag in their tag row on your screen.

## 4. Talk: lines, emotes and throws

### What may be said

```ts
// src/kit/talk.ts
export const LINES = ['yoh', 'haibo', 'ekse', 'eish', 'aweh', 'lekker', 'laugh'] as const
export const EMOTES = ['clap', 'howl', 'facepalm', 'fire', 'eyes', 'sweat', 'pray', 'sleepy'] as const
export const THROWS = ['chappal', 'rose', 'tomato', 'chip', 'nudge'] as const
export type Say =
  | { kind: 'line'; id: Line }
  | { kind: 'emote'; id: Emote }
  | { kind: 'throw'; id: Throw; at: Seat }
```

The lines are exactly the table words of the voice sheet, so each one is a recording once the voices exist. Until then a line is its bubble and a soft tap sound.

### The wire

`ClientMessage` becomes a union. The game's schema still parses `action`; the room's own schema parses the rest.

```ts
type ClientMessage<A> = { action: A } | { say: Say }
type Said = { seat: Seat; say: Say; after?: number }
type ServerMessage<V, E> =
  | { type: 'sync'; ...; said?: Said[] }        // computers' banter rides with the sync it answers
  | { type: 'said' } & Said                      // a person's talk, and a computer's answer to a throw
  | ...
```

`said` is not a sync: it carries no version and no view, is never saved, and is not a numbered event. `Playback` passes non-sync messages straight through, so a person's talk is never held behind a dwell. A computer's banter is the opposite: it answers something in the game, so it travels in that sync's `said` and is shown when the sync is, never ahead of the trick it is about. A connection that opens later never hears what was said before it: talk is of the moment.

### The room

`Table.onMessage` sends talk to `talk()` instead of `act()`. It is not queued behind actions (it reads the token map and the game and changes neither), and it never writes to storage.

- **Only a seated human talks.** A spectator's, or a token with no seat, is dropped.
- **A throw needs a target**: another seat that is not empty. A nudge needs the table to be waiting on its target (`module.seatsToAct(game)` includes it), so it cannot pester someone who is holding nothing up.
- **Rate, per seat.** A seat may talk once every 2500 ms (the client's budget is 3000 ms, so a person never meets the server's) and nudge the same seat once in ten seconds, however many sockets it has open and however often it reconnects. The times live in the room's memory, keyed by seat. That is the one thing the room keeps in memory, and it is not a fact of the game. The limits are best effort: a room usually hibernates only after seconds with no messages, by which time every window has passed, but a restart can clear them early. That is acceptable, because everything that can be sent is a fixed, harmless id, and the client keeps its own budget anyway. Over the limit, the message is dropped without a reply; the client dims the tray while it waits (section 3).
- **Relay.** `{ type: 'said', seat, say }` goes to every connection, the sender's too, so every screen shows it from the same message.

### Computers talk too

A game's module gains an optional `banter(game, events, rng): Said[]`, read after every applied action in `act`, as `reactions` is, and carried in the `said` of the sync that action sends. Practice calls it at each application inside its own loop and carries the result with that step's events, so a practice round's banter lands with its trick too.

Banter is not saved and needs no repeatable decisions, so it draws from the room's `rng`, never from `aiSalt`: a reply anyone can provoke must not become a way to probe the salt that decides cheats and catches. A computer speaks only for a moment that matters, and rarely: a Jack slammed or the queen of spades (0.15, one computer), a trick of 40 points or more won (0.25, the winner), caught by a challenge (0.6, the table then the guilty one, as in sunburst section 5), a challenge that fails (0.6, the challenger), balls won (0.3, one on each side), game won (0.8, the winners). A moody persona that is behind says Eish twice as often. With cheating off every computer is Straight, and Straight still talks: banter is not cheating.

A computer hit by a throw answers it now and then (Haibo! to a chappal, Lekker! to a rose, 0.4), drawn the same way. The room sends the answer straight after the throw, as `{ type: 'said', seat, say, after: 600 }`, and the client shows it that long after the throw lands, so the server keeps no timer (they are the alarm's alone).

### This changes the voices

Sunburst section 5 had the table answer every call in other players' voices. With people able to answer for themselves, only computers answer automatically, through `banter`; a person's voice says only what that person chose, and their calls (the call is theirs). In a room of people only, the table is as quiet as they are. The section 5 table is rewritten to match when the voices land.

### The client

- `src/client/talk.ts`: a small store beside `GameStore`, fed `said` (alone or from a sync) by the session. It holds what is on each seat now (a line or emote until it fades, the throws in flight) on browser timers, which are fine here: it is presentation, and nothing waits on it.
- `Session` gains `say(say)`. Online they send; in practice they go straight back into the talk store, and computers answer throws as above.
- **The shell draws it; each game places it.** The tray, the bubbles, the flights and the name's menu are the shell's (`src/ui/talk/`). `SeatBadge`'s name becomes a button that opens the name's menu. Each game's table puts the shell's `<TalkButton />` at the end of its own hint row (Thunee's and Hearts' build their own), as they place their badges now. The tray is a dialog: focus moves into it, Escape and a tap outside close it, and the tap outside does nothing else.
- `SeatBadge`'s `said` (a game's calls) stays as it is; talk shows beside it.
- Sounds: each line its voice (until then `tap`); an emote a soft tap; a throw its own landing sound (a slap, a thud, a chip), recordings in `public/sounds/` with their sources, as every sound; a nudge is the knock, and on the target's phone also `navigator.vibrate` (Android; iOS has no vibration from the web, so it knocks only).

### Turning it down

- **Reactions** on or off, in the game menu, beside Sound, kept as `tricks-talk` (on unless turned off). Off hides lines, emotes and throws, from oneself and from others, and plays none of them. Calls are not talk and still show.
- **Mute a player**: the menu on their name pill (section 3) has Mute, for this page only. A muted seat's talk is not shown or heard here; they are not told.
- Talk follows the mute switch for sound, like everything else.

## 5. Again

Today only the host can start a rematch, and everyone else waits on them. Instead, at game over each person taps Again, and their seat shows a ready tag. When every human seat that is connected and not stood in for has tapped, the game restarts. The host also has "Start now", which restarts at once, for the friend who has gone to make tea.

- **The action.** Both games: `rematch` becomes any human's action in `gameOver`, which adds the seat to the phase's new `again: Seat[]`. The host's `{ type: 'rematch', now: true }` starts at once, as today's `rematch` does.
- **The start is a due step.** Neither `rematch` nor any other action starts the game on the last vote. Instead `dueStep` returns a system `rematch { now: true }` whenever the game is over and the vote is complete: the electorate (human seats, connected, not stood in for) is not empty, and every one of them is in `again`. An empty electorate never starts a game nobody is watching.
- **Both engines accept it from the system.** Each engine's dispatcher refuses system actors before it reaches `rematch` today; the system's `rematch` gets its own branch ahead of that guard, accepted only in `gameOver` with `againComplete`. A person's `now: true` still needs the host.
- **Whatever completes the set starts it.** The room runs `drive` after every message and alarm today, but not after a connection opens or closes, nor after `start` reconciles connections on a wake. It now does after all three, so the start follows the last vote, a disconnect, or a wake alike. Practice applies due steps only on its timers, and game over has no deadline, so it now also drains any step due now after each of the player's actions and on load (respecting its reading holds); with one person at the table, their Again starts the game.
- **Leaving.** `leaveSeat` stays a lobby action. Someone who leaves at game over closes the page, and the disconnect takes them out of the electorate.
- The vote is shared table logic: `src/kit/table.ts` gains `againComplete(game): boolean`, which both engines' `dueStep` call.
- `FORMAT_VERSION` rises in both games (the phase's shape changes).

After a round and at game over, the names stay tappable: a rose or a chip to the one who played well is the "well played", with no new action.

## 6. Code

- `src/kit/talk.ts` (new): the ids, `Say`, its schema, the limits. Tests: the schema refuses unknown ids and a throw without a target.
- `src/protocol.ts`: the client union and its schema; `said` on a sync and alone.
- `src/room/room.ts`:
  - `talk()`, with the per-seat limits in memory.
  - `banter` after `act`, carried on the sync.
  - **Drive on connections.** `drive` also runs after a connection opens or closes and after `start`.
  - Room tests: a spectator is dropped; the limits hold across two sockets; a nudge only on a seat the table waits on; banter rides on the sync; nothing is saved; a disconnect, and a wake, complete an Again vote.
- `worker/room.ts`: unchanged.
- `src/kit/module.ts`: optional `banter`. Each game's `ai/banter.ts` with its chances.
- `src/kit/table.ts`: `againComplete` and its tests: an empty electorate, a stand-in, a disconnect completing the set.
- `src/games/thunee/engine` and `src/games/hearts/engine`: `again` on `gameOver`, the vote, the system's `rematch`, `dueStep`, `FORMAT_VERSION`.
- `src/client/talk.ts` (new) and `connection.ts`.
- `src/practice/`: `say`, banter per application, and due steps drained after the player's actions.
- `src/ui/`:
  - `talk/` (the tray, `TalkButton`, the name's menu, the stickers);
  - `SeatBadge`, `GameMenu` (Reactions), `prefs.ts`;
  - `sound.ts` and the new recordings.
- Scripts:
  - `e2e.ts` sends a line and a throw between two browsers and reads them on the other;
  - `e2e-controls.ts` turns Reactions off and mutes a seat;
  - `e2e-practice.ts` taps Again;
  - `play.ts` (sockets) checks the limits.
  - A 390x844 screenshot with a call bubble, the coach's strip and the talk button all showing, to check the hint row's room.
- `AGENTS.md`:
  - talk in the architecture and rules: not saved, never queued, banter rides on its sync, the per-seat limits the only memory;
  - the protocol line.

## 7. Open questions

1. **Throws in Hearts.** The same set in both games, or a Hearts-only one (the queen of spades, thrown)? Built with the same set; easy to change.
2. **Recordings.** Lines play `tap` and throws the existing card sounds until the voices and landing sounds are recorded.
