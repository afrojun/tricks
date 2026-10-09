# Thunee Rebuild — Design

Date: 2026-10-04
Status: implemented on `rebuild`
Branch: `rebuild`

## 1. Purpose

The December 2025 version of Thunee works on the happy path but has recurring bugs: stuck games, lost seats on reconnect, wrong scoring in later rounds, and UI that disagrees with the server. This rebuild replaces the whole app with an architecture in which those classes of bug cannot occur, and adds three things requested during design:

- Traditional Thunee rules as the default, with house rules as explicit overrides.
- Named rule presets that are saved on the device and shareable by link.
- A redesigned UI whose look is supplied by a theme (Retro, Modern Table, Minimal).

### Success criteria

1. A full 4-player game against three AIs and a full multi-tab human game both reach game over with no stuck state, under both built-in rule presets.
2. Refreshing the page or dropping the connection mid-hand returns the player to their seat with their hand, without re-entering a name.
3. A PartyKit room restart in the middle of any timer resumes the game.
4. No client ever receives another player's hand, the undealt deck, or the trump suit before it is revealed.
5. Every rule setting is covered by engine tests under each of its values.

### Out of scope

Six-player Thunee, the open-face two-player game, Royals, blind calls, blind Thunee, accounts, chat, and game replays.

## 2. Root causes in the old code

Each design decision below answers one of these.

| # | Cause | Example |
|---|---|---|
| 1 | Player identity is the socket connection | A reconnect gets a new ID; rejoin falls back to name matching; IDs are broadcast and accepted as proof of identity |
| 2 | One alarm slot, with the pending timer type held in memory | A room restart mid-timer leaves the game stuck; AI calls fire instantly as a workaround |
| 3 | State mutated in place from many handlers; round data rebuilt from a game-wide log | Thunee judged on every trick of the game; 2P last-trick bonus awarded twice; `isLastCardTrump` never reset |
| 4 | The same rule decided in more than one place | Game ends at 12 but UI checks 13; default trumper differs between two files; first leader differs between two paths |
| 5 | Client infers events by diffing snapshots | Celebrations can replay; trump is sent before reveal; any connection can send `start` |

## 3. Architecture

```
src/engine/    pure rules: state, actions, apply, view, availableActions   (answers 3, 4)
src/ai/        pure: seat view -> action
party/         PartyKit room: identity, persistence, alarm, protocol       (answers 1, 2)
src/client/    connection, store, event queue                              (answers 5)
src/ui/        screens and components, token-only styling
src/themes/    retro, modern, minimal
src/presets/   preset storage and share-link encoding
```

Dependency direction: `ui → client → engine`; `party → engine, ai`; `ai → engine`. The engine imports nothing from the other folders, and nothing in it reads the clock or generates randomness.

Stack: Vite, React, TypeScript, Tailwind, PartyKit, at current versions. Zod for validating wire messages and presets. **pnpm** replaces Bun as package manager and **Vitest** replaces `bun test`; `AGENTS.md`, `README.md` and the deploy workflow are updated to match.

## 4. Rules engine

### 4.1 Interface

```ts
apply(game: Game, action: Action, ctx: { now: number; rng: () => number })
  : { game: Game; events: GameEvent[] } | { rejected: RejectReason }

viewFor(game: Game, seat: Seat | null): View          // null = spectator
availableActions(view: View): AvailableActions        // used by UI and AI
legalPlays(hand, trick, trump, rules): Card[]
checkInvariants(game: Game): void                     // throws on engine bugs
```

`apply` is the only way game state changes. It never throws on player input; it returns a rejection code. `game` is treated as immutable.

### 4.2 Seats and direction

Seats are numbered 0 to 3 (0 to 1 in two-player). Play is counterclockwise, modelled as `next(seat) = (seat + 1) % n`, so "to the right of X" is `next(X)`. Teams are by seat parity: seats 0 and 2 against 1 and 3.

### 4.3 State

```ts
type Game = {
  formatVersion: number
  rules: RuleSet            // frozen at game start
  playerCount: 2 | 4
  seats: SeatInfo[]         // name, kind: human | ai, connected
  host: Seat
  balls: [number, number]
  dealer: Seat
  khanaakCalled: boolean    // for the 13-ball setting
  lastRoundWinner: Team | null
  roundNumber: number
  phase: Phase
}
```

`Phase` is a tagged union. Each variant holds only what exists in that phase.

| Phase | Fields |
|---|---|
| `lobby` | — |
| `calling` | hands (4 cards), stock, defaultTrumper, highest call and caller, passed seats, preselect, deadline |
| `trumpSelection` | hands (4 cards), stock, trumper, call amount |
| `thuneeWindow` | hands (6 cards), trumper, trump, call amount, pending Thunee call, passed seats, deadline |
| `playing` | `RoundPlay` (below), turn |
| `trickPause` | `RoundPlay`, deadline |
| `roundResult` | `RoundSummary`: every scoring line, balls awarded, reason |
| `gameOver` | winning team, final `RoundSummary` |

```ts
type RoundPlay = {
  hands: Card[][]
  trumper: Seat; callAmount: number
  trump: Suit | null; trumpRevealed: boolean
  thunee: { caller: Seat } | null
  half: 1 | 2; stock: Card[]                 // two-player only
  tricks: CompletedTrick[]                   // this round only
  current: PlayRecord[]
  jodhiClaims: JodhiClaim[]
  jodhiOpenFor: Team | null                  // set when a trick is won
  double: { caller: Seat } | null
  khanaak: { caller: Seat } | null
}

type PlayRecord = { seat: Seat; card: Card; handBefore: Card[]; legal: boolean }
```

`handBefore` and `legal` are recorded when the card is played and are never sent to clients. Challenges read them directly; there is no hand reconstruction.

AI turns are also deadlines: any phase in which an AI seat must act carries `aiActAt`.

### 4.4 Actions

Lobby: `sit`, `leaveSeat`, `rename`, `addAi`, `removeAi`, `setRules`, `setPlayerCount`, `start`.
Round: `call`, `pass`, `preselectTrump`, `chooseTrump`, `callThunee`, `playCard`, `claimJodhi`, `callDouble`, `callKhanaak`, `challengePlay`, `challengeJodhi`, `nextRound`, `replaceWithAi`, `reclaimSeat`.
After game over: `rematch`.
System (server only): `tick`, `setConnected`.

Host-only: `addAi`, `removeAi`, `setRules`, `setPlayerCount`, `start`, `nextRound`, `rematch`, `replaceWithAi`.

### 4.5 Round flow (four players)

1. **Deal 4.** The deck is shuffled with `ctx.rng`. Four cards go to each seat starting at the dealer's right. Phase: `calling`.
2. **Calling.** A window of `callTimerSeconds` opens (with `timers` off, it has no time limit). Calls are 10 to 100 in tens, then 104, and a call is always the next amount up: no jumps. The first call may not come from the default trumper's side, so their partner may call only over the other side's call; after that only an opponent of the current highest caller may raise. Each valid call restarts the window. A seat may `pass`; the window closes early once every seat that could still call has passed. The default trumper or current highest caller may `preselectTrump`; a preselect is private and is cleared when that seat is outcalled.
3. **Trump.** The highest caller, or the default trumper if nobody called, is the trumper. They choose a suit they hold among their four cards, or "last card" (the suit of the last card dealt to them). If they preselected, this step is skipped. Phase: `trumpSelection`, then two more cards are dealt to each seat.
4. **No-trump redeal** (setting). If neither member of the counting team holds a trump, the deal is cancelled and redealt by the same dealer.
5. **Thunee window.** A window of `thuneeWindowSeconds` (with `timers` off, it has no time limit, and 0 seconds does not skip it). Eligible seats may `callThunee` or `pass`. A call from the trumper's team ends the window at once. A call from the other team is held until the window closes and is overridden by a later call from the trumper's team. A seat holding six cards of one suit may not call: with `allowCheating` off the call is refused; with it on the call is accepted, recorded (hidden), and an opponent may `challengeThunee` during play for 4 balls, as with any challenge. The window closes early when every eligible seat has passed.
6. **Play.** Leader: `next(trumper)` normally; under Thunee, per the `thuneeLeader` setting. Trump is revealed to everyone after the first card is led. Six tricks. A completed trick is shown for 2 seconds (`trickPause`), then its winner leads.
7. **Score.** Phase `roundResult`, or `gameOver` if a team has reached the target.

A card that is not in the player's hand, or played out of turn, is rejected. A card that breaks a play rule is **accepted** and recorded as `legal: false`.

Play rules: follow suit if able. With the undercutting setting on, a player void in the led suit may play a trump lower than a trump already in the trick only if their hand is entirely trumps.

### 4.6 Special calls

**Jodhi.** After a trick won by their team and before the next card is led, a player may claim a Jodhi by naming a suit and whether it includes the Jack. With `timers` off, when a computer won the trick (and so leads next) and its partner is a person, the trick pause has no deadline: it waits for that partner to claim or `pass` ("No Jodhi"), and either ends it. A person who leads needs no wait, since the claim stays open until they lead. Values: 40 (K+Q of trump), 50 (with J), 20 (K+Q of another suit), 30 (with J). Timing is limited by the `jodhiTiming` setting. The claim names its suit to the engine, but every other seat sees only its points (a 40 or 50 is plainly trump), in the view and in the `jodhiClaimed` event; a challenger must work the suit out from the cards. Claims are not verified when made. A claim is true if the claimant held the named cards per the `jodhiCards` setting. No Jodhi under Thunee.

**Thunee.** The caller undertakes to win all six tricks. In four-player with a trump and `redealIfNoTrumps` on, once both of the caller's opponents have played another suit to a trump lead, the round is dealt again when that trick's pause ends; without timers and with a person as caller, the pause waits for them to deal again (`pass`) or challenge someone who may have hidden a trump. Who may call, what is trump, who leads, and who must win the tricks are settings. Success: 4 balls. Failure: 4 balls to the opponents, or `thuneePartnerCatchBalls` if it failed because the caller's partner won a trick (caller-only mode). Play continues until a trick is lost or all six are won.

**Double** (setting, four players). On their turn in the sixth trick, before playing, a player may call Double if their team won the first five tricks. Success, meaning the caller wins the sixth: 2 balls. Otherwise 4 balls to the opponents. Not allowed for a team one ball short of the target, or under Thunee.

**Khanaak** (four players). On their turn in the sixth trick, before playing, a player whose team has claimed a Jodhi may call Khanaak.
- *Strict:* succeeds if the team has lost at least one trick, the caller wins the last trick, and team Jodhi + 10 exceeds the opponents' card points plus the opponents' Jodhi. The call amount is ignored.
- *Simple:* succeeds if the caller's team wins the last trick and the opponents' card points are below team Jodhi + 10.
- Balls: 3 on success, 6 if the caller is on the counting team ("backward"), 4 to the opponents on failure.

**Challenge.** During `playing` or `trickPause`, a player may challenge an opponent's play (all of that seat's plays this round are checked) or a specific Jodhi claim. If the accused cheated, the challenger's team gets 4 balls; if not, the accused's team does. The round ends with no other score.

Precedence when a round ends: challenge, then Thunee, then Khanaak, then Double, then normal scoring.

### 4.7 Normal scoring

The counting team is the trumper's opponents.

```
counting total = card points in their tricks
               + last-trick adjustment
               + call amount
               + their Jodhi − trumper team's Jodhi
```

The counting team wins if the total is at least 105 (two-player: `twoPlayerTarget`). They get 2 balls if a call was made, otherwise 1. If they fall short, the trumper's team gets 1 ball.

Last-trick adjustment is a setting: `transfer` (+10 if they won it, −10 if they lost it) or `bonus` (+10 if they won it, otherwise 0).

### 4.8 Between rounds

Dealer rotation and default trumper are settings (4.10). The game ends when a team reaches `ballsToWin`, or 13 if `khanaakRaisesTarget` is on and any Khanaak has been called; with `twoToClear`, also only when two balls ahead.

### 4.9 Two-player game

Each player gets 4 cards, calling and trump selection run as above with the non-dealer as default trumper, then 2 more cards each. After six tricks the remaining 12 cards are dealt six each; trump and the call carry over, there is no second calling phase, and the winner of the sixth trick leads. The round is scored once, after twelve tricks, and the last-trick adjustment applies to the twelfth trick only. A Thunee call applies to the first half and ends the round after it. Jodhi timing counts tricks within each half. Double and Khanaak do not apply. The no-trump redeal is checked when the second six are dealt: if the counting player held no trump in either deal, the round is dealt again, first half and all.

### 4.10 RuleSet

| Setting | Values | Traditional | Tuscans |
|---|---|---|---|
| `thuneeCaller` | `anyone` \| `trumperOnly` | anyone | anyone |
| `thuneeTrump` | `firstCardLed` \| `noTrump` | firstCardLed | firstCardLed |
| `thuneeLeader` | `caller` \| `afterCaller` | caller | caller |
| `thuneeWinner` | `callerOnly` \| `team` | callerOnly | callerOnly |
| `thuneePartnerCatchBalls` | number | 8 | 4 |
| `jodhiTiming` | `firstAndThird` \| `anyTrick` | firstAndThird | anyTrick |
| `jodhiCards` | `inHand` \| `dealt` | inHand | inHand |
| `lastTrick` | `transfer` \| `bonus` | transfer | transfer |
| `defaultTrumper` | `dealerRight` \| `teamAhead` | dealerRight | dealerRight |
| `dealerRotation` | `stayWhileBehind` \| `always` | stayWhileBehind | stayWhileBehind |
| `khanaak` | `strict` \| `simple` | strict | strict |
| `khanaakRaisesTarget` | boolean | false | false |
| `double` | boolean | true | true |
| `undercutRestriction` | boolean | true | false |
| `redealIfNoTrumps` | boolean | true | true |
| `ballsToWin` | number | 12 | 12 |
| `twoToClear` | boolean | false | false |
| `twoPlayerTarget` | number | 125 | 105 |
| `timers` | boolean | false | false |
| `callTimerSeconds` | number | 10 | 10 |
| `thuneeWindowSeconds` | number | 5 | 10 |

Definitions:
- `jodhiCards: inHand` means the cards are in hand when the claim is made; `dealt` means they were among the six cards dealt.
- `defaultTrumper: teamAhead` means the team ahead in balls, or on a tie the last round's winner, or failing that the dealer's right; the trumper is that team's member nearest the dealer's right.
- `timers: false` means calling and the Thunee window have no deadline: each waits until every seat it waits on has called or passed, and those seats count as waited on, so a stalled one can be handed to the computer. The same goes for a person whose computer partner is about to lead with a Jodhi open (4.6). `callTimerSeconds` and `thuneeWindowSeconds` apply only with `timers` on; with them on, a Jodhi must come within the trick pause.
- `dealerRotation: stayWhileBehind` means the deal passes to the right only when the dealer's team has at least as many balls as the other team after scoring.

Fixed for every rule set: the 24-card deck, card ranks and values, the 105 four-player target, call amounts, call-and-lost paying 2 balls, challenge paying 4 balls, the 2-second trick pause.

Tuscans is the house rules played at Tuscans: Traditional with the five differences in the table.

## 5. Server (`party/`)

### 5.1 Identity

Each browser generates a random secret token once and stores it in localStorage. The token is sent as a connection parameter. The server keeps `token → seat` in room storage alongside the game. Clients only ever see seat numbers. A connection whose token maps to a seat is that seat; any other connection is a spectator. Several connections may share a token.

On connect and disconnect the server applies `setConnected` for the seat, based on whether any connection for it remains.

### 5.2 Message handling

Messages are processed strictly one at a time through a queue:

1. Parse and validate with Zod; reject malformed messages.
2. Resolve the sender's seat from their token; attach it to the action.
3. `apply`. On rejection, send `{ rejected, reason }` to the sender only.
4. `checkInvariants`. On failure, log, keep the previous state, and send an error to all clients.
5. Await the storage write of game and identity map.
6. Send each connection its own view with the new events.
7. Set the alarm to the earliest deadline in the new state, or clear it.

### 5.3 Timers

`onAlarm` applies `tick` with the current time. `tick` resolves every deadline that has passed: closing the call window, closing the Thunee window, ending a trick pause, or performing an AI turn. On `onStart` the server loads state and re-arms the alarm from it. No timer information exists outside the saved state.

### 5.4 AI

For an AI turn, `tick` calls `chooseAction(viewFor(game, seat), rules, rng)` from `src/ai/` and applies the result through the same path as a human action. AI turns are scheduled 600 to 1200 ms out, and AI calls are spread across the call window.

AI behaviour: plays only legal cards; claims a Jodhi only when it holds one; never challenges; calls and chooses trump from hand strength as the old AI did; calls Thunee, Double and Khanaak only when the view shows a near-certain result. It reads the rule set for leader, trump and timing rules.

### 5.5 Stalled seats and lifecycle

During a game the host may `replaceWithAi` a human seat that is disconnected, or that has been the seat to act for more than 60 seconds. The seat stays mapped to the player's token. The player takes it back with `reclaimSeat`, which the client sends automatically on reconnect and offers as a button otherwise. If the host disconnects in the lobby, host passes to the next connected human seat. After game over the host may `rematch`: same seats and rules, balls reset.

### 5.6 Protocol

```ts
// client -> server
{ action: Action }

// server -> client
{ type: 'sync'; version: number; seat: Seat | null; view: View; events: NumberedEvent[] }
{ type: 'rejected'; reason: RejectReason }
{ type: 'error'; message: string }
```

`version` increases by one per applied action. A full view is sent every time. Events are numbered; a newly connected client receives the current view with an empty event list.

### 5.7 View

`viewFor` returns: seats, balls, dealer, rules, phase name and public phase fields, the viewer's own hand, other seats' card counts, the current trick, completed tricks of this round (cards and winners only), Jodhi claims, trump only if `trumpRevealed` or the viewer is the trumper, the viewer's own preselect, and deadlines. It never includes other hands, the stock, `handBefore`, `legal`, or tokens.

Saved state carries `formatVersion`. A room whose saved version is not readable starts fresh in the lobby.

## 6. Client

### 6.1 Store (`src/client/`)

One store holds `connection` (connecting, open, reconnecting), `seat`, `view`, `version`, and `eventQueue`. It is exposed to React with `useSyncExternalStore` and selector hooks. Components do not copy game state into local state; local state is for presentation only.

The UI enables an action only if `availableActions(view)` lists it. The server-side `apply` uses the same rule functions, so the two cannot disagree.

### 6.2 Events

Sounds, toasts, the trick-won highlight, the ball celebration and the challenge result each consume events from the queue once, in order. Events include: `dealt`, `called`, `passed`, `trumpChosen`, `trumpRevealed`, `thuneeCalled`, `cardPlayed`, `trickWon`, `jodhiClaimed`, `doubleCalled`, `khanaakCalled`, `challengeResolved`, `dealCancelled`, `roundScored`, `gameOver`, `seatChanged`.

### 6.3 Screens

| Screen | Contents |
|---|---|
| Home | Create or join by code, choose a rule preset, choose a theme |
| Lobby | Choosable seats (which set teams), add AI, invite link, rules summary, rule editor for the host |
| Table | Other seats with card counts and connection state; the trick; the player's hand; a status strip (trump, call, target, balls); one action bar that changes by phase |
| Round result | The scoring lines from `RoundSummary`, balls awarded and why |
| Game over | Winner, rematch |
| Sheets | Round history; active rules with each difference from Traditional marked |

One table layout serves two and four players, designed phone-first. A banner shows connecting and reconnecting. Rejected actions show as a brief message. An error boundary offers a reload.

### 6.4 Themes (`src/themes/`)

A theme provides: design tokens as CSS custom properties (colour, type, radius, shadow, motion), card face and card back renderers, and optionally a sound set. Tailwind is configured to map utilities to the tokens. Components reference tokens only.

Three themes ship: **Retro** (the existing arcade identity and card-back styles), **Modern Table**, **Minimal**. Theme is a per-device preference stored in localStorage and can be changed at any time, including mid-game.

### 6.5 Presets (`src/presets/`)

A preset is `{ name, overrides }`, where `overrides` is the set of settings that differ from Traditional. Presets are stored in localStorage and validated with Zod on load. Traditional and Tuscans are built in and read-only; they can be duplicated.

A share link encodes `{ v, name, overrides }` as a URL-safe string in a query parameter. Opening one shows the rules and offers to save them. Unknown settings in a link are ignored; missing ones take the Traditional value.

## 7. Testing

- **Engine unit tests:** each setting under each value; scoring from fixed deals (normal, call-and-lost, Jodhi on each side, Thunee won, lost and partner-caught, Double, Khanaak forward and backward, two-player); a named regression test for each bug in section 2.
- **Simulation:** thousands of complete seeded random games under both presets, checking invariants after every action: 24 cards accounted for, card points total 304, exactly one seat to act or a deadline pending, every game ends.
- **View tests:** no hidden information in any phase for any seat or spectator.
- **Server tests:** the room class against a fake PartyKit room with a controllable clock: reconnect keeps the seat, restart mid-timer resumes, host-only actions, malformed messages.
- **AI tests:** AI-only games finish under both presets with no illegal play.
- **Client tests:** store and event queue without a browser.
- **Manual play:** one human with three AIs, and a multi-tab game with a refresh and a dropped connection mid-hand, in each theme at phone size.

## 8. Build order

Each stage ends runnable and tested.

1. **Engine.** Tooling switch to pnpm and Vitest; `src/engine/`; all engine and simulation tests.
2. **Server and AI.** `party/`, `src/ai/`; server and AI tests; a scripted client that plays a full game over a real socket.
3. **Client.** Store, screens, Retro theme; old `src/` and `party/` code removed; docs and deploy workflow updated.
4. **Themes and presets.** Modern Table and Minimal themes; preset storage, editor and share links.

The old code stays in place until stage 3 replaces it, and remains in git history on `main`.

## 9. Changes made during the build

These differ from the sections above and are what the code does.

- **Host (5.5).** The host role belongs to one seat and is not handed over on a disconnect. While the host is disconnected or played by the computer, the next connected human acts as host; the role returns when the host does. This stops a refresh in the lobby from giving the role away.
- **Stalled seats (5.5).** The host can hand over any seat that is disconnected or has held the turn for 60 seconds. In addition, any seated player can hand over the host's own seat once it has stalled, so an idle host cannot freeze the game.
- **Jodhi (4.6).** No claim opens after the last trick of a hand, or after the sixth trick of a two-player first half, because no further card will be led from that hand.
- **Thunee (4.6).** When Thunee trump is the first card led, the caller always leads, whatever the leader setting.
- **Lobby actions (4.4).** `clearSeat` replaces `removeAi` and can also remove a human in the lobby. `nextRound` may be sent by any seated human, not only the host.
- **Connection.** The client pings the room every 5 seconds and reconnects after two unanswered pings, and reacts to the browser going offline and online.
- **Simulation (7).** The default run is 30 games per configuration; `pnpm test:soak` runs 400.
- **Abandoned rooms (5.5).** When no seated human has been connected for 24 hours, the room is reset to an empty lobby and its seats and tokens are discarded. The clock starts when the last human disconnects, is saved with the game so it survives a restart, and is cleared when any seated human reconnects. Spectators do not keep a room alive. A room nobody ever sat in has nothing to reset and sets no alarm.
