# Playing over days

**Date:** 2026-10-11. **Status:** designed, and reviewed for design and copy; built in parts, in the order of section 3. Parts 1 and 2 built.

## 1. The gap

Every game assumes the table plays at once. A room nobody seated has been connected to for a day is reset, and a game played over days has nobody connected most of the time. Nothing says it is your turn once the tab is closed, and nothing lists the games a device sits in, so the invite link is the only way back. A seat that stalls for a minute may be handed to the computer, and Thunee's timers, which close calling and the Thunee window after seconds, are house rules beside the rules of play.

## 2. The design

**Table settings are not house rules.** How the table is run (its pace, and Thunee's timers) is not a rule of the game: it is not in a rule book, a preset or a share link, and it is not frozen at the start. It lives in `TableState.settings` (`src/kit/table.ts`), which every game has:

- `pace`: `'live'`, "Together", everyone at the table at once, as today; or `'async'`, "Over days", each plays their turn when they can. The screens never say live or async.
- `timers`: the seconds each of the game's timed windows stays open, or null for none (the table waits for everyone). A game declares its windows (`TimerSpec`: an id, a default, a range); Thunee has two, `call` (10 s, 3–60) and `thunee` (5 s, 0–30), moved from its `RuleSet`. Hearts and Spades have none. Timers apply only while the pace is live.

The host changes them with a table action, `setSettings`, in any phase: a game started together may go on over days when someone has to leave. While the host is away, the next person connected holds the host's powers, as for every host action. A change applies from the next window that opens. A change of pace is an event, `paceChanged`, which the frame shows everyone as a toast ("Asha set the pace to over days"). The lobby shows them in a panel of their own, "Pace", under the house rules: two choices, "Together" ("Everyone at the table at once.") and "Over days" ("Take your turn when you can. The computer plays for anyone who leaves a turn waiting for two days."), and for Thunee while together a "Time limits" switch with "Time to call" and "Time to call Thunee" in seconds once on; over days, "No time limits over days." Everyone else reads the choice. The host's last choice is kept on the device for the next game they create (`tricks-<game>-table`), as the table size is, and the game menu shows the same controls to the host during play. Tuscans' 10-second Thunee window, a preset's until now, is gone with the move.

**Over days, the table keeps the game and covers for a slow seat.**

- A room whose pace is async is reset after 14 days with nobody seated connected, not one (`abandonedAfter(settings)`).
- A person the table has waited on for two days (`TURN_LIMIT_MS`; one day is too short for four friends each taking a turn a day) is stood in for by the computer, as "Let the computer play" does, while at least one other person at the table is still playing for themselves: the last person playing is never stood in for, so an abandoned game never plays itself to the end. A system table action, `standIn`, does it; the room drives it beside the game's own due step and arms its alarm for it. The client already takes the seat back when its player opens the game, and taking it back restarts their wait, so the computer does not take it straight back.
- Nobody may hand another's seat to the computer by hand (the one-minute stall): the two days' limit does it.
- Seats are not marked "Away" while the pace is async, at the table or in the lobby, since everyone is away most of the time; a computer playing for someone still says so.

**"Your games".** The device keeps the rooms it has a seat in (`tricks-rooms`: game, code, when last seen; the newest 20, none older than 30 days), adding a room when a sync gives it a seat and dropping it when one gives it none. The Tricks home lists them first (and shows nothing when there are none), "Your turn" first, each row naming the game and the people ("Thunee with Asha, Chan and Devi") over what it waits on: "Your turn", "Computer playing for you", "Waiting for Asha" (or "Waiting for Asha and Chan"), "In the lobby", "Game over". A game's home shows only its own "Your turn" rows. The list asks each room with a plain request, `GET /parties/room/<name>` with the device token in a header (`X-Tricks-Token`), which the Worker gates as it gates a socket and the room answers only for a seated token: its phase, the players' names, whether it waits on you, and on whom. A room that does not know the token answers 404, and the device forgets it.

**Notifications.** A device may ask to be told when a game needs it. With permission granted, the page subscribes to Web Push (VAPID; the public key is in the code, the private key a Worker secret, `VAPID_PRIVATE_KEY`) and sends the subscription to each room it sits in, which keeps it per device token and forgets it when that token's seat goes. When the table starts waiting on a person who is not connected, the room sends them "Your turn" over "Thunee with Asha, Chan and Devi", with the game's address; a nudge sends "Asha nudged you", and the computer standing in sends "The computer is playing for you", the same way. One notification per game at a time (its tag is the room), so a long absence leaves one. The service worker shows it, opens or focuses the game on a tap, and sets the app badge; the Tricks home clears it. A push service's 404 or 410 drops the subscription. The offer, "Tricks can tell you when it’s your turn, even with the app closed." with "Turn on notifications", appears in the lobby and the game menu only while the pace is over days; once granted, "Notifications" is a switch in the menu's settings. A browser that refused says "Notifications are off for Tricks in your phone’s settings." 

**While you were away.** A room keeps its last 200 events (`log`, saved beside the state). A client opening a room says the last event it saw (`since`, kept per room on the device), and the room sends the events after it, when it still has them all, in a `recap` message ahead of the first sync. The game's client turns them into a few lines (`recap(events, view, seat)` on `GameClient`, from the same words as its toasts and moments; a pace change is among them), which the table shows in a sheet, "While you were away", once, closed with "Got it".

**Thunee's windows over days.** Calling and the Thunee window wait for every person, which over days is a day per window at worst. A player may answer ahead: while the pace is async, a seat may say "No" to the coming Thunee window before it opens (the table's existing `pass`, accepted early and kept on the seat until the window opens), and calling closes for a seat that has passed once with no new call above. The details, the Jodhi partner's pause among them, wait on the first three parts being played over a few real days.

## 3. Order

1. Table settings (pace and timers), and the async rules above: keeping the game, standing in after a day, no hand-over by stall, no "Away". Raises every game's `FORMAT_VERSION`.
2. "Your games" and the room's status request.
3. Notifications and the badge.
4. While you were away.
5. Thunee's windows over days.

## 4. Checks

- `src/kit/table.test.ts`: `setSettings` (host only, any phase, timers checked against the game's windows, `paceChanged`); `standIn` (only after the limit, only over days, never the last person playing); `replaceableSeats` over days.
- `src/room/room.test.ts`: an async room survives a day and is reset after 14; a stalled seat is stood in at the limit and not before, and not again at once after it is taken back; the status request; push on a new wait, not twice, and not to a connected seat; the recap.
- Thunee's engine tests: timers read from the settings, untimed over days.
- Browser: the lobby's "How you play" sets async; a second device sees it; "Your games" lists the room.
