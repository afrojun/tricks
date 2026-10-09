# Signals: a secret sign to a partner (draft)

**Date:** 2026-10-09. **Status:** draft, split out of `2026-10-09-table-talk-design.md` to be designed on its own.
**Builds on:** that spec (the talk tray and its look), `2026-10-04-ai-personas-design.md` (personas, noticing), `2026-10-04-thunee-rebuild-design.md` (the challenge).

## 0. Why it is separate

Signalling a partner is real table culture and against the rules, so in Tricks it is a cheat that an opponent may catch and challenge. That raises questions the rest of table talk does not:

- **Skill or luck.** Below, catching a signal is a hidden draw. Should it be a skill instead, such as something on screen that only an attentive player notices? A draw is fair on a slow phone; a skill is more of a game.
- **Other games.** Hearts has no partners, but collusion (two players feeding points to a third) is its version. Should the mechanism be the kit's, for any game with teams, rather than Thunee's?
- **Secrecy.** Signals are the first thing in the app that only some seats may know happened. That changes how the room sends messages (section 2).

What follows is the design as it stood when it was split out, after two rounds of review by GPT-6.1-Sol. Its decisions are a starting point, not settled.

## 1. The look (from Fable's mockup, `tricks-table-talk.html`)

**Entry.** A "Psst, <partner>" row at the foot of the talk tray, only in four-player Thunee with cheating on and a partner seated: `--paper-shade`, a 2px dashed ink border, four suit discs and a J disc. A long press (500 ms) on the talk button opens the tray at it. With reactions off, the talk button stays and its tray holds only this row.

- **The sender** gets a quiet dashed note in their own hint row, "♠ to Chan", for 2500 ms. Nothing shows publicly.
- **The partner** sees a folded note tucked under the sender's name (`.whisper`: `--paper-shade`, a 1.5px dashed ink border, a 6px radius, a turned corner, rotated −4°, in over 320 ms). It reads "Lead spades" or "I have the Jack", with no sound and no flash. It stays until the partner's next play, or 20 s.
- **An opponent who caught it** sees the `eyes` sticker small (28px) on the signaller's name. A yellow tag in their hint row reads "You saw Asha signal Chan". It is not a toast that vanishes: it stays until the round ends or they challenge. The Challenge button gets the yellow attention ring.
- **The accuse sheet** gains a red "Signalling" for each opponent, with the risk line "A wrong challenge gives them 4 balls."
- **The verdict** is the existing danger moment: "Caught!" over "Asha signalled Chan: 4 balls to you", or "Nothing there" over "No signal: 4 balls to Asha & Chan".
- **The round result headline** reads "Devi caught Asha signalling Chan." or "Devi challenged Asha over signalling, and was wrong."

## 2. The room: a seat is sent only what is new for it

- **No message.** In `act`, each connection's view before and after is compared (as JSON); with no events, an unchanged view sends nothing. Today every action reaches every socket.
- **Versions are the clock.** Each action sets `version` to `max(version + 1, now)`, so a gap in versions says nothing about hidden actions; the client only needs it to rise.
- **Test.** The messages to an uncaught opponent, across a person's wink and up to the partner's next decision (which the wink may change, by design), are the same with the wink as without.

## 3. Signals (Thunee)

Signalling a partner is old table culture and against the rules, which makes it a cheat like any other: with `allowCheating` off there are no signals. In two-player Thunee there is no partner, so none. In code a signal is a **wink** (`wink`, `challengeWink`, `winks`), because Thunee's computers already call the hints behind a hunch `Signal` (`src/games/thunee/ai/suspicion.ts`); on screen it is a signal.

### The wink

```ts
| { type: 'wink'; sign: { kind: 'lead'; suit: Suit } | { kind: 'jack' } }
```

"Lead hearts", or "I've got the Jack" (of trump once trump is chosen; before that, "I've got a Jack"). A signal may be a lie; the offence is signalling, not what it says.

- **When.** From `calling` until the last trick begins: never once a player holds a single card, so a signal can always be challenged before the round ends. A round that ends early, as a lost Thunee does, ends the chance, as it does for a challenged play today.
- **How often.** At most three a round per seat.
- **It moves no clock.** `wink` returns before the engine's `settle`, so no deadline and no computer's `aiActAt` changes: a wink cannot delay a visible move.
- **Where it is kept.** On the game itself, beside `aiSalt`, not on a phase: calling, trump selection and play each build a new phase. `beginRound` empties it, and so does a cancelled deal, which deals again with a new salt.

```ts
winks: { seat: Seat; sign: Sign; at: number /* the round's play count when sent */ }[]
```

### Who sees it

A wink sends **no event**. Everything about it is in the views, and the room sends a seat a sync only when its view changed or it has events (section 8), so a seat that may not know of a wink receives nothing at all when one is sent. Nor can it tell later. The version a sync carries is no longer a count of actions, which would jump by two over a hidden one: each action sets it to `max(version + 1, now)`, the room's clock in milliseconds, so it still only rises (all the client asks of it), and a gap in it says nothing. Event numbers never skip, since a wink has none.

- **The sender** sees their own winks, for the "♠ to Chan" note and the count left.
- **The partner** sees each of their partner's winks, from when it is sent until the round ends.
- **Each opponent** catches a wink if `roll(aiSalt, opponent, 'wink:' + seat + ':' + i) < odds`, where `i` is its index in the round. That is the only draw. The odds are 0.2 for a person and `TRAITS[persona].attention * 0.3` for a computer (Sharp 0.29, Straight 0.18, Wild 0.1), so against two people a wink is caught a little over a third of the time. An opponent who catches it sees that the seat signalled, not what it said: "You saw Asha signal Chan."
- **Nobody else** sees anything, spectators included. The contract fixture's secrets gain the uncaught winks, and the simulation test checks that every message each seat receives, read whole, never shows one.

The whisper and the "You saw" tag are drawn from the view, as Thunee's call bubbles already are (`said(view, seat)`), not from an event: they are state that lasts, not a moment. Neither makes a sound.

### Challenging it

`challengeWink { seat }`, against an opponent, during `playing` or `trickPause`, as `challengePlay`. Guilty if that seat winked this round. It pays as every challenge does: 4 balls to the challenger's team if guilty, to the accused's if not, and the round ends. A person who caught a wink challenges with certainty; one who did not is guessing, as with a hunch. The accuse sheet lists "Signalling" for each opponent. `challengeResolved` gains `offence: 'play' | 'jodhi' | 'wink'` for the moment, the sound and the round result's headline.

### Computers

- **Send**: Sly winks when it holds the trump Jack, or a suit it wants led and its partner is to lead, at most once a round (careful); Wild does so whenever it has a reason, up to the limit (reckless). Straight and Sharp never do. Each reads its own sent winks from its view. A computer winks only as one of `reactions`, to a public event (the deal, trump chosen, a trick won), never as its turn's step, so it never spends a turn or moves a timer to wink.
- **Read**: any computer whose partner has winked "lead <suit>" leads that suit when it is to lead and holds it, unless leading it gives away a Jodhi or a sure trick. A "jack" wink raises its call by one step. It reads a partner's wink whatever its own persona: being told is not cheating.
- **Catch and challenge**: a computer that caught a wink challenges it at its next chance with `challengeWink`. `chooseChallenge` gets this as its own branch, before proofs; a caught wink is not a `Proof` and never goes through `noticed`, which would draw a second time and route it to `challengePlay`.
- `decisions.test.ts` pins one send, one read and one catch.

### The coach

The coach never suggests a wink, and `check` warns on one: "An opponent may catch it, and then it costs 4 balls." A wink from a computer partner shows to the player as its whisper; the coach adds nothing. The review counts winks sent and caught, from the round's record after the round.

### Saves

`FORMAT_VERSION` rises (the game's shape changes), with the Again vote of table talk if they ship together.

## 4. Code

- `src/room/room.ts`: section 2.
- `src/games/thunee/engine`:
  - `wink`, `challengeWink`, `winks` on the game, `offence` on `challengeResolved`, the views, `FORMAT_VERSION`.
  - Tests: under cheating on and off; with two players; across calling, trump selection and play; through a cancelled deal, a save and a reload; no wink in the last trick.
- `src/games/thunee/ai/`: send, read, catch.
- `src/games/thunee/coach/`: the warning and the review.
- `src/games/thunee/contract.ts`: the uncaught winks as secrets.
- `src/games/thunee/ui/`:
  - the Psst row's actions and the whisper;
  - the "You saw" tag;
  - the accuse sheet's "Signalling";
  - the headline and the words.

## 5. Open questions

1. **Skill or luck** (section 0). If a skill: the partner's badge flickers for 300 ms, and only those looking see it? It rewards watching badges over playing, and is unfair on a slow phone.
2. **Vocabulary.** Do "lead <suit>" and "I've got the Jack" cover the signals people actually use at Durban tables?
3. **Other games.** Kit-level, for any team game, or Thunee's alone?
