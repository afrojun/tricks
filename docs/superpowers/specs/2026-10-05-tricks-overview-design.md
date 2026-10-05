# Tricks — Overview

Date: 2026-10-05
Status: direction agreed in conversation; each sub-project below has its own spec
Builds on: `2026-10-04-thunee-rebuild-design.md`, `2026-10-04-ai-personas-design.md`, `2026-10-04-practice-and-coach-design.md`

## 1. Purpose

The Thunee app becomes **Tricks**: one place to play trick-taking card games. Every game in it is a full game with the same baseline: online multiplayer, computer players, practice, house rules, and optional cheating with detection. Thunee is the first game. Hearts is the second, chosen because it breaks the most assumptions in today's code (teams, deck, direction, trump, one seat acting at a time).

Success: Thunee plays at `tricks.afrojun.dev/thunee` exactly as it does today, Hearts plays at `/hearts` with the same baseline features, and adding a third game means writing that game and nothing in the platform.

### Decisions

| Question | Decision |
|---|---|
| Shape | A platform that hosts one module per game. Not one engine configured to play any game: the differences between games are the games. |
| Name and address | Tricks, at `tricks.afrojun.dev`. Each game is a path: `/thunee`, `/hearts`. |
| Hosting | Cloudflare. One Worker serves the app and the rooms (Durable Objects). Vercel and PartyKit go away. |
| Old data | No backwards compatibility. Rooms in progress, saved presets, practice games and device tokens are dropped. Nothing is copied or migrated. |
| Second game | Hearts, four players. |
| Cheating | A house rule in every game. Offered wherever the app can judge it with certainty; see `2026-10-05-game-modules-design.md` section 5. |
| Computer players | Decided by a spike: one search player for every game if it holds up, hand-written players per game if not. |
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

| | Sub-project | Spec | Depends on |
|---|---|---|---|
| A | Cloudflare hosting and the rename | `2026-10-05-cloudflare-and-rename-design.md` | nothing |
| B | Search-player spike (throwaway) | `2026-10-05-search-player-spike-design.md` | nothing |
| C | Shared kit and the Hearts engine | `2026-10-05-game-modules-design.md` sections 3 to 5, `2026-10-05-hearts-design.md` sections 2 to 6 | nothing: new folders only |
| D | Game modules: Thunee behind the seam, generic room, client, practice and shell, the cheating option | `2026-10-05-game-modules-design.md` | A, C |
| E | Hearts as a full game: screens, computer players, practice, presets | `2026-10-05-hearts-design.md` sections 7 to 10 | B, D |
| F | Coach in two tiers | `2026-10-05-coach-tiers-design.md` | B, D |
| G | Deploy configuration | `2026-10-05-deploy-design.md` | everything |

A, B and C touch different files and run in parallel. D is the one step that moves Thunee's files, so nothing else runs beside it.

## 3. Target layout

```
src/kit/            Shared and pure: cards, seats, the table (seats, lobby, host, stand-ins),
                    tricks, integrity (cheating records, proofs), personas, the module contract.
src/games/thunee/   engine/  ai/  coach/  ui/  index.ts (module)  client.ts (screens)
src/games/hearts/   the same
src/games/index.ts  The list of games.
src/room/           The room: identity, persistence, the alarm, driving computers. Any game, any host.
worker/             Cloudflare only: the Durable Object and the fetch handler.
src/client/         Socket, store, paced playback.
src/practice/       A practice game in the browser, for any game.
src/ui/             The shell: Tricks home, game home, lobby, game screen frame, shared parts.
src/themes/  src/presets/  scripts/
```

Dependency direction: `games/* -> kit`; `room -> games, kit, protocol`; `worker -> room`; `ui -> games (screens), client, practice`; `practice -> client, games, kit`. Games never import each other. `kit` imports nothing from the app.

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
