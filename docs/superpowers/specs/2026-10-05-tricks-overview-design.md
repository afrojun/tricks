# Tricks — Overview

Date: 2026-10-05
Status: built on `tricks`. Sub-projects A, C, D1 to D3, E1 to E3 and F are merged; B, the throwaway spike, was run and reviewed and never merged; G deployed Tricks on 2026-10-06 (section 2). Spades, the third game, was added on 2026-10-10 (H)
Builds on: `2026-10-04-thunee-rebuild-design.md`, `2026-10-04-ai-personas-design.md`, `2026-10-04-practice-and-coach-design.md`

## 1. Purpose

The Thunee app becomes **Tricks**: one place to play trick-taking card games. Every game in it is a full game with the same baseline: online multiplayer, computer players, practice, house rules, and optional cheating with detection. Thunee is the first game. Hearts is the second, chosen because it breaks the most assumptions in today's code (teams, deck, direction, trump, one seat acting at a time).

Success: Thunee plays at `tricks.afrojun.dev/thunee` exactly as it does today, Hearts plays at `/hearts` with the same baseline features, and adding a third game means writing that game and nothing in the platform.

Spades (`2026-10-10-spades-design.md`) tested that: the room, the Worker, the protocol and practice were untouched. What it needed from the rest was shared parts it was the first to use (three seats on screen, a hand of seventeen, jokers, a play suit and settled plays in the kit), each moved out of the game it came from so nothing is kept twice (Spades spec, section 10).

### Decisions

| Question | Decision |
|---|---|
| Shape | A platform that hosts one module per game. Not one engine configured to play any game: the differences between games are the games. |
| Name and address | Tricks, at `tricks.afrojun.dev`. Each game is a path: `/thunee`, `/hearts`. |
| Hosting | Cloudflare. One Worker serves the app and the rooms (Durable Objects). Vercel and PartyKit go away. |
| Old data | No backwards compatibility. Rooms in progress, saved presets, practice games and device tokens are dropped. Nothing is copied or migrated. |
| Second game | Hearts, four players. |
| Cheating | A house rule in every game. Offered wherever the app can judge it with certainty; see `2026-10-05-game-modules-design.md` section 5. |
| Computer players | Hand-written for Thunee and, first, for Hearts. A shared search player is built in the kit and adopted game by game, where it beats that game's hand-written player. The spike found it stronger at Thunee card play but did not establish it for every game (spike spec, section 7). |
| Coach | Two tiers: hints and warnings for every game, written lessons added game by game. |
| Deploy configuration | Last, after the code is in place. |

### Assumptions to confirm

These were not discussed and are easy to change:

1. **Cheating is on by default in every game**, including Hearts. The hand already asks for a second tap before a rule-breaking card, so it cannot happen by accident. One rule turns it off.
2. **A wrong accusation in Hearts costs the accuser 26 points**, mirroring the offender's penalty. There is no tradition to follow here.
3. **The GitHub repository keeps its name** until you choose to rename it.

### Out of scope

Accounts, matchmaking, chat, games beyond Hearts, Hearts for three or five players, and native apps.

## 2. Sub-projects

| | Sub-project | Spec | Depends on | Status |
|---|---|---|---|---|
| A | Cloudflare hosting and the rename | `2026-10-05-cloudflare-and-rename-design.md` | nothing | **Merged.** |
| B | Search-player spike (throwaway) | `2026-10-05-search-player-spike-design.md` | nothing | **Run and reviewed.** Never merged, by design; its results are in its spec, sections 6 and 7. |
| C | Shared kit and the Hearts engine | `2026-10-05-game-modules-design.md` sections 3 to 5, `2026-10-05-hearts-design.md` sections 2 to 6 | nothing | **Merged.** |
| D1 | Thunee's engine and computer players onto the kit, and the cheating option | `2026-10-05-game-modules-design.md`, build steps 3 and 4 | A, C | **Merged.** |
| D2 | The module contract for Thunee; a room, protocol, client and practice for any game | the same, steps 5 and 7 | D1 | **Merged.** |
| D3 | Folder moves, the screens contract, the shell, on-demand loading, Hearts in the list | the same, steps 6 and 8 | D2 | **Merged.** |
| E1 | Hearts' hand-written computer players and personas | `2026-10-05-hearts-design.md` sections 7.1 and 7.2 | C. New files in the Hearts folder, so it runs beside D. | **Merged.** |
| E2 | The search player in the kit, gated on Hearts | `2026-10-06-search-player-design.md` | D2, E1 | **Run; the gate failed** on strength and on speed, so Hearts keeps its hand-written player. The search player is merged and kept in the kit (`src/kit/search/`), with Hearts' adapter and gate in `src/games/hearts/ai/`, for another attempt or a third game. Results in its spec, section 9. |
| E3 | Hearts' screens, practice and presets | `2026-10-05-hearts-design.md` sections 8 and 9 | D3, E1 | **Merged.** Hearts has its own table, round result and game over. |
| F | Coach in two tiers | `2026-10-05-coach-tiers-design.md` | D2, E1 | **Merged.** Thunee's coach is written by hand; Hearts' is the kit's tier 1. |
| G | Deploy configuration | `2026-10-05-deploy-design.md` | everything | **Deployed 2026-10-06** at `tricks.afrojun.dev`, by Cloudflare Workers Builds on every push to `main` (deploy spec, section 7). |
| H | Spades, the third game, for two, three or four | `2026-10-10-spades-design.md` | everything | **Deployed 2026-10-10** at `/spades`. Hand-written computer players and a tier-1 coach; the search player was not tried. |

A, B and C touched different files and ran in parallel. D is split in three so each part can be reviewed well; it is the work that moves Thunee's files, so only work in other folders runs beside it.

## 3. Layout

As built (`AGENTS.md` describes each folder in more detail):

```
src/kit/            Shared and pure: cards, the 52-card deck, partners, the table (seats, lobby, host, stand-ins), tricks,
                    integrity (excuses, proofs), minds and personas, rule helpers, the module
                    contract and its runner, the coach contract and the tier-1 coach (coach.ts).
  search/           The search player, for any game. No game plays with it yet (E2).
src/games/thunee/   engine/  ai/  coach/  ui/  index.ts (module)  client.ts (screens)
                    practice.ts  contract.ts (test fixture)
src/games/hearts/   the same; ai/ also holds the search adapter and its gate (gate/)
src/games/spades/   the same
src/games/index.ts  The list of games the server holds.
src/protocol.ts     Wire messages, generic over a game's types, and room names.
src/room/           The room: identity, persistence, the alarm, driving computers. Any game, any host.
worker/             Cloudflare only: the Durable Object and the fetch handler.
src/client/         Socket, store, paced playback.
src/practice/       A practice game in the browser, for any game.
src/ui/             The shell: Tricks home, game home, lobby, practice screen, game screen frame,
                    and the shared parts: hand, seat badge, trick area, sheets, the coach's strip,
                    sheets and review (coach/).
src/themes/  src/presets/  scripts/
wrangler.jsonc  .node-version
```

Dependency direction: `games/* -> kit`; a game's `client.ts` and `ui/ -> src/ui, practice, presets`; `room -> games, kit, protocol`; `worker -> games, protocol, room`; `ui -> client, practice, presets, kit`, and `ui -> games (screens)` only through on-demand loading; `practice -> client, protocol, kit`. Games never import each other. `kit` imports nothing from the app.

## 4. Addresses

| Path | Shows |
|---|---|
| `/` | Tricks home: the games |
| `/<game>` | That game's home: create, join, presets, practice |
| `/<game>/<CODE>` | A room. Codes stay six capital letters. |
| `/<game>/practice` | A practice game |
| `/parties/room/<game>-<CODE>` | The room's socket. Not typed by anyone. |

The room is named from its address, so which game a room holds is never a separate stored fact.

## 5. Rules that keep it correct

Everything under "Rules that keep it correct" in `AGENTS.md` carries over, applied per game. Three are restated because the platform leans on them, and four are new.

Carried over:
- **Engines are pure.** Time and randomness arrive through `ctx`. This is also what lets a search player call `apply` thousands of times on imagined deals.
- **No game or timer facts in server memory.** Written for restarts; it is also what makes Durable Object hibernation safe.
- **Views hide information**, and each game's simulation test checks it.

New:
- **Games are modules.** The room, client, practice session and shell know a game only through the contract in `src/kit/module.ts`.
- **One definition of a rule.** A play's legality and the proof that it was illegal come from the same description (an excuse; game-modules spec section 5), so they cannot disagree.
- **A cheat is only offered where the truth is hidden.** If the table can already see that a move breaks a rule, the app refuses it even with cheating on.
- **Saved formats are per game.** Each module has its own format version. A change resets that game's rooms only.

## 6. How the work is run

- `tricks` is the integration branch. Nothing reaches `main` until sub-project G, because a push to `main` deploys.
- Each sub-project is built on its own branch in its own git worktree by an Opus implementer, from its spec, with a short plan under `docs/superpowers/plans/`.
- Each branch is reviewed against its spec by a GPT-6.1-Sol reviewer before it is merged into `tricks`. Findings go back to the implementer.
