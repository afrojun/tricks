# Game navigation

**Date:** 2026-10-08. **Status:** designed, not built.

## 1. The gap

A player who opens `/thunee`, or lands there from an invite link or a table's "Leave game", has no way to Tricks or to Hearts except the browser's back button or typing an address. The Tricks home lists the games, but nothing links back to it:

| From | Ways out today | Reaches `/`? | Reaches the other game? |
|---|---|---|---|
| `/` Tricks home | a box per game | – | yes |
| `/<game>` game home | none | no | no |
| `/<game>/<CODE>` lobby | "Leave" → `/<game>` | no | no |
| `/<game>/<CODE>` table | menu, "Leave game" → `/<game>` | no | no |
| `/<game>/practice` | menu, "Leave game" → `/<game>` | no | no |
| `/<game>/<CODE>` before the first view ("Connecting to game") | none | no | no |
| `/<game>/...` before the game's code loads ("Opening Thunee") | none | no | no |

So anyone invited straight to a room never learns Tricks has a second game.

## 2. The fix

A game's home is redrawn so that it fits one phone screen, and two of its panels become a bar on top. Tables gain nothing.

**A bar on top of both homes.** The width of the panels. On a game's home, left: the Tricks mark (the favicon, small) and the word "Tricks" in the display face, a real link to `/`, opened in place on a plain click and left to the browser on a modified or middle click, as the boxes on the Tricks home are. Right: two quiet small buttons, "House rules" and "Look". On the Tricks home the bar holds "Look" alone, on the right. Read top to bottom a game's home says "Tricks, Thunee": the small mark and name say where this game lives, the big wordmark says which game this is. No chevron or "back" wording; the position carries the meaning.

**Look is a sheet, not a panel.** "Look" opens a `Sheet` titled "Look" holding the `ThemePicker` as it is. The "Look" panel leaves both homes. The table's menu keeps its picker.

**House rules, read-only.** "House rules" opens the game's `RulesSheet` for the preset chosen in "Play with friends" (the defaults resolved with its overrides), so a host can see what a preset changes before creating a game. It is the house rules, the settings a host can change, not a lesson in how the game is played: that is the coach's job in practice. Nothing is edited here; the lobby keeps the editor. Practice plays the defaults whatever preset is chosen, so the sheet says which preset it shows.

**Online play is one panel.** "New game" and "Join a game" become "Play with friends": the players row (when the game seats more than one count), the presets row, "Create game", then a dashed rule and "Or join with a code" as one row, the code field and a "Join" button side by side. The two helper lines ("You can change individual rules in the lobby", "Six letters from whoever created the game") go: the lobby shows its editor, and the field's placeholder shows the shape of a code. The code field keeps its `aria-describedby` text for screen readers.

**Learn to play stays first**, with its sentence shortened to one line ("Against the computer, with a coach who explains every move.") and its buttons as they are: "Continue practice" when a game is saved, then a button per table size.

**The other games are a strip.** Below the panels, one row per game other than this one: a `panel` the width of the others, with the game's emblem card small on the left, an overline "Also on Tricks", the game's name in the display face, its tagline on one line (clipped with an ellipsis), and a chevron on the right. A link to the game's home, opened like the Tricks link. The row's plate colour follows the game's position in `GAMES` (every second one red), as its box on the Tricks home does. With two games it is one row of about 70px, so discovery costs a strip rather than a box, and the page stays on one screen.

**The waiting screens get an exit too.** "Connecting to game ABCDEF" (`Screen` in `src/ui/GameScreen.tsx`, before the first view) gets a quiet "Leave" button to the game's home, as the lobby has, so an invited player whose socket never answers is not left with the browser's back button. "Opening Thunee" (the chunk's loading fallback in `src/App.tsx`) gets the Tricks link, since the game's own code is what has not arrived. Both work without a socket: they only navigate.

**Tables keep one way out.** "Leave" in the lobby and "Leave game" in the menu still land on the game's home. The rule: a table's way out is its game's home, and the game's home is where Tricks and the other games are one tap away. A second exit in the menu ("Back to Tricks") would clutter the one place a player goes to stop playing, to save a single tap they take rarely.

Order of a game's home, top to bottom: the bar, wordmark and tagline, shared rules (when a link carried them), Learn to play, Play with friends, the other games. At 390x844 everything but a shared-rules panel fits without scrolling.

## 3. Code

- `src/ui/Link.tsx`: an anchor that navigates in place when `opensInPlace` says so and otherwise keeps the browser's behaviour. The Tricks home's boxes move onto it; the Tricks link and the other-games strip use it.
- `src/ui/TopBar.tsx`: the bar, taking what goes left and right, and the "Look" button with its sheet, so both homes share it.
- `src/ui/GameStrip.tsx`: a game's row for the strip, from a `GameEntry`, with the plate colour from its position in `GAMES`. The Tricks home's box can stay in `TricksHome.tsx`; if the two share enough, one `GameBox` with a `compact` flag.
- `src/ui/TricksHome.tsx`: the bar with "Look"; the "Look" panel removed.
- `src/ui/Home.tsx`: the bar with the Tricks link, "House rules" (opening `RulesSheet` with `resolve(game.rules.defaults, chosen preset's overrides)`) and "Look"; "New game" and "Join a game" merged into "Play with friends"; the helper lines removed; the strip of other games; the "Look" panel removed.
- `src/ui/GameScreen.tsx`: the connecting screen's "Leave" button. `src/App.tsx`: the Tricks link on the loading screen.
- `src/index.css`: a small variant of `.tricks-mark` for the link (about 1.75rem, a 2px plate shadow), next to the existing one.
- `src/ui/routes.ts` is unchanged: `/` is already a route, and `gamePath` already builds the others.
- `AGENTS.md`, the `src/ui/` line: name the bar, `Link` and the game strip among the shared parts.
- `docs/superpowers/specs/2026-10-04-practice-and-coach-design.md` line 82 and the overview's address table still describe the home correctly; the cloudflare spec's "unchanged" note is history and stays.

## 4. Checks

- `scripts/e2e.ts`, at the "1-home" step: the link named "Tricks" and the link starting "Hearts" are visible; clicking "Tricks" lands on `/`, and the Thunee box opens `/thunee` again before the script goes on to create a game. The script's later steps find "Create game" by role, which the merged panel keeps; it never fills the code field.
- `scripts/e2e-controls.ts` or `e2e.ts`: "House rules" opens a sheet naming the chosen preset and closes; "Look" opens the picker, a theme button changes `data-theme` on the document, and the sheet closes.
- `scripts/e2e-hearts.ts`: the same from `/hearts`, with Thunee as the other game. Its join step clicks a button named "Join game" today; the merged panel names it "Join", so the script changes with it.
- The connecting screen: with `pnpm dev` stopped after the page loaded (or the socket's address blocked in devtools), open a room address and check "Leave" lands on the game's home.
- Phone check at 390x844: the Tricks link row does not push the wordmark below the fold, and the other-games box's emblem card does not clip at the panel's edge (it hangs above it, as on the Tricks home).
- No unit test: the shell's screens are not rendered in Vitest; `routes.test.ts` already covers `/`.
