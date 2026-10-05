# Game modules, the shared kit and cheating — Design

Date: 2026-10-05
Status: sections 3 to 5 ready to build (sub-project C); the rest follows sub-projects A and C (sub-project D)
Depends on: `2026-10-05-cloudflare-and-rename-design.md` for sections 6 to 8

## 1. Purpose

Make the game a replaceable part. The room, the client, practice and the shell learn a game through one contract. What games truly share moves into a small pure kit: the table (seats, lobby, host, stand-ins), cards, tricks, and the machinery of cheating and catching it.

Success: Thunee runs through the contract with its behaviour unchanged; Hearts is added without editing the room, the client, practice or the shell; cheating is a house rule in both games and its shared parts are written once.

### Decisions

| Question | Decision |
|---|---|
| Who owns the game state | Each game owns one `Game` value that includes its table fields. The kit supplies the table's types and functions; it is a library, not a framework. |
| What is shared | Only what two games already need. Screen parts are extracted when Hearts needs them, not before. |
| Cheating | One mechanism, the excuse (section 5), gives both a play's legality and the proof that it was illegal. |
| The option | `allowCheating`, a rule in every game's rule set. |
| Loading | Engines are small and load together on the server. Each game's screens load on demand in the browser. |

### Out of scope

A rules language, scripting, or configuration that defines a game. Sharing strategy between games' computer players. Moving a room from one game to another.

## 2. Layout

See the overview, section 3. In short: `src/kit/` (shared, pure), `src/games/<id>/` (one game), `src/room/`, `src/client/`, `src/practice/`, `src/ui/` (all generic).

## 3. The kit (`src/kit/`)

Pure. Imports nothing from the app; Zod is allowed for schemas.

| File | Holds |
|---|---|
| `cards.ts` | `Suit`, `SUITS`, `Card<R extends string>` (`{ suit, rank }`), `sameCard`, `hasCard`, `removeCard`, `shuffle`, `cardId`, `SUIT_SYMBOL`, `SUIT_NAME`, `cardText`. A game supplies its ranks, their order, its deck and its card values. |
| `table.ts` | The table: types and functions below. |
| `tricks.ts` | `trickWinner(plays, { trump, strength })` and the follow-suit helper. `strength(card)` comes from the game. |
| `integrity.ts` | Section 5. |
| `mind.ts` | `Persona`, `PERSONAS`, `Traits`, `TRAITS`, `Mind`, `HONEST`, `roll(salt, observer, id)`, `mindFor`. Today's `src/ai/mind.ts`, plus: with cheating off, every mind plays as Straight. |
| `rules.ts` | `resolve(defaults, overrides)` and `diff(defaults, rules)`, generic over a rule set. `TRICK_PAUSE_MS`. |
| `module.ts` | The contract (section 4). |
| `testing.ts` | `seededRng`, `deepFreeze`, `collectCards`. |

### 3.1 The table

Every game's `Game` extends `TableState`, and every game's view extends `TableView`.

```ts
export type Seat = number
export type Actor = Seat | null | 'system'
export interface Ctx { now: number; rng: () => number }

export interface TableState {
  formatVersion: number
  playerCount: number
  seats: SeatInfo[]            // today's SeatInfo, unchanged
  host: Seat | null
  /** Seats the table is waiting on with no deadline, and since when each has been waited on. */
  waiting: { seat: Seat; since: number }[]
  aiActAt: number | null
  aiSalt: number
  phase: { kind: string }      // 'lobby' is every game's first phase, 'gameOver' its last
}

export interface TableView {
  seat: Seat | null
  seats: ViewSeat[]
  host: Seat | null
  owner: Seat | null
  playerCount: number
  waiting: { seat: Seat; since: number }[]
  phase: { kind: string }
}
```

`waiting` replaces today's `acting`, which could name only one seat. Hearts waits on four seats at once while cards are passed, and a host must still be able to replace the one who has stalled. `since` is kept for a seat that is still being waited on, set to `ctx.now` for one that newly is, and dropped otherwise.

Table actions are the same in every game, and every game's action type includes them:

`sit`, `leaveSeat`, `rename`, `addAi`, `clearSeat`, `setPlayerCount`, `start`, `replaceWithAi`, `reclaimSeat`, and from the system `tick` and `setConnected`.

By convention each game also has `setRules { overrides }`, `nextRound` and `rematch`, handled by the game because their effects are the game's.

Functions:

```ts
/** Handles a table action. For `start` it only validates; the game then deals. */
tableAction(game, actor, action, ctx, events, options: { seatCounts: readonly number[] }): TableReject | null
/** After every applied action: recomputes `waiting` and when the next computer seat acts. */
settle(game, ctx, toAct: Seat[], untimed: Seat[]): void
tableView(game, seat): the TableView fields except `phase`     // hides a hidden persona until game over
replaceableSeats(view, now): Seat[]                             // disconnected, or waited on for over a minute
isAiControlled, actingHost, fixHost, cleanName, emptySeats, allSeats, seatsFrom, nextSeat
```

These are today's `lobby.ts`, the table half of `apply.ts`, `schedule`, and `replaceableSeats`, made generic. Their behaviour does not change. Seats are numbered in play order and `nextSeat` is always the next number; whether that player sits on the viewer's right or left is the screen's business (section 4.2, `direction`).

Teams are not in the kit. Thunee keeps `teamOf` and `partnerOf`.

## 4. The contract

### 4.1 The game (`src/kit/module.ts`)

What the room, practice and tests need. Pure.

```ts
export type Memory = 'table' | 'full'
export interface Step<A> { actor: Actor; action: A; fallback?: A }
export type Ask<G, A> = (game: G) => Step<A> | null

export interface GameModule<G extends TableState, A, E, V extends TableView> {
  id: string                         // 'thunee', 'hearts': also the path and the room-name prefix
  formatVersion: number
  seatCounts: readonly number[]      // [2, 4] for Thunee, [4] for Hearts
  createGame(): G
  apply(game: G, actor: Actor, action: A, ctx: Ctx): { game: G; events: E[] } | { rejected: string }
  viewFor(game: G, seat: Seat | null, memory?: Memory): V
  seatsToAct(game: G): Seat[]
  nextDeadline(game: G): number | null
  checkInvariants(game: G): void
  /** What a client may send. System actions are absent. */
  actionSchema: z.ZodType<A>
  /** A passed deadline, or a computer turn whose time has come. */
  dueStep(game: G, now: number): Step<A> | null
  /** Questions to put to computer seats after an applied action. */
  reactions(game: G, events: readonly E[]): Ask<G, A>[]
}
```

`apply` keeps its two promises in every game: it never mutates its input, and it never throws on player input.

`src/games/index.ts` lists the modules by id.

### 4.2 The screens (`src/games/<id>/client.ts`)

What the shell needs. Loaded on demand, so nobody downloads Hearts to play Thunee. The names here may be adjusted while building; the split of responsibilities may not.

```ts
export interface GameClient<V, A, E> {
  id: string
  name: string                                  // 'Thunee'
  tagline: string                               // 'Jack high, twelve balls to win.'
  /** Which side the next player sits on, as the viewer sees the table. */
  direction: 'clockwise' | 'counterclockwise'
  seatCounts: readonly number[]
  /** How long an event holds the screen before the next message is shown. */
  dwell(event: E): number
  /** Sound, toast and table moment for one event. */
  present(event: E, view: V, seat: Seat | null): Presentation
  /** Everything after the lobby. */
  Table: ComponentType<{ view: V; room: string }>
  /** House rules: defaults, schema for share links, built-in presets, and each rule's label and choices. */
  rules: RuleBook
  /** How the lobby groups seats: Thunee's two teams, or none. */
  lobbyTeams: (seat: Seat, playerCount: number) => number | null
  practice: GamePractice | null
}
```

A static list (`id`, `name`, `tagline`) feeds the Tricks home without loading any game.

## 5. Integrity: cheating and catching it

Thunee's cheating is a pattern, and little of it is about Thunee: the engine accepts more than is legal, records the truth in secret, an accusation gets a certain verdict from that record, and a penalty follows. Computers cheat, cover their tracks, and notice with fading attention.

### 5.1 The option

Every game's rule set has `allowCheating: boolean`. Thunee always allows cheating today, so its value in Traditional is `true`.

With it off:
- `available.play` equals `available.legal`, so `apply` rejects a rule-breaking card. Nothing else in `apply` changes, because it already validates against `availableActions`.
- A false claim is rejected.
- The accusation lists are empty, and the accuse control is not shown.
- `mindFor` gives every computer the Straight mind, and the lobby does not offer personas.

### 5.2 Excuses

Most rules of play have one form: *you may do this only if you hold none of those*. You may play off suit only if you hold none of the led suit. In Thunee you may undercut only if you hold nothing but trumps. In Hearts you may lead a heart before they are broken only if you hold nothing else.

```ts
/** A play that is legal only if the hand it came from held no card matching `without`. */
export interface Excuse<C> {
  rule: string                     // 'followSuit', 'undercut', 'heartsLead', 'firstTrickPoints'
  without: (card: C) => boolean
}
```

A game writes one function: given a card and the public state of the trick, the excuses that play needs. Everything else follows from it.

- **Legality.** A play breaks a rule when the hand it came from held a card its excuse says it could not have. A card is legal when it breaks none.
- **The record.** For every card played the engine stores `handBefore` and `broke: string[]`, the rules that play broke. Both are hidden from every view. `broke` replaces today's `legal: boolean`, so a verdict can say what was done.
- **Proof.** A later card from the same hand that matches an earlier excuse's `without` proves that excuse was false. This needs only the public play history, so a computer catches a cheat with the same information a person has.
- **Covering tracks.** A card that would prove one's own earlier excuse false is the card a careful cheat holds back.

Excuses are derived from public state when needed. They contain functions and are never saved.

```ts
export interface PlayRecord<C> { seat: Seat; card: C; handBefore: C[]; broke: string[] }
export function brokenRules<C>(handBefore: readonly C[], excuses: readonly Excuse<C>[]): string[]
export function legalCards<C>(hand: readonly C[], excusesFor: (card: C) => Excuse<C>[]): C[]

/** A play as an observer sees it. `deal` separates hands dealt apart, such as Thunee's two halves. */
export interface SeenPlay<C> { seat: Seat; card: C; trick: number; deal: number; excuses: Excuse<C>[] }
export interface Proof {
  id: string                       // `<rule>:<seat>:<trick>:<revealing trick>`; stable, so a proof gets one look: see `roll`
  accused: Seat
  rule: string | null              // the rule broken, for a play
  claim: number | null             // the claim disproved, for a declaration
  gap: number                      // tricks between the cheat and the card that shows it up
  salience: number
}
export function playProofs<C>(plays: readonly SeenPlay<C>[], suspect: (seat: Seat) => boolean): Proof[]
export function exposes<C>(card: C, own: readonly SeenPlay<C>[]): boolean
export function noticeOdds(attention: number, gap: number, salience: number): number
export function chanceOfVoid(hidden: number, unseen: number, held: number): number
/** The first proof this mind notices. Each proof's roll never changes, so one missed stays missed. */
export function noticed(proofs: readonly Proof[], mind: Mind, observer: Seat): Proof | null
```

`noticeOdds`, `chanceOfVoid` and the rolling loop are today's code from `src/ai/suspicion.ts`. A game sets `salience` and finds its own suspicion signals, since what looks suspicious is game knowledge.

### 5.3 What is not offered

- **A forced move.** Where the table already knows the truth, there is nothing to hide. Hearts' opening lead of the two of clubs is the example: the app has just named who holds it.
- **Anything the engine cannot record and judge.** Peeking, signalling a partner, arranging the deal, misreporting a score.

### 5.4 Declarations

A declaration that asserts cards (Thunee's Jodhi) records `valid` at the moment it is made, hidden from views. Its proof is one of the asserted cards seen somewhere it could not be. The record's shape and the proof stay with the game; `Proof.claim` and `noticed` are shared.

### 5.5 Accusations and penalties

Each game defines its accusation actions, who may accuse whom, and the penalty, since the penalty is scored in the game's own terms. The kit helps find the verdict: the accused seat's first play this round with a non-empty `broke`.

## 6. Moving Thunee

| Today | Becomes |
|---|---|
| `src/engine/` | `src/games/thunee/engine/`. `cards.ts` keeps Thunee's ranks and values on kit cards. `seats.ts` keeps teams. `lobby.ts` and the table half of `apply.ts` are replaced by the kit. `tricks.ts` is rewritten on excuses. |
| `src/ai/` | `src/games/thunee/ai/`, except `mind.ts`, which is already in the kit. `suspicion.ts` and `cheat.ts` use `playProofs`, `noticed` and `exposes`. Thunee names its two excuse rules `renege` and `undercut`, so its proof ids, and with them every computer's roll, stay exactly as they are today. |
| `src/coach/` | `src/games/thunee/coach/` |
| `src/ui/Table.tsx`, `RoundResult.tsx`, the Thunee half of `GameScreen.tsx` (`present`) | `src/games/thunee/ui/` |
| `src/presets/describe.ts` | Thunee's `RuleBook`. `storage.ts` and `share.ts` become generic and keyed by game. |

Changes Thunee's players can see: none, except the new rule in the rules list.

Changes to Thunee's saved shape: `acting` becomes `waiting`; `legal` becomes `broke`; `allowCheating` joins the rule set. Its format version rises.

The new rule follows the checklist in `AGENTS.md`: the field and its Traditional value, the engine branch, a description line, a schema line, and tests under each value.

## 7. The generic parts

- **Room** (`src/room/`). `TableRoom` finds its module from the room's name, which the host supplies on every wake; the game is never saved as a separate fact. A room saved under another format version for that game resets, as today. It binds a token to a seat on `sit`, a table action, so it needs no game knowledge. It validates each message with the module's `actionSchema`.
- **Protocol.** The same envelope, with the view, action and event types supplied by the game.
- **Client** (`src/client/`). `openSession(game, code)`. The store is generic. `Playback` takes the game's `dwell`.
- **Practice** (`src/practice/`). The session and the waiting clock are generic. A game supplies `GamePractice`: its seat names, its setup, what identifies a pause the player must continue past, which actions are decisions worth reviewing, and its coach (`2026-10-05-coach-tiers-design.md`).
- **Shell** (`src/ui/`). The Tricks home, a game's home, the lobby, and the frame around the table (connection banner, toasts, moments, the error boundary). Shared parts that exist today stay shared: `Card`, `Hand`, `Sheet`, `Moments`, `ThemePicker`. More are extracted from Thunee's table when Hearts needs them: seat badges and their placement by `direction`, the trick area, the timer, the accuse sheet, the menu.

## 8. Testing

- Every existing test moves with its code and passes.
- The kit has its own tests. The table's are today's lobby tests. Integrity's cover: a broken excuse is recorded; a legal play records nothing; a later card proves an earlier excuse false; a card from a different deal proves nothing; `exposes`; `noticed` is stable across calls.
- One contract test runs against every module in the list: a seeded simulation with random legal players plus a little chaos, checking after every action that invariants hold, that no view leaks a hidden card, and that a legal player's action is never rejected. Each game supplies its random legal player and says which cards are hidden from a seat.
- Each game has tests under `allowCheating` true and false.

## 9. Build order

Sub-project C, new files only, Thunee untouched:
1. `src/kit/`: cards, table, tricks, integrity, mind, rules, module, testing, with tests. Where the kit generalises Thunee code, copy and generalise it; do not edit the original.
2. The Hearts engine on the kit (`2026-10-05-hearts-design.md`).

Sub-project D, after A and C are merged:
3. Thunee's engine onto the kit, in place, tests passing at each step.
4. Thunee's `allowCheating`.
5. The module contract for Thunee; generic room, protocol and client.
6. Folder moves; the screens contract; the shell; on-demand loading.
7. Generic practice.
8. Hearts appears in the list of games with its engine and a random legal player. It needs sub-project E to be worth playing.
