# The lobby's computers: one tap, then a persona if wanted

**Date:** 2026-10-09. **Status:** designed, not built.

## 1. The gap

"Add computer" in the lobby opens a sheet of five personas before anything happens, so filling three seats is six taps and three reads of the same sheet. Most hosts want a fair computer and want it now. And every computer is one of four names, in the same order every game: Asha, Bheki, Chan, Devi.

## 2. The fix

**One tap adds a Straight computer.** "Add computer" sends `addAi` for the seat at once, with no persona, which the kit already reads as Straight. The sheet no longer stands in the way.

**The persona is changed on the seat.** With cheating on, a computer's row shows its persona as a small button where the row's text said "computer: Straight": "Straight", "Sharp", "Sly", "Wild", or "Secret" for a surprise. For the host it is a button that opens the same sheet as before, now titled "Change this computer", and picking sends a new table action `setPersona { seat, persona }`, which sets the seat's persona and, for "Surprise me", draws one and hides it. For a guest it is text. With cheating off there is no persona to show or change, as today.

**Names are drawn at random from a longer list.** `AI_NAMES` grows to two dozen, still prefixed "Bot " so a name at the table says what it is (since superseded: names are plain and the seat's "Computer" tag says it, see `2026-10-10-copy-style-design.md` section 6), and `addAi` draws one of the unused names with `ctx.rng()` instead of taking the first. Should a room ever have more computers than names, the fallback "Bot <seat>" stays.

The list: Asha, Bheki, Chan, Devi, Fatima, Gugu, Hema, Jabu, Kiran, Lindiwe, Mohan, Naledi, Priya, Rajesh, Sipho, Thandi, Vikram, Yusuf, Zanele, Anil, Busi, Dineo, Farouk, Kesh.

## 3. Code

- `src/kit/table.ts`: `AI_NAMES` extended and drawn at random; `setPersona` in `TableAction`, in the host-only lobby actions, in `step`, and in the Zod schema (`persona: z.enum([...PERSONAS, 'surprise'])`). It is refused outside the lobby, for a seat that is not a computer, and from anyone but the host, as `addAi` is.
- `src/kit/table.test.ts`: `setPersona` sets, surprises and hides, and is refused as above; a name is unused and from the list; the fallback.
- `src/ui/Lobby.tsx`: "Add computer" sends at once; the persona button on a computer's row, host only, opening the sheet; the sheet sends `setPersona`.
- `src/ui/personas.ts`: a label for a hidden persona in the lobby ("Secret").
- `scripts/e2e.ts`, `e2e-hearts.ts`, `e2e-controls.ts`, `perf-drag.ts`: the click on "Straight" after "Add computer" goes. One script (`e2e-controls.ts`) changes a computer to Sharp through the row's button and reads it back.
- `AGENTS.md`, "Computer personas": a computer is added Straight and its persona changed in the lobby.

## 4. Checks

- Unit tests above. The room test's saved fixture with Straight computers is unaffected: names are saved in the game, never drawn again.
- Browser: `e2e-controls.ts` adds a computer with one tap, sees "Straight" on its row, changes it to Sharp, sees "Sharp"; with cheating off, no persona shows.
