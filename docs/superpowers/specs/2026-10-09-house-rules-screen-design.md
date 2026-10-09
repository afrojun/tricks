# House rules: a screen of their own

**Date:** 2026-10-09. **Status:** designed, not built. Follows `2026-10-08-game-navigation-design.md`.

## 1. The gap

Custom rules are made in one place: the lobby's "Change rules" sheet, which only the host sees, and only after sitting down. A player who wants house rules has to create a game, sit, then edit. The home can only pick from presets that already exist, and its "House rules" sheet is read-only. The rules editor is the lobby's most hidden feature and its most consequential one.

## 2. The fix

**A screen for a game's house rules, at `/<game>/rules`.** It lists the game's presets, built in and saved, and edits the saved ones. Everything about a ruleset happens there: make one, change it, rename it, delete it, share it, take one from a link. The home picks one; the lobby picks one; nothing else edits rules.

**The screen, top to bottom.**

- The bar: left, a quiet link "‹ Thunee" to the game's home (the chevron hidden from screen readers); right, "Look".
- The title "House rules" as the page's heading (display face, as a panel title, not a wordmark: this is a page of the game, not a game) and the line "Presets for Thunee. Pick one on the home or in a lobby."
- The presets as a row of chips, like the home's: built-ins first, then saved ones, then a chip "+ New". One is selected; the screen below shows it. The chip selected on arrival is the one named in the address (`?preset=<id>`), else the one the home last chose, else the first.
- The selected preset:
  - **Built in** (Traditional, Tuscans; Standard, Omnibus): its name, "Built in" in muted text, the read-only `RulesList` with house rules marked as the sheet marks them, and two buttons: "Copy link" and "Make a copy", which creates a saved preset "Traditional copy" with the same overrides, selects it, and focuses its name.
  - **Saved**: its name as an editable field (renamed on blur or Enter, `renamePreset`), the per-rule controls (the existing editor's, without its "Start from a preset" row, which the chips replace), each change saved at once (`updatePreset`, new in `src/presets/storage.ts`), and three buttons: "Copy link", "Make a copy" and "Delete" (which asks once, inline: "Delete Friday night?" with "Delete" and "Keep").
- "+ New" creates "New preset" from the selected preset's rules, selects it and focuses its name. So a new preset always starts somewhere sensible, usually the defaults.

Nothing is "saved" by a button: a saved preset is always saved. The "Save preset" field and button leave the editor.

**Share links open the screen.** A link `/<game>?rules=<code>` (what `shareUrl` makes, and what is already in the wild) opens the home as it does today, which at once replaces its address with `/<game>/rules?rules=<code>`. The screen shows the shared rules as a preset of their own, selected, named as the link named them, with "Shared with you" in muted text, the read-only list, and one button, "Save", which saves it and selects it. Dismissed (another chip picked) it is gone. The home's "Shared rules" panel leaves, and with it the one case that made the home scroll.

**The home picks.** The "Rules" row keeps its chips and gains a last one, "Edit…", a link to `/<game>/rules?preset=<selected id>`. The chosen preset is remembered on the device (`tricks-<game>-preset`, the id; a missing or unknown id means the first), so coming back from the screen, or opening the home tomorrow, finds it chosen. The screen writes the same key when a preset is selected there, so what was last edited is what the home offers. The bar's "House rules" button becomes a link to the screen too, and its sheet goes: one place.

**The lobby picks.** The host's "Change rules" sheet goes. In its place, for the host, the row of preset chips (from the host's device, as the home's), each sending `setRules` with its overrides, with the current one pressed when the room's rules match a preset. "See every rule" stays for everyone. A host who wants a change the presets lack goes to the screen; the lobby says so under the chips: "To make your own, see House rules on the Thunee home." The room keeps its own rules, so a guest sees the summary as before.

**The waiting screens, the practice** and the tables do not change. Practice plays the defaults.

## 3. Code

- `src/ui/routes.ts`: `{ screen: 'rules'; game }` for `/<game>/rules`, read before the code branch as `practice` is; `rulesPath(game, preset?)`. `routes.test.ts` gets the cases.
- `src/App.tsx`: the route to a `RulesScreen` inside the game's provider.
- `src/ui/RulesScreen.tsx`: the screen above, built from `TopBar`, `RulesList`, the rule controls and the preset storage.
- `src/ui/Rules.tsx`: the per-rule controls exported on their own (`RuleControls`, the editor's middle), so the screen and nothing else uses them. `RulesEditor` (chips, controls, save, share) goes with the lobby's sheet. `RulesSheet` stays for the lobby's "See every rule" and the tables' menus.
- `src/presets/storage.ts`: `updatePreset(game, id, overrides)`, and `presetChoiceKey(game)` with `readChoice` and `writeChoice` for `tricks-<game>-preset`. Tests in `presets.test.ts`.
- `src/ui/Home.tsx`: the chosen preset read from and written to the device; the "Edit…" chip; the "House rules" bar button a link to the screen; the sheet and the "Shared rules" panel removed; a share param replaces the address with the screen's.
- `src/ui/Lobby.tsx`: the host's chips in place of "Change rules".
- `AGENTS.md`: the `src/ui/` line names the rules screen; `src/presets/` says presets are made on `/<game>/rules` and the chosen one is remembered; routes gain `/<game>/rules`.
- The game navigation spec's section on "House rules" is superseded by this one; a line there says so.

## 4. Checks

- Unit: routes (`/thunee/rules`, `/thunee/rules?preset=x`, and that `RULES` as a code still goes to the home), storage (`updatePreset`, the choice key, unknown ids).
- `scripts/e2e-controls.ts`: from the home, "Edit…" opens the screen with the chosen preset; "+ New" makes a preset, a rule changed there sticks after a reload, a rename sticks, "Make a copy" of Traditional makes "Traditional copy", "Delete" asks and deletes; back on the home the new preset is chosen; in the lobby the host sees the chips and picking one changes the summary. A share link opens the screen with "Shared with you" and "Save" adds it.
- The home at 390x844 still fits without scrolling; the screen may scroll.
