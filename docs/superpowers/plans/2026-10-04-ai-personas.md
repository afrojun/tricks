# Computer Personas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each computer player a persona (Straight, Sharp, Sly, Wild) that decides whether it cheats and how well it catches cheating, with detection that rewards patient cheats over careless ones.

**Architecture:** Personas live on `SeatInfo` in the engine and are masked from views when hidden. A per-round hidden `aiSalt` makes every AI chance roll a pure hash, so "one look per proof" needs no memory. `src/ai/` gains `mind.ts` (traits, hash roll), `read.ts` (round history helpers), `suspicion.ts` (proofs, hunches, `chooseChallenge`) and `cheat.ts` (reneges, hold-back). The server asks opposing computers for a challenge after every card, claim and trick.

**Tech Stack:** TypeScript, Vitest, Zod, PartyKit, React.

**Spec:** `docs/superpowers/specs/2026-10-04-ai-personas-design.md`

## Global Constraints

- The engine stays pure: no clock, no `Math.random`, no imports from other folders. Randomness comes only from `ctx.rng` or the salt.
- `apply` never mutates its input and never throws on player input.
- Views never contain `aiSalt`, `handBefore`, `legal`, `valid`, `stock`, `dealt`, or a hidden persona before `gameOver`.
- Dependency direction: `ui -> client -> engine`; `party -> engine, ai`; `ai -> engine`. The UI must not import from `src/ai/`.
- A stand-in (`standIn: true`) always plays as Straight.
- UI copy in sentence case and plain language; components use token classes only (`btn`, `panel`, `text-muted`, `text-on-surface-muted`), never fixed colours.
- Mobile-first: check the lobby sheet at 390x844.
- Persona numbers: attention Sharp 0.95, Straight 0.6, Sly 0.6, Wild 0.35. Memory `0.5 ^ (gap / 2)`. Salience ×1.3 cheater won the trick, ×1.3 trick worth 30+, ×1.2 reveal card is J or 9, ×1.2 observer's team led the trick; ×1.5 for a Jodhi disproved by the observer's own hand.
- Sly cheats only with prize ≥ 20 and estimated risk < 0.25 (average attention 0.6). Wild cheats when prize ≥ 20 ÷ mood, or a J or 9 is on the table, or it is the last trick of the hand.
- `pnpm` may fail through the mise shim on this machine. Run tools from `node_modules/.bin` (`./node_modules/.bin/vitest run`, `./node_modules/.bin/tsc --noEmit`) if it does.

## Review Focus

1. **Views from table memory.** `history()` and everything built on it receives a `table` view in some callers (tests, scripts), where earlier tricks have empty `plays`. It must skip those tricks, not crash on `plays[0]`. The test is in Task 3.
2. **No false proofs in honest games.** If a proof could fire when nobody cheated, a Straight computer would hand away 4 balls. The test is in Task 7: Straight never challenges across honest simulated games.
3. **Two-player halves.** A void shown in half 1 says nothing about half 2's new cards. Proofs must pair a cheat and a reveal in the same half. The test is in Task 4.
4. **Old saves.** A room saved at format 1 mid-round must load, not reset. The tests are in Task 2 (upgrade) and Task 8 (server boot).
5. **A challenge ending the round inside the server's hooks.** After a challenge, no later hook may act on the finished round. The test is in Task 8.

---

### Task 1: Personas on seats

**Files:**
- Modify: `src/engine/types.ts` (SeatInfo, View, Action)
- Modify: `src/engine/lobby.ts` (EMPTY_SEAT, sit, addAi, signature)
- Modify: `src/engine/apply.ts:109-120` (pass `ctx` to `lobbyAction`)
- Modify: `src/engine/view.ts:16-31` (mask hidden personas)
- Modify: `src/engine/schema.ts:43`
- Test: `src/engine/lobby.test.ts`, `src/engine/schema.test.ts`

**Interfaces:**
- Produces: `PERSONAS`, `type Persona = 'straight' | 'sharp' | 'sly' | 'wild'`, `SeatInfo.persona: Persona`, `SeatInfo.personaHidden: boolean`, `type ViewSeat = Omit<SeatInfo, 'persona'> & { persona: Persona | null }`, `View.seats: ViewSeat[]`, action `{ type: 'addAi'; seat: Seat; persona?: Persona | 'surprise' }`. All exported from `src/engine` (types.ts is re-exported with `*`).

- [ ] **Step 1: Write the failing tests**

Add to `src/engine/lobby.test.ts` (extend the imports: `PERSONAS` and `type RoundSummary` from `./types`):

```ts
describe('computer personas', () => {
  const hosted = () => run(createGame(), null, { type: 'sit', seat: 0, name: 'Host' })

  test('a computer is Straight unless the host picks another persona', () => {
    let game = run(hosted(), 0, { type: 'addAi', seat: 1 })
    game = run(game, 0, { type: 'addAi', seat: 2, persona: 'sly' })
    expect(game.seats[1]).toMatchObject({ kind: 'ai', persona: 'straight', personaHidden: false })
    expect(game.seats[2]).toMatchObject({ kind: 'ai', persona: 'sly', personaHidden: false })
    expect(game.seats[0]).toMatchObject({ kind: 'human', persona: 'straight', personaHidden: false })
    expect(viewFor(game, 0).seats[2].persona).toBe('sly')
  })

  test('a surprise persona is drawn at random and hidden from every view until the game is over', () => {
    const game = run(hosted(), 0, { type: 'addAi', seat: 1, persona: 'surprise' })
    expect(PERSONAS).toContain(game.seats[1].persona)
    expect(game.seats[1].personaHidden).toBe(true)
    for (const seat of [0, 1, null]) expect(viewFor(game, seat).seats[1].persona).toBeNull()
    const over: Game = { ...game, phase: { kind: 'gameOver', winner: 0, summary: {} as RoundSummary } }
    expect(viewFor(over, 0).seats[1].persona).toBe(game.seats[1].persona)
  })
})
```

Add to `src/engine/schema.test.ts`, inside the `describe`:

```ts
  test('a computer may be added with a persona, a surprise, or neither', () => {
    expect(actionSchema.safeParse({ type: 'addAi', seat: 1 }).success).toBe(true)
    expect(actionSchema.safeParse({ type: 'addAi', seat: 1, persona: 'wild' }).success).toBe(true)
    expect(actionSchema.safeParse({ type: 'addAi', seat: 1, persona: 'surprise' }).success).toBe(true)
    expect(actionSchema.safeParse({ type: 'addAi', seat: 1, persona: 'evil' }).success).toBe(false)
  })
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `./node_modules/.bin/vitest run src/engine/lobby.test.ts src/engine/schema.test.ts`
Expected: FAIL (`persona` is undefined; `PERSONAS` is not exported; the `evil` case parses).

- [ ] **Step 3: Implement**

In `src/engine/types.ts`, replace the `SeatInfo` block with:

```ts
/** How a computer player behaves about cheating and challenging. */
export const PERSONAS = ['straight', 'sharp', 'sly', 'wild'] as const
export type Persona = (typeof PERSONAS)[number]

export interface SeatInfo {
  name: string
  kind: 'empty' | 'human' | 'ai'
  connected: boolean
  /** A human seat temporarily played by the AI. */
  standIn: boolean
  /** Only matters for computer seats; human and empty seats carry 'straight'. */
  persona: Persona
  /** Chosen by "Surprise me": kept out of views until the game is over. */
  personaHidden: boolean
}

/** A seat as a view shows it: a hidden persona is null. */
export type ViewSeat = Omit<SeatInfo, 'persona'> & { persona: Persona | null }
```

Change the `addAi` member of `Action` to:

```ts
  | { type: 'addAi'; seat: Seat; persona?: Persona | 'surprise' }
```

Change `View.seats` to `seats: ViewSeat[]`.

In `src/engine/lobby.ts`:

```ts
import { type Seat, allSeats, seatsFrom } from './seats'
import { type Action, type Actor, type Ctx, type Game, type GameEvent, PERSONAS, type RejectReason, type SeatInfo } from './types'

export const EMPTY_SEAT: SeatInfo = { name: '', kind: 'empty', connected: false, standIn: false, persona: 'straight', personaHidden: false }
```

Change the signature to `export function lobbyAction(game: Game, actor: Actor, action: LobbyAction, ctx: Ctx, events: GameEvent[]): RejectReason | null`. In the `sit` branch:

```ts
    game.seats[action.seat] = { ...EMPTY_SEAT, name, kind: 'human', connected: true }
```

Replace the `addAi` case:

```ts
    case 'addAi': {
      if (!validSeat(action.seat)) return 'badSeat'
      if (game.seats[action.seat].kind !== 'empty') return 'seatTaken'
      const used = new Set(game.seats.map((s) => s.name))
      const name = AI_NAMES.find((n) => !used.has(n)) ?? `Bot ${action.seat + 1}`
      const surprise = action.persona === 'surprise'
      const persona = action.persona === 'surprise' ? PERSONAS[Math.floor(ctx.rng() * PERSONAS.length)] : (action.persona ?? 'straight')
      game.seats[action.seat] = { name, kind: 'ai', connected: true, standIn: false, persona, personaHidden: surprise }
      break
    }
```

In `src/engine/apply.ts` `dispatch`, change the call to `lobbyAction(game, actor, action, ctx, events)`.

In `src/engine/view.ts` `viewFor`, replace `seats: game.seats,` with:

```ts
    seats: game.seats.map((s) => (s.personaHidden && game.phase.kind !== 'gameOver' ? { ...s, persona: null } : s)),
```

In `src/engine/schema.ts`, import `PERSONAS` (`import { type Action, PERSONAS } from './types'`) and change the `addAi` line:

```ts
  z.object({ type: z.literal('addAi'), seat, persona: z.enum([...PERSONAS, 'surprise']).optional() }),
```

- [ ] **Step 4: Run the tests and the type check**

Run: `./node_modules/.bin/vitest run src/engine && ./node_modules/.bin/tsc --noEmit`
Expected: PASS, no type errors. If `tsc` reports `SeatInfo` literals missing `persona` elsewhere, spread `EMPTY_SEAT` into them as in `sit`.

- [ ] **Step 5: Commit**

```bash
git add src/engine
git commit -m "Give computer seats a persona, hidden from views when it is a surprise"
```

---

### Task 2: Round salt, Jodhi claim timing and save upgrade

**Files:**
- Modify: `src/engine/types.ts` (FORMAT_VERSION, Game.aiSalt, JodhiClaim.trick, ViewJodhi.trick)
- Modify: `src/engine/apply.ts:11-27` (createGame)
- Modify: `src/engine/round.ts:36-51` (beginRound), `:263-274` (claimJodhi)
- Modify: `src/engine/view.ts` (jodhiClaims map)
- Create: `src/engine/format.ts`
- Modify: `src/engine/index.ts`
- Modify: `src/ai/simulation.test.ts:31` (secret list)
- Modify: `AGENTS.md` ("Views hide information" line)
- Test: `src/engine/format.test.ts`

**Interfaces:**
- Consumes: `SeatInfo.persona`, `SeatInfo.personaHidden` (Task 1).
- Produces: `Game.aiSalt: number`, `JodhiClaim.trick: number` and `ViewJodhi.trick: number` (tricks completed when the claim was made), `FORMAT_VERSION = 2`, `upgradeGame(stored: unknown, salt: number): Game | null` exported from `src/engine`.

- [ ] **Step 1: Write the failing tests**

Create `src/engine/format.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { upgradeGame } from './format'
import { checkInvariants } from './invariants'
import { Table } from './testing'
import { FORMAT_VERSION } from './types'
import { viewFor } from './view'

// Dealer 0: seat 1 is trumper (spades), seat 2 leads. Teams: 0+2 count, 1+3 trump.
const D1 = ['Jh 9h Ks Qs 10c Qd', 'Js 9s As 10s Kd Qc', 'Jc 9c Ac Kc Ah 10h', 'Jd 9d Ad 10d Kh Qh']

/** Seat 1 trumps the first trick and then claims a diamond Jodhi it cannot have. */
const claimed = () => {
  const t = new Table(4, { redealIfNoTrumps: false }).deal(D1).toPlay('spades').play('Ah Qh 9h 10s')
  return t.do(1, { type: 'claimJodhi', suit: 'diamonds', withJack: false })
}

describe('saved state for computer players', () => {
  test('every deal draws a salt that no view carries', () => {
    const a = new Table(4, {}, 1).do(0, { type: 'start' }).game
    const b = new Table(4, {}, 2).do(0, { type: 'start' }).game
    expect(Number.isInteger(a.aiSalt)).toBe(true)
    expect(a.aiSalt).not.toBe(b.aiSalt)
    for (const seat of [0, 1, null]) expect(JSON.stringify(viewFor(a, seat))).not.toContain('aiSalt')
  })

  test('a Jodhi claim records how many tricks had been played, and views show it', () => {
    const t = claimed()
    const phase = viewFor(t.game, 0).phase
    if (phase.kind !== 'trickPause') throw new Error(phase.kind)
    expect(phase.jodhiClaims[0]).toMatchObject({ seat: 1, suit: 'diamonds', trick: 1 })
  })

  test('a format 1 save mid-round is upgraded; anything older is refused; current saves pass through', () => {
    const t = claimed()
    const old: any = structuredClone(t.game) // a save written before the fields existed
    old.formatVersion = 1
    delete old.aiSalt
    for (const seat of old.seats) {
      delete seat.persona
      delete seat.personaHidden
    }
    for (const claim of old.phase.play.jodhiClaims) delete claim.trick

    const game = upgradeGame(old, 77)!
    expect(game.formatVersion).toBe(FORMAT_VERSION)
    expect(game.aiSalt).toBe(77)
    expect(game.seats.every((s) => s.persona === 'straight' && !s.personaHidden)).toBe(true)
    if (game.phase.kind !== 'trickPause') throw new Error(game.phase.kind)
    expect(game.phase.play.jodhiClaims[0].trick).toBe(1)
    expect(() => checkInvariants(game)).not.toThrow()

    expect(upgradeGame({ ...old, formatVersion: 0 }, 1)).toBeNull()
    expect(upgradeGame(null, 1)).toBeNull()
    expect(upgradeGame(t.game, 5)).toEqual(t.game)
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `./node_modules/.bin/vitest run src/engine/format.test.ts`
Expected: FAIL (cannot resolve `./format`).

- [ ] **Step 3: Implement**

In `src/engine/types.ts`: set `export const FORMAT_VERSION = 2`. Add to `Game`, after `aiActAt`:

```ts
  /** Hidden: seeds the computer players' chance rolls for this round. Never in a view. */
  aiSalt: number
```

Add to `JodhiClaim` and to `ViewJodhi`:

```ts
  /** Tricks completed when the claim was made. */
  trick: number
```

In `src/engine/apply.ts` `createGame`, add `aiSalt: 0,` after `aiActAt: null,`.

In `src/engine/round.ts` `beginRound`, after `dealTo(hands, stock, 4, game)`:

```ts
  game.aiSalt = Math.floor(ctx.rng() * 2 ** 32)
```

In `claimJodhi`, add `trick: play.tricks.length,` to the pushed claim.

In `src/engine/view.ts`, change the `jodhiClaims` line to:

```ts
    jodhiClaims: play.jodhiClaims.map((j) => ({ seat: j.seat, suit: j.suit, withJack: j.withJack, points: j.points, trick: j.trick })),
```

Create `src/engine/format.ts`:

```ts
/** Loading saved games written by older versions. */
import { FORMAT_VERSION, type Game } from './types'

/**
 * Brings a stored game up to the current format, or returns null if it is
 * too old to use. `salt` replaces the round salt older saves did not have.
 */
export function upgradeGame(stored: unknown, salt: number): Game | null {
  if (stored === null || typeof stored !== 'object') return null
  const game = structuredClone(stored) as Game
  if (game.formatVersion === FORMAT_VERSION) return game
  if (game.formatVersion !== 1) return null
  for (const seat of game.seats) {
    seat.persona ??= 'straight'
    seat.personaHidden ??= false
  }
  game.aiSalt = salt
  const phase = game.phase
  if (phase.kind === 'playing' || phase.kind === 'trickPause') {
    for (const claim of phase.play.jodhiClaims) claim.trick ??= phase.play.tricks.length
  }
  game.formatVersion = FORMAT_VERSION
  return game
}
```

In `src/engine/index.ts`, add `export { upgradeGame } from './format'`.

In `src/ai/simulation.test.ts`, add `'"aiSalt":'` to the list of secrets in `expectNoLeak`.

In `AGENTS.md`, change the "Views hide information" rule's list to: "Other hands, the stock, `handBefore`, `legal`, Jodhi `valid`, tokens, `aiSalt`, a hidden persona before game over, and unrevealed trump must not appear in a view; the simulation test checks this."

- [ ] **Step 4: Run all tests and the type check**

Run: `./node_modules/.bin/vitest run && ./node_modules/.bin/tsc --noEmit`
Expected: PASS. The extra `rng` draw in `beginRound` changes later shuffles in seeded games; tests that pin specific seeded hands should not exist (scenario tests use `Table.deal`). If one fails only because of a different shuffle, report it before changing it.

- [ ] **Step 5: Commit**

```bash
git add src/engine src/ai/simulation.test.ts AGENTS.md
git commit -m "Add a hidden per-round salt for computer players and record when Jodhis are claimed"
```

---

### Task 3: AI minds, chance rolls and round history

**Files:**
- Create: `src/ai/mind.ts`
- Create: `src/ai/read.ts`
- Modify: `src/ai/choose.ts` (use `wouldWin` from `read.ts`; delete the local one)
- Test: `src/ai/mind.test.ts`

**Interfaces:**
- Consumes: `Persona`, `Game.aiSalt`, `SeatInfo.standIn` (Tasks 1–2).
- Produces:
  - `interface Mind { persona: Persona; salt: number }`, `HONEST: Mind`
  - `interface Traits { attention: number; cheats: 'never' | 'careful' | 'reckless'; hunchAt: number | null; hunchChance: number; moody: boolean }`, `TRAITS: Record<Persona, Traits>`
  - `mindFor(game: Game, seat: Seat): Mind`
  - `roll(salt: number, observer: Seat, id: string): number` in [0, 1)
  - `interface TrickRecord { index: number; half: 1 | 2; plays: ViewPlay[]; winner: Seat | null }`
  - `history(phase: ViewPlaying): TrickRecord[]` (current trick last, `winner: null`; tricks with no visible plays skipped)
  - `wouldWin(phase: ViewPlaying, me: Seat, card: Card): boolean`
  - `mood(view: View): number` in [1, 2]

- [ ] **Step 1: Write the failing tests**

Create `src/ai/mind.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { viewFor } from '../engine'
import { Table } from '../engine/testing'
import { mindFor, roll } from './mind'
import { history, mood } from './read'

const D1 = ['Jh 9h Ks Qs 10c Qd', 'Js 9s As 10s Kd Qc', 'Jc 9c Ac Kc Ah 10h', 'Jd 9d Ad 10d Kh Qh']
const start = () => new Table(4, { redealIfNoTrumps: false }).deal(D1).toPlay('spades')

describe('minds', () => {
  test('a roll is repeatable, evenly spread, and differs by salt, observer and question', () => {
    expect(roll(5, 1, 'x')).toBe(roll(5, 1, 'x'))
    const values = Array.from({ length: 4000 }, (_, i) => roll(i, 2, 'renege:1:0:3'))
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    const mean = values.reduce((a, b) => a + b) / values.length
    expect(mean).toBeGreaterThan(0.47)
    expect(mean).toBeLessThan(0.53)
    expect(values.filter((v) => v < 0.25).length / values.length).toBeCloseTo(0.25, 1)
    expect(new Set([roll(1, 0, 'a'), roll(2, 0, 'a'), roll(1, 1, 'a'), roll(1, 0, 'b')]).size).toBe(4)
  })

  test('a seat plays with its own persona and the round salt; a stand-in always plays straight', () => {
    const t = start()
    const game = { ...t.game, seats: t.game.seats.map((s) => ({ ...s, persona: 'wild' as const })) }
    expect(mindFor(game, 1)).toEqual({ persona: 'wild', salt: game.aiSalt })
    game.seats[1] = { ...game.seats[1], standIn: true }
    expect(mindFor(game, 1)).toEqual({ persona: 'straight', salt: game.aiSalt })
  })

  test('history lists the tricks with the current one last, and skips tricks a table view has turned down', () => {
    const t = start().play('Ah Qh 9h 10s').endPause().play('Js 9c')
    const full = viewFor(t.game, 0, 'full').phase
    if (full.kind !== 'playing') throw new Error(full.kind)
    expect(history(full).map((r) => [r.index, r.winner, r.plays.length])).toEqual([[0, 1, 4], [1, null, 2]])

    t.play('Kh Qs').endPause().play('As Jc Ad Ks').endPause()
    const table = viewFor(t.game, 0).phase
    if (table.kind !== 'playing') throw new Error(table.kind)
    expect(history(table).map((r) => r.index)).toEqual([2])
  })

  test('mood rises when the team is behind in balls or in points this round', () => {
    const t = start().play('Ah Qh 9h 10s') // seat 1's team takes 43 points
    expect(mood(viewFor(t.game, 1, 'full'))).toBe(1)
    expect(mood(viewFor(t.game, 0, 'full'))).toBe(1.5)
    t.game = { ...t.game, balls: [0, 3] }
    expect(mood(viewFor(t.game, 0, 'full'))).toBe(2)
  })
})
```

The history test's second trick: seat 1 leads Js, seat 2 (void spades) plays 9c, seat 3 Kh, seat 0 Qs (follows). Seat 1 wins and leads As; seat 2 Jc, seat 3 Ad, seat 0 Ks. All of these are legal.

- [ ] **Step 2: Run the tests to see them fail**

Run: `./node_modules/.bin/vitest run src/ai/mind.test.ts`
Expected: FAIL (cannot resolve `./mind`).

- [ ] **Step 3: Implement**

Create `src/ai/mind.ts`:

```ts
/** What a computer player brings to a decision besides its view: a persona and the round's salt. */
import type { Game, Persona, Seat } from '../engine'

export interface Mind {
  persona: Persona
  /** The round's hidden salt; makes every chance roll repeatable without remembering it. */
  salt: number
}

/** For seats that must play it straight: humans driven by scripts, and tests. */
export const HONEST: Mind = { persona: 'straight', salt: 0 }

export interface Traits {
  /** How likely a proof is noticed, before memory and salience. */
  attention: number
  cheats: 'never' | 'careful' | 'reckless'
  /** Suspicion signals against one seat before a hunch can fire; null for never. */
  hunchAt: number | null
  /** Chance a hunch fires on each new signal once past `hunchAt`. */
  hunchChance: number
  /** Whether being behind makes it bolder. */
  moody: boolean
}

export const TRAITS: Record<Persona, Traits> = {
  straight: { attention: 0.6, cheats: 'never', hunchAt: null, hunchChance: 0, moody: false },
  sharp: { attention: 0.95, cheats: 'never', hunchAt: 3, hunchChance: 0.3, moody: false },
  sly: { attention: 0.6, cheats: 'careful', hunchAt: null, hunchChance: 0, moody: false },
  wild: { attention: 0.35, cheats: 'reckless', hunchAt: 1, hunchChance: 0.12, moody: true },
}

/** The mind an AI-controlled seat plays with. A stand-in for a human never cheats. */
export function mindFor(game: Game, seat: Seat): Mind {
  const info = game.seats[seat]
  return { persona: info.standIn ? 'straight' : info.persona, salt: game.aiSalt }
}

/** A repeatable chance in [0, 1) for one observer and one question (FNV-1a, then a final mix). */
export function roll(salt: number, observer: Seat, id: string): number {
  let h = (2166136261 ^ salt) >>> 0
  for (const ch of `${observer}|${id}`) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619) >>> 0
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35) >>> 0
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}
```

Create `src/ai/read.ts`:

```ts
/** Reading the round from a seat's view. Computer players get the `full` view. */
import { type Card, type Seat, type View, type ViewPlay, type ViewPlaying, pointsOf, teamOf, trickWinner } from '../engine'

export interface TrickRecord {
  index: number
  half: 1 | 2
  plays: ViewPlay[]
  /** Null for the trick still being played. */
  winner: Seat | null
}

/** Every trick of the round whose cards are visible, the current one last. */
export function history(phase: ViewPlaying): TrickRecord[] {
  const done = phase.tricks.map((t, index) => ({ index, half: t.half, plays: t.plays, winner: t.winner as Seat | null }))
  const current = { index: phase.tricks.length, half: phase.half, plays: phase.current, winner: null }
  return [...done, current].filter((t) => t.plays.length > 0)
}

export function wouldWin(phase: ViewPlaying, me: Seat, card: Card): boolean {
  return trickWinner([...phase.current, { seat: me, card }], phase.trump) === me
}

/** 1, plus a half each for being behind in balls and behind in card points this round. */
export function mood(view: View): number {
  const me = view.seat
  if (me === null) return 1
  const team = teamOf(me)
  let m = view.balls[team] < view.balls[1 - team] ? 1.5 : 1
  const phase = view.phase
  if (phase.kind === 'playing' || phase.kind === 'trickPause') {
    const points = [0, 0]
    for (const t of phase.tricks) points[teamOf(t.winner)] += pointsOf(t.plays.map((p) => p.card))
    if (points[team] < points[1 - team]) m += 0.5
  }
  return m
}
```

In `src/ai/choose.ts`, delete the local `wouldWin` function and add `import { wouldWin } from './read'`. Keep `trickWinner` in the engine import: `chooseCard` still uses it.

- [ ] **Step 4: Run the tests and the type check**

Run: `./node_modules/.bin/vitest run src/ai && ./node_modules/.bin/tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai
git commit -m "Add computer minds, repeatable chance rolls and round history helpers"
```

---

### Task 4: Proofs and proof challenges

**Files:**
- Create: `src/ai/suspicion.ts`
- Test: `src/ai/suspicion.test.ts`

**Interfaces:**
- Consumes: `history`, `TrickRecord` (`read.ts`), `Mind`, `TRAITS`, `roll` (`mind.ts`), `ViewJodhi.trick` (Task 2).
- Produces:
  - `interface Proof { id: string; accused: Seat; claim: number | null; gap: number; salience: number }`
  - `findProofs(view: View): Proof[]`
  - `noticeOdds(attention: number, gap: number, salience: number): number`
  - `chooseChallenge(view: View, mind: Mind): Action | null` (proofs only in this task; Task 5 adds hunches)

- [ ] **Step 1: Write the failing tests**

Create `src/ai/suspicion.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { type Persona, viewFor } from '../engine'
import { Table } from '../engine/testing'
import { chooseChallenge, findProofs, noticeOdds } from './suspicion'

// Dealer 0: seat 1 is trumper (spades), seat 2 leads. Teams: 0+2 count, 1+3 trump.
// Seat 1 holds one club (Qc); seat 0 holds Qd.
const D1 = ['Jh 9h Ks Qs 10c Qd', 'Js 9s As 10s Kd Qc', 'Jc 9c Ac Kc Ah 10h', 'Jd 9d Ad 10d Kh Qh']
const start = (hands = D1, players: 2 | 4 = 4) => new Table(players, { redealIfNoTrumps: false }).deal(hands).toPlay('spades')

/** Seat 1 trumps a 45-point club trick it should have followed, then leads its club at once. */
const clumsy = () => start().play('Kc Qh 10c Js').endPause().play('Qc')
/** Seat 1 discards on a cheap club trick it loses, then holds its club until trick 6. */
const patient = () => start().play('Kc Qh 10c Kd  Qd 10s 10h Jd  As Ah Kh Qs  9s Ac 10d Ks  Js 9c Ad Jh  Qc')
/** Seat 1 trumps the first trick, then claims a diamond Jodhi; seat 0 holds the Qd. */
const falseJodhi = () => start().play('Ah Qh 9h 10s').do(1, { type: 'claimJodhi', suit: 'diamonds', withJack: false })

const rate = (t: Table, seat: number, persona: Persona, salts = 2000) => {
  let caught = 0
  for (let salt = 1; salt <= salts; salt++) if (chooseChallenge(viewFor(t.game, seat, 'full'), { persona, salt })) caught++
  return caught / salts
}

describe('proofs', () => {
  test('a renege shown up on the next trick, after winning a big trick the observer led, is certain to be noticed', () => {
    const view = viewFor(clumsy().game, 2, 'full')
    const proofs = findProofs(view)
    expect(proofs).toHaveLength(1)
    expect(proofs[0]).toMatchObject({ id: 'renege:1:0:1', accused: 1, claim: null, gap: 0 })
    expect(proofs[0].salience).toBeCloseTo(1.3 * 1.3 * 1.2)
    for (let salt = 1; salt <= 50; salt++) {
      expect(chooseChallenge(view, { persona: 'straight', salt })).toEqual({ type: 'challengePlay', seat: 1 })
    }
  })

  test('a renege held back until trick 6 is usually missed, even by Sharp', () => {
    const t = patient()
    const proofs = findProofs(viewFor(t.game, 2, 'full'))
    expect(proofs).toHaveLength(1)
    expect(proofs[0]).toMatchObject({ id: 'renege:1:0:5', accused: 1, gap: 4 })
    expect(proofs[0].salience).toBeCloseTo(1.2)
    expect(noticeOdds(0.95, 4, 1.2)).toBeCloseTo(0.285)
    const sharp = rate(t, 2, 'sharp')
    expect(sharp).toBeGreaterThan(0.24)
    expect(sharp).toBeLessThan(0.33)
    const straight = rate(t, 2, 'straight')
    expect(straight).toBeGreaterThan(0.14)
    expect(straight).toBeLessThan(0.22)
  })

  test('partners are never accused, and a fair round holds no proof', () => {
    expect(findProofs(viewFor(clumsy().game, 3, 'full'))).toEqual([])
    const fair = start().play('Jc Qh 10c Qc  9c Kh Qd 10s')
    for (const seat of [0, 1, 2, 3]) expect(findProofs(viewFor(fair.game, seat, 'full'))).toEqual([])
  })

  test('a Jodhi disproved by the observer’s own hand stands out; an observer without the card sees nothing', () => {
    const t = falseJodhi()
    const proofs = findProofs(viewFor(t.game, 0, 'full'))
    expect(proofs).toEqual([{ id: 'jodhi:0:Q-diamonds', accused: 1, claim: 0, gap: 0, salience: 1.5 }])
    expect(findProofs(viewFor(t.game, 2, 'full'))).toEqual([])
    for (let salt = 1; salt <= 50; salt++) {
      expect(chooseChallenge(viewFor(t.game, 0, 'full'), { persona: 'sharp', salt })).toEqual({ type: 'challengeJodhi', claim: 0 })
    }
    const straight = rate(t, 0, 'straight')
    expect(straight).toBeGreaterThan(0.85)
    expect(straight).toBeLessThan(0.95)
  })

  test('an undercut is proved when the player later shows a plain card, only under the undercut rule', () => {
    // Seat 2 leads a diamond; seat 0 trumps with Ks; seat 1 undercuts with Qs while holding clubs,
    // then follows seat 0's heart lead with Jc.
    const UNDERCUT = ['Ks Jh 9h Ah 10h Kh', 'Qs Js Jc 9c Ac 10s', 'Jd 9d Ad 10d Kd Qd', 'Qh Kc Qc 10c 9s As']
    const moves = (t: Table) => t.deal(UNDERCUT).toPlay('spades').play('Jd Qh Ks Qs').endPause().play('Jh Jc')
    const proofs = findProofs(viewFor(moves(new Table(4, { redealIfNoTrumps: false })).game, 2, 'full'))
    expect(proofs).toHaveLength(1)
    expect(proofs[0]).toMatchObject({ id: 'undercut:1:0:1', accused: 1, gap: 0 })
    expect(proofs[0].salience).toBeCloseTo(1.3 * 1.2 * 1.2)
    const free = moves(new Table(4, { redealIfNoTrumps: false, undercutRestriction: false }))
    expect(findProofs(viewFor(free.game, 2, 'full'))).toEqual([])
  })

  test('a void shown in one half proves nothing about a card played in the next', () => {
    const view = viewFor(clumsy().game, 2, 'full')
    const phase = view.phase
    if (phase.kind !== 'playing') throw new Error(phase.kind)
    // The same cards, but the reveal now falls in a later half with a fresh hand
    // (history() labels the current trick with phase.half; the cheat trick keeps half 1).
    expect(findProofs({ ...view, phase: { ...phase, half: 2 } })).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `./node_modules/.bin/vitest run src/ai/suspicion.test.ts`
Expected: FAIL (cannot resolve `./suspicion`).

- [ ] **Step 3: Implement**

Create `src/ai/suspicion.ts`:

```ts
/** What a computer player can prove about its opponents' play, from its own full view. */
import {
  type Action,
  type Card,
  type Seat,
  type View,
  type ViewPlaying,
  availableActions,
  cardId,
  pointsOf,
  rankStrength,
  sameCard,
  teamOf,
} from '../engine'
import { type Mind, TRAITS, roll } from './mind'
import { type TrickRecord, history } from './read'

/** A certain sign of cheating: a renege or undercut shown up by a later card, or an impossible Jodhi. */
export interface Proof {
  id: string
  accused: Seat
  /** The Jodhi claim it disproves, or null for a play. */
  claim: number | null
  /** Tricks between the cheat and the moment it was shown up. */
  gap: number
  /** How much the moment stands out; multiplies the chance of noticing. */
  salience: number
}

interface Reveal {
  trick: TrickRecord
  card: Card
}

export const inPlay = (view: View): ViewPlaying | null =>
  view.phase.kind === 'playing' || view.phase.kind === 'trickPause' ? view.phase : null

/** The chance of noticing: attention, fading with the tricks in between, raised by salience. */
export function noticeOdds(attention: number, gap: number, salience: number): number {
  return Math.min(1, attention * 0.5 ** (gap / 2) * salience)
}

export function findProofs(view: View): Proof[] {
  const phase = inPlay(view)
  const me = view.seat
  if (phase === null || me === null) return []
  const opponent = (s: Seat) => teamOf(s) !== teamOf(me)
  const tricks = history(phase)
  const out: Proof[] = []

  for (const t of tricks) {
    const led = t.plays[0].card.suit
    t.plays.forEach((p, i) => {
      if (i === 0 || !opponent(p.seat) || p.card.suit === led) return
      // A void shown in `led`: any later card of that suit this half proves a renege.
      for (const r of laterPlays(tricks, t, p.seat, (c) => c.suit === led)) {
        out.push(playProof(`renege:${p.seat}:${t.index}:${r.trick.index}`, p.seat, t, r, me))
      }
      const trump = phase.trump
      if (!view.rules.undercutRestriction || trump === null || led === trump || p.card.suit !== trump) return
      const topTrump = Math.max(0, ...t.plays.slice(0, i).filter((q) => q.card.suit === trump).map((q) => rankStrength(q.card.rank)))
      if (topTrump <= rankStrength(p.card.rank)) return
      // An undercut is only allowed with nothing but trumps: a later plain card proves otherwise.
      for (const r of laterPlays(tricks, t, p.seat, (c) => c.suit !== trump)) {
        out.push(playProof(`undercut:${p.seat}:${t.index}:${r.trick.index}`, p.seat, t, r, me))
      }
    })
  }

  phase.jodhiClaims.forEach((claim, index) => {
    if (!opponent(claim.seat)) return
    const ranks: Card['rank'][] = claim.withJack ? ['K', 'Q', 'J'] : ['K', 'Q']
    for (const rank of ranks) {
      const card: Card = { suit: claim.suit, rank }
      const id = `jodhi:${index}:${cardId(card)}`
      if (phase.hand.some((c) => sameCard(c, card))) {
        out.push({ id, accused: claim.seat, claim: index, gap: 0, salience: 1.5 })
        continue
      }
      const elsewhere = (t: TrickRecord) =>
        t.plays.some((p) => sameCard(p.card, card) && (p.seat !== claim.seat || (view.rules.jodhiCards === 'inHand' && t.index < claim.trick)))
      const shown = tricks.find(elsewhere)
      if (shown) out.push({ id, accused: claim.seat, claim: index, gap: Math.max(0, shown.index - claim.trick), salience: 1 })
    }
  })
  return out
}

function laterPlays(tricks: TrickRecord[], after: TrickRecord, seat: Seat, matches: (c: Card) => boolean): Reveal[] {
  return tricks
    .filter((t) => t.index > after.index && t.half === after.half)
    .flatMap((t) => t.plays.filter((p) => p.seat === seat && matches(p.card)).map((p) => ({ trick: t, card: p.card })))
}

function playProof(id: string, accused: Seat, cheat: TrickRecord, reveal: Reveal, me: Seat): Proof {
  let salience = 1
  if (cheat.winner === accused) salience *= 1.3
  if (cheat.winner !== null && pointsOf(cheat.plays.map((p) => p.card)) >= 30) salience *= 1.3
  if (reveal.card.rank === 'J' || reveal.card.rank === '9') salience *= 1.2
  if (teamOf(cheat.plays[0].seat) === teamOf(me)) salience *= 1.2
  return { id, accused, claim: null, gap: reveal.trick.index - cheat.index - 1, salience }
}

/**
 * The challenge this computer makes now, if any. Each proof gets one look:
 * the roll for it never changes, so a proof missed once stays missed.
 */
export function chooseChallenge(view: View, mind: Mind): Action | null {
  const me = view.seat
  if (me === null || inPlay(view) === null) return null
  const can = availableActions(view)
  const accuse = (accused: Seat, claim: number | null): Action | null => {
    if (claim !== null) return can.challengeJodhi.includes(claim) ? { type: 'challengeJodhi', claim } : null
    return can.challengePlay.includes(accused) ? { type: 'challengePlay', seat: accused } : null
  }
  const { attention } = TRAITS[mind.persona]
  for (const proof of findProofs(view)) {
    if (roll(mind.salt, me, proof.id) >= noticeOdds(attention, proof.gap, proof.salience)) continue
    const action = accuse(proof.accused, proof.claim)
    if (action) return action
  }
  return null
}
```

- [ ] **Step 4: Run the tests**

Run: `./node_modules/.bin/vitest run src/ai/suspicion.test.ts && ./node_modules/.bin/tsc --noEmit`
Expected: PASS. If a rate bound fails narrowly, check `roll` first: the bounds sit about four standard deviations wide for 2000 salts.

- [ ] **Step 5: Commit**

```bash
git add src/ai/suspicion.ts src/ai/suspicion.test.ts
git commit -m "Let computers prove reneges, undercuts and false Jodhis, with one look each"
```

---

### Task 5: Hunches

**Files:**
- Modify: `src/ai/suspicion.ts`
- Test: `src/ai/suspicion.test.ts`

**Interfaces:**
- Consumes: `TRAITS.hunchAt`, `TRAITS.hunchChance`, `TRAITS.moody`, `mood` (Task 3).
- Produces: `interface Signal { id: string; accused: Seat; claim: number | null; at: number }`, `findSignals(view: View): Signal[]`. `chooseChallenge` now falls back to a hunch when no proof is noticed.

- [ ] **Step 1: Write the failing tests**

Add to `src/ai/suspicion.test.ts` (import `findSignals`):

```ts
describe('hunches', () => {
  /** Seat 1 legally trumps a 43-point heart trick. */
  const trumped = () => start().play('Ah Qh 9h 10s')

  test('winning a big trick off-suit, a big Jodhi and an unlikely void are signals', () => {
    expect(findSignals(viewFor(trumped().game, 2, 'full'))).toEqual([{ id: 'cut:0', accused: 1, claim: null, at: 0 }])
    // Seat 2 cannot place four of the six diamonds when seat 1 shows a void in them.
    const t = patient()
    const ids = findSignals(viewFor(t.game, 2, 'full')).map((s) => s.id)
    expect(ids).toEqual(expect.arrayContaining(['cut:1', 'void:1:1']))
    expect(ids).not.toContain('void:0:1') // seat 2 can place five clubs by then
  })

  test('Wild sometimes accuses on one signal, more often when behind; Sharp and Straight do not', () => {
    const t = trumped()
    const wild = rate(t, 2, 'wild')
    // 0.12 chance × mood 1.5 (behind 0–43 on points) = 0.18
    expect(wild).toBeGreaterThan(0.14)
    expect(wild).toBeLessThan(0.22)
    expect(chooseChallengeFor(t, 2, 'wild')).toEqual({ type: 'challengePlay', seat: 1 })
    expect(rate(t, 2, 'sharp')).toBe(0)
    expect(rate(t, 2, 'straight')).toBe(0)
  })
})

/** The first challenge Wild makes across salts, for checking its shape. */
function chooseChallengeFor(t: Table, seat: number, persona: Persona) {
  for (let salt = 1; salt <= 2000; salt++) {
    const action = chooseChallenge(viewFor(t.game, seat, 'full'), { persona, salt })
    if (action) return action
  }
  return null
}
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `./node_modules/.bin/vitest run src/ai/suspicion.test.ts`
Expected: FAIL (`findSignals` is not exported).

- [ ] **Step 3: Implement**

Add to `src/ai/suspicion.ts` (import `type Suit` from the engine and `mood` from `./read`):

```ts
/** Something that looks like cheating but proves nothing. */
export interface Signal {
  id: string
  accused: Seat
  claim: number | null
  /** When it happened, in tricks; a claim sits between the tricks around it. */
  at: number
}

export function findSignals(view: View): Signal[] {
  const phase = inPlay(view)
  const me = view.seat
  if (phase === null || me === null) return []
  const opponent = (s: Seat) => teamOf(s) !== teamOf(me)
  const tricks = history(phase)
  const out: Signal[] = []
  for (const t of tricks) {
    const led = t.plays[0].card.suit
    t.plays.forEach((p, i) => {
      if (i === 0 || !opponent(p.seat) || p.card.suit === led) return
      if (t.winner === p.seat && pointsOf(t.plays.map((q) => q.card)) >= 30) out.push({ id: `cut:${t.index}`, accused: p.seat, claim: null, at: t.index })
      if (unplaced(phase, tricks, me, led, t.index) >= 4) out.push({ id: `void:${t.index}:${p.seat}`, accused: p.seat, claim: null, at: t.index })
    })
  }
  phase.jodhiClaims.forEach((c, index) => {
    if (opponent(c.seat) && c.points >= 40) out.push({ id: `claim:${index}`, accused: c.seat, claim: index, at: c.trick - 0.5 })
  })
  return out
}

/** Cards of `suit` the observer could not place by the end of trick `upTo`. */
function unplaced(phase: ViewPlaying, tricks: TrickRecord[], me: Seat, suit: Suit, upTo: number): number {
  const known = new Set<string>()
  for (const c of phase.hand) if (c.suit === suit) known.add(cardId(c))
  for (const t of tricks) {
    for (const p of t.plays) if (p.card.suit === suit && (p.seat === me || t.index <= upTo)) known.add(cardId(p.card))
  }
  return 6 - known.size
}

/** A hunch gets one look per new signal, once a seat has drawn enough of them. */
function hunch(view: View, mind: Mind, accuse: (accused: Seat, claim: number | null) => Action | null): Action | null {
  const traits = TRAITS[mind.persona]
  if (traits.hunchAt === null || view.seat === null) return null
  const chance = traits.hunchChance * (traits.moody ? mood(view) : 1)
  const bySeat = new Map<Seat, Signal[]>()
  for (const s of findSignals(view)) bySeat.set(s.accused, [...(bySeat.get(s.accused) ?? []), s])
  for (const [seat, signals] of bySeat) {
    if (signals.length < traits.hunchAt) continue
    const latest = signals.reduce((a, b) => (b.at > a.at ? b : a))
    if (roll(mind.salt, view.seat, `hunch:${latest.id}`) >= chance) continue
    const action = accuse(seat, latest.claim)
    if (action) return action
  }
  return null
}
```

At the end of `chooseChallenge`, replace `return null` with `return hunch(view, mind, accuse)`.

- [ ] **Step 4: Run the tests**

Run: `./node_modules/.bin/vitest run src/ai/suspicion.test.ts && ./node_modules/.bin/tsc --noEmit`
Expected: PASS, including the Task 4 tests. In `patient()`, Sharp sees two signals against seat 1 (`cut:1`, `void:1:1`), under its threshold of 3, so its proof rate is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/ai/suspicion.ts src/ai/suspicion.test.ts
git commit -m "Let Wild and Sharp challenge on a hunch from what they have seen"
```

---

### Task 6: Cheating, holding back, and false Jodhis

**Files:**
- Create: `src/ai/cheat.ts`
- Modify: `src/ai/choose.ts` (`chooseAction(view, mind)`, `chooseJodhi(view, mind)`)
- Modify: `party/server.ts:2,178,196` (pass `mindFor`)
- Modify: `party/server.test.ts:3,283,285`, `scripts/play.ts:8,81-84`, `src/ai/simulation.test.ts` (pass `HONEST`)
- Test: `src/ai/cheat.test.ts`

**Interfaces:**
- Consumes: `Mind`, `TRAITS`, `HONEST`, `mindFor`, `roll` (Task 3), `history`, `wouldWin`, `mood` (Task 3), `noticeOdds` (Task 4).
- Produces: `chooseCheat(view: View, phase: ViewPlaying, honest: Card, mind: Mind): Card | null`, `holdBack(view: View, phase: ViewPlaying, legal: readonly Card[]): readonly Card[]`, `chooseAction(view: View, mind: Mind): Action`, `chooseJodhi(view: View, mind: Mind): Action | null`.

- [ ] **Step 1: Write the failing tests**

Create `src/ai/cheat.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { type Persona, viewFor } from '../engine'
import { Table, card } from '../engine/testing'
import { chooseAction, chooseJodhi } from './choose'

// Dealer 0: seat 1 is trumper (spades), seat 2 leads. Teams: 0+2 count, 1+3 trump.
const D1 = ['Jh 9h Ks Qs 10c Qd', 'Js 9s As 10s Kd Qc', 'Jc 9c Ac Kc Ah 10h', 'Jd 9d Ad 10d Kh Qh']
// Seat 1 holds two hearts it would have to show soon after cheating on a heart trick.
const TWO_HEARTS = ['9h Jh 10c Ks Qs Qd', 'Js 10s Kh Qh 9d Kd', 'Ah Kc 9c Ac Jc 10d', '10h Jd Ad Qc 9s As']
const start = (hands = D1) => new Table(4, { redealIfNoTrumps: false }).deal(hands).toPlay('spades')
const playFor = (t: Table, seat: number, persona: Persona, salt = 1) => chooseAction(viewFor(t.game, seat, 'full'), { persona, salt })

describe('cheating', () => {
  test('Sly trumps a club trick it should follow when its one club can wait five tricks', () => {
    const t = start().play('Kc Qh 10c')
    expect(playFor(t, 1, 'sly')).toEqual({ type: 'playCard', card: card('10s') })
    for (const honest of ['straight', 'sharp'] as const) expect(playFor(t, 1, honest)).toEqual({ type: 'playCard', card: card('Qc') })
  })

  test('Sly passes up a cheat it would have to show soon; Wild takes it', () => {
    const t = start(TWO_HEARTS).play('Ah 10h 9h')
    expect(playFor(t, 1, 'sly')).toEqual({ type: 'playCard', card: card('Qh') })
    expect(playFor(t, 1, 'wild')).toEqual({ type: 'playCard', card: card('10s') })
    expect(playFor(t, 1, 'straight')).toEqual({ type: 'playCard', card: card('Qh') })
  })

  test('after a renege, Sly keeps the giveaway card back while it has anything else', () => {
    const t = start().play('Kc Qh 10c 10s').endPause()
    expect(playFor(t, 1, 'sly')).toEqual({ type: 'playCard', card: card('Kd') })
    expect(playFor(t, 1, 'straight')).toEqual({ type: 'playCard', card: card('Qc') })
  })
})

describe('false Jodhis', () => {
  // Seat 1 trumps the first trick; it holds Kd and Qc, and neither partner card has been seen.
  const won = () => start().play('Ah Qh 9h 10s')
  const bluffs = (t: Table, persona: Persona) => {
    let count = 0
    for (let salt = 1; salt <= 400; salt++) {
      const claim = chooseJodhi(viewFor(t.game, 1, 'full'), { persona, salt })
      if (claim) {
        expect(claim).toMatchObject({ type: 'claimJodhi', withJack: false })
        expect(['diamonds', 'clubs']).toContain((claim as { suit: string }).suit)
        count++
      }
    }
    return count / 400
  }

  test('Sly and Wild sometimes claim a Jodhi they half hold; honest personas never do', () => {
    for (const persona of ['sly', 'wild'] as const) {
      const r = bluffs(won(), persona)
      expect(r).toBeGreaterThan(0.6)
      expect(r).toBeLessThan(0.9)
    }
    expect(bluffs(won(), 'straight')).toBe(0)
    expect(bluffs(won(), 'sharp')).toBe(0)
  })

  test('Sly bluffs at most once a round', () => {
    const t = won()
    let salt = 1
    while (!chooseJodhi(viewFor(t.game, 1, 'full'), { persona: 'sly', salt })) salt++
    t.do(1, chooseJodhi(viewFor(t.game, 1, 'full'), { persona: 'sly', salt })!)
    for (let s = 1; s <= 100; s++) expect(chooseJodhi(viewFor(t.game, 1, 'full'), { persona: 'sly', salt: s })).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `./node_modules/.bin/vitest run src/ai/cheat.test.ts`
Expected: FAIL. Sly plays `Qc` in the first test because nothing cheats yet.

- [ ] **Step 3: Implement**

Create `src/ai/cheat.ts`:

```ts
/** When a computer persona breaks the rules, and how it covers its tracks. */
import { type Card, type Suit, type View, type ViewPlaying, pointsOf, rankStrength, teamOf, trickWinner } from '../engine'
import { type Mind, TRAITS } from './mind'
import { history, mood, wouldWin } from './read'
import { noticeOdds } from './suspicion'

/** The attention Sly assumes of whoever is watching. */
const ASSUMED_ATTENTION = 0.6

/**
 * A renege that wins a trick the honest card would lose, if this persona
 * would risk it. Only reneges: an illegal undercut is never chosen.
 */
export function chooseCheat(view: View, phase: ViewPlaying, honest: Card, mind: Mind): Card | null {
  const { cheats, moody } = TRAITS[mind.persona]
  const me = view.seat
  if (cheats === 'never' || me === null || phase.current.length === 0 || wouldWin(phase, me, honest)) return null
  if (teamOf(trickWinner(phase.current, phase.trump)) === teamOf(me)) return null
  const led = phase.current[0].card.suit
  if (!phase.hand.some((c) => c.suit === led)) return null
  const wins = phase.hand
    .filter((c) => c.suit !== led && wouldWin(phase, me, c))
    .sort((a, b) => rankStrength(a.rank) - rankStrength(b.rank))
  const prize = (c: Card) => pointsOf([...phase.current.map((p) => p.card), c])
  const done = phase.tricks.filter((t) => t.half === phase.half).length

  if (cheats === 'careful') {
    // Shown up when the first card of `led` must come out: after the other cards are gone.
    const held = phase.hand.filter((c) => c.suit === led).length
    const gap = Math.max(0, 5 - done - held)
    const theirLead = teamOf(phase.current[0].seat) !== teamOf(me)
    const risk = (c: Card) => noticeOdds(ASSUMED_ATTENTION, gap, 1.3 * (prize(c) >= 30 ? 1.3 : 1) * (theirLead ? 1.2 : 1))
    return wins.filter((c) => prize(c) >= 20 && risk(c) < 0.25).sort((a, b) => risk(a) - risk(b))[0] ?? null
  }

  const m = moody ? mood(view) : 1
  const flashy = phase.current.some((p) => p.card.rank === 'J' || p.card.rank === '9')
  return wins.find((c) => prize(c) >= 20 / m || flashy || done === 5) ?? null
}

/** Leaves out cards that would show up an earlier renege this half, while anything else may be played. */
export function holdBack(view: View, phase: ViewPlaying, legal: readonly Card[]): readonly Card[] {
  const me = view.seat
  const shownVoid = new Set<Suit>()
  for (const t of history(phase)) {
    if (t.half !== phase.half) continue
    const led = t.plays[0].card.suit
    t.plays.forEach((p, i) => i > 0 && p.seat === me && p.card.suit !== led && shownVoid.add(led))
  }
  const safe = legal.filter((c) => !shownVoid.has(c.suit))
  return safe.length > 0 ? safe : legal
}
```

In `src/ai/choose.ts`:

1. Add imports: `import { type Mind, TRAITS, roll } from './mind'`, `import { chooseCheat, holdBack } from './cheat'`, and `history` alongside `wouldWin` from `./read`.
2. Change the header comment to `/** AI players. They see only a seat's view; whether they cheat depends on their persona. */`.
3. Change `chooseAction`:

```ts
export function chooseAction(view: View, mind: Mind): Action {
```

and its `playing` case:

```ts
    case 'playing': {
      const careful = TRAITS[mind.persona].cheats === 'careful'
      const honest = chooseCard(view, phase, careful ? holdBack(view, phase, can.legal) : can.legal)
      const card = chooseCheat(view, phase, honest, mind) ?? honest
      return sureSpecialCall(view, phase, card) ?? { type: 'playCard', card }
    }
```

4. Replace `chooseJodhi`:

```ts
const BLUFF_CHANCE = 0.5

/** A Jodhi the seat may claim now: a real one, or for cheating personas sometimes a bluff. */
export function chooseJodhi(view: View, mind: Mind): Action | null {
  const phase = view.phase
  if (view.seat === null || (phase.kind !== 'playing' && phase.kind !== 'trickPause')) return null
  const me = view.seat
  const ownPlays = phase.tricks.filter((t) => t.half === phase.half).flatMap((t) => t.plays).filter((p) => p.seat === me)
  const cards = view.rules.jodhiCards === 'inHand' ? phase.hand : [...phase.hand, ...ownPlays.map((p) => p.card)]
  const open = availableActions(view).claimJodhi
  for (const suit of open) {
    if (holdsJodhi(cards, suit, false)) return { type: 'claimJodhi', suit, withJack: holdsJodhi(cards, suit, true) }
  }

  // A bluff needs one of the pair in hand and the other not yet seen.
  const { cheats } = TRAITS[mind.persona]
  if (cheats === 'never') return null
  if (cheats === 'careful' && phase.jodhiClaims.some((j) => j.seat === me)) return null
  const played = history(phase).flatMap((t) => t.plays.map((p) => p.card))
  for (const suit of open) {
    const pair = (c: Card) => c.suit === suit && (c.rank === 'K' || c.rank === 'Q')
    if (phase.hand.filter(pair).length !== 1 || played.some(pair)) continue
    if (roll(mind.salt, me, `bluff:${phase.tricks.length}:${suit}`) < BLUFF_CHANCE) return { type: 'claimJodhi', suit, withJack: false }
  }
  return null
}
```

Update callers:

- `party/server.ts`: import `mindFor` from `../src/ai/mind`. In `drive`: `chooseAction(view, mindFor(game, seat))`. In `aiJodhi`: `chooseJodhi(viewFor(this.saved.game, seat, 'full'), mindFor(this.saved.game, seat))`.
- `party/server.test.ts`, `scripts/play.ts`: import `HONEST` from `../src/ai/mind` and pass it as the second argument to every `chooseAction` and `chooseJodhi` call.
- `src/ai/simulation.test.ts`: import `HONEST` from `./mind` and pass it to every `chooseAction` and `chooseJodhi` call.

- [ ] **Step 4: Run all tests and the type check**

Run: `./node_modules/.bin/vitest run && ./node_modules/.bin/tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai party scripts
git commit -m "Let Sly and Wild renege and bluff Jodhis, each in its own style"
```

---

### Task 7: Persona simulation

**Files:**
- Create: `src/ai/personas.test.ts`
- Modify: `src/ai/simulation.test.ts` (honest-AI test)

**Interfaces:**
- Consumes: `chooseAction`, `chooseJodhi` (Task 6), `chooseChallenge` (Tasks 4–5), `Mind`.

- [ ] **Step 1: Write the tests**

Replace the honest-AI test at the end of `src/ai/simulation.test.ts` with:

```ts
  test('Straight and Sharp on their own never cheat, never bluff, and Straight never sees a proof that is not there', () => {
    const personas = ['straight', 'sharp', 'straight', 'sharp'] as const
    for (let seed = 1; seed <= 20; seed++) {
      const t = new Table(4, {}, seed).do(0, { type: 'start' })
      const mind = (seat: number) => ({ persona: personas[seat], salt: t.game.aiSalt })
      for (let guard = 0; guard < 5000 && t.game.phase.kind !== 'gameOver'; guard++) {
        const phase = t.game.phase
        if (phase.kind === 'roundResult') t.do(0, { type: 'nextRound' })
        else if (seatsToAct(t.game).length === 0) {
          for (let seat = 0; seat < 4; seat++) {
            const claim = chooseJodhi(viewFor(t.game, seat, 'full'), mind(seat))
            if (claim) t.do(seat, claim)
          }
          t.now = nextDeadline(t.game)!
          t.do('system', { type: 'tick' })
        } else {
          const seat = seatsToAct(t.game)[0]
          t.do(seat, chooseAction(viewFor(t.game, seat, 'full'), mind(seat)))
        }
        const p = t.game.phase
        if (p.kind === 'playing' || p.kind === 'trickPause') {
          expect(p.play.current.every((r) => r.legal)).toBe(true)
          expect(p.play.jodhiClaims.every((j) => j.valid)).toBe(true)
          for (const seat of [0, 2]) expect(chooseChallenge(viewFor(t.game, seat, 'full'), mind(seat))).toBeNull()
        }
      }
      expect(t.game.phase.kind).toBe('gameOver')
    }
  })
```

Import `chooseChallenge` from `./suspicion` there.

Create `src/ai/personas.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { type Action, type Game, type Persona, availableActions, checkInvariants, hasCard, nextDeadline, seatsToAct, viewFor } from '../engine'
import { Table } from '../engine/testing'
import { chooseAction, chooseJodhi } from './choose'
import type { Mind } from './mind'
import { chooseChallenge } from './suspicion'

const GAMES = Number(process.env.SIM_GAMES ?? 30)

interface Tally {
  illegal: number
  bluffs: number
}

/** A whole game in which every seat is a computer with the given persona, all watching each other. */
function playGame(personas: Persona[], seed: number) {
  const t = new Table(personas.length as 2 | 4, { ballsToWin: 6 }, seed).do(0, { type: 'start' })
  const tally = new Map<Persona, Tally>(personas.map((p) => [p, { illegal: 0, bluffs: 0 }]))
  const mind = (seat: number): Mind => ({ persona: personas[seat], salt: t.game.aiSalt })
  const inPlay = () => t.game.phase.kind === 'playing' || t.game.phase.kind === 'trickPause'

  const act = (seat: number, action: Action) => {
    if (action.type === 'playCard' && !hasCard(availableActions(viewFor(t.game, seat)).legal, action.card)) {
      tally.get(personas[seat])!.illegal++
    }
    t.do(seat, action)
    checkInvariants(t.game)
    expect(JSON.stringify(viewFor(t.game, seat))).not.toContain('"aiSalt"')
    const phase = t.game.phase as Extract<Game['phase'], { kind: 'playing' | 'trickPause' }>
    if (action.type === 'claimJodhi' && !phase.play.jodhiClaims.at(-1)!.valid) tally.get(personas[seat])!.bluffs++
    // Everyone watches after every action; a challenge ends the round.
    for (let s = 0; s < personas.length && inPlay(); s++) {
      const challenge = chooseChallenge(viewFor(t.game, s, 'full'), mind(s))
      if (challenge) t.do(s, challenge)
    }
  }

  for (let guard = 0; guard < 20_000 && t.game.phase.kind !== 'gameOver'; guard++) {
    const phase = t.game.phase
    if (phase.kind === 'roundResult') {
      t.do(0, { type: 'nextRound' })
      continue
    }
    const waiting = seatsToAct(t.game)
    if (waiting.length === 0) {
      for (let s = 0; s < personas.length && phase.kind === 'trickPause' && inPlay(); s++) {
        const claim = chooseJodhi(viewFor(t.game, s, 'full'), mind(s))
        if (claim) act(s, claim)
      }
      if (t.game.phase.kind === 'roundResult' || t.game.phase.kind === 'gameOver') continue // a claim was challenged
      t.now = nextDeadline(t.game)!
      t.do('system', { type: 'tick' })
      continue
    }
    const seat = waiting[0]
    act(seat, chooseAction(viewFor(t.game, seat, 'full'), mind(seat)))
  }
  expect(t.game.phase.kind).toBe('gameOver')
  const challenges = t.events.filter((e) => e.type === 'challengeResolved')
  return { tally, challenges }
}

describe('personas', () => {
  test(`${GAMES} games of Straight and Sharp against Sly and Wild`, () => {
    // Seats 0 and 2 are a team, as are 1 and 3.
    const personas: Persona[] = ['straight', 'sly', 'sharp', 'wild']
    const total = new Map<Persona, Tally>(personas.map((p) => [p, { illegal: 0, bluffs: 0 }]))
    let guilty = 0
    let innocent = 0
    for (let seed = 1; seed <= GAMES; seed++) {
      const { tally, challenges } = playGame(personas, seed)
      for (const [p, n] of tally) {
        total.get(p)!.illegal += n.illegal
        total.get(p)!.bluffs += n.bluffs
      }
      for (const c of challenges) if (c.type === 'challengeResolved') c.guilty ? guilty++ : innocent++
    }
    console.log('personas:', JSON.stringify(Object.fromEntries(total)), `challenges: ${guilty} guilty, ${innocent} innocent`)
    expect(total.get('straight')).toEqual({ illegal: 0, bluffs: 0 })
    expect(total.get('sharp')).toEqual({ illegal: 0, bluffs: 0 })
    expect(total.get('wild')!.illegal).toBeGreaterThan(total.get('sly')!.illegal)
    expect(total.get('sly')!.illegal + total.get('sly')!.bluffs).toBeGreaterThan(0)
    expect(guilty).toBeGreaterThan(0)
    expect(innocent).toBeGreaterThan(0)
  }, 600_000)

  test('two-player games finish with any pair of personas', () => {
    const pairs: Persona[][] = [['sly', 'wild'], ['sharp', 'straight'], ['wild', 'sharp']]
    for (const pair of pairs) for (let seed = 1; seed <= 5; seed++) playGame(pair, seed)
  }, 120_000)
})
```

- [ ] **Step 2: Run the tests**

Run: `./node_modules/.bin/vitest run src/ai`
Expected: PASS. Read the logged tally. If Wild ends nearly every round with a wrong hunch, or Sly never cheats in 30 games, report the numbers rather than retuning silently; the persona numbers are in the spec.

- [ ] **Step 3: Commit**

```bash
git add src/ai
git commit -m "Simulate games between honest and cheating personas"
```

---

### Task 8: Server challenges and save upgrade

**Files:**
- Modify: `party/server.ts` (imports, `onStart`, `act`, new `aiChallenge`)
- Modify: `AGENTS.md` (Architecture: a sentence on personas)
- Test: `party/server.test.ts`

**Interfaces:**
- Consumes: `chooseChallenge` (Tasks 4–5), `mindFor` (Task 3), `upgradeGame` (Task 2).

- [ ] **Step 1: Write the failing tests**

Add to `party/server.test.ts` (imports: `Table`, `card` from `../src/engine/testing`; `type Game`, `createGame` from `../src/engine`):

```ts
describe('computer personas', () => {
  const D1 = ['Jh 9h Ks Qs 10c Qd', 'Js 9s As 10s Kd Qc', 'Jc 9c Ac Kc Ah 10h', 'Jd 9d Ad 10d Kh Qh']

  /** A saved room in which seats 0 and 2 are Straight computers and seat 1 (a human) has just reneged. */
  async function afterRenege() {
    const t = new Table(4, { redealIfNoTrumps: false }).deal(D1).toPlay('spades').play('Kc Qh 10c Js').endPause()
    const game: Game = {
      ...t.game,
      host: 1,
      seats: t.game.seats.map((s, i) => (i % 2 === 0 ? { ...s, kind: 'ai' as const, name: `Bot ${i}` } : s)),
    }
    const w = new World()
    w.data.set('state', { game, tokens: { [TOKENS[1]]: 1, [TOKENS[3]]: 3 }, version: 1, eventCount: 0, emptySince: null })
    await w.boot()
    return { w, me: await w.connect(TOKENS[1]) }
  }

  test('a computer catches a clumsy renege the moment it shows', async () => {
    const { w, me } = await afterRenege()
    await w.send(me, { type: 'playCard', card: card('Qc') })
    expect(me.view.phase).toMatchObject({ kind: 'roundResult', summary: { reason: 'challenge', challenge: { accused: 1, guilty: true } } })
    expect(me.inbox.some((m) => m.type === 'error')).toBe(false)
  })

  test('a room saved before personas existed keeps its players', async () => {
    const old = createGame() as unknown as Record<string, unknown>
    const seats = [{ name: 'Old', kind: 'human', connected: true, standIn: false }, ...(old.seats as object[]).slice(1)]
    const w = new World()
    w.data.set('state', { game: { ...old, formatVersion: 1, seats, host: 0, aiSalt: undefined }, tokens: { [TOKENS[0]]: 0 }, version: 3, eventCount: 0, emptySince: null })
    await w.boot()
    const me = await w.connect(TOKENS[0])
    expect(me.sync.seat).toBe(0)
    expect(me.view.seats[0]).toMatchObject({ name: 'Old', persona: 'straight' })
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `./node_modules/.bin/vitest run party`
Expected: FAIL. The first test's phase is still `playing` because nobody challenges. The second test's seat is `null` because the old save is discarded.

- [ ] **Step 3: Implement**

In `party/server.ts`:

1. Imports: add `chooseChallenge` from `../src/ai/suspicion`; `upgradeGame` from `../src/engine` (drop `FORMAT_VERSION` if no longer used).
2. `onStart`:

```ts
  async onStart() {
    const stored = await this.room.storage.get<Saved>(STORAGE_KEY)
    const game = stored ? upgradeGame(stored.game, Math.floor(this.deps.rng() * 2 ** 32)) : null
    if (stored && game) {
      this.saved = { ...stored, game }
      // Nobody is connected to a room that has just started.
      for (const seat of this.saved.game.seats) if (seat.kind === 'human') seat.connected = false
      this.saved.emptySince = emptySince(this.saved.game, stored.emptySince ?? null, this.deps.now())
      await this.room.storage.put(STORAGE_KEY, this.saved)
    }
    await this.armAlarm()
  }
```

3. In `act`, after `await this.aiJodhi(result.events)`, add `await this.aiChallenge(result.events)`.
4. Add after `aiJodhi`:

```ts
  /** Computer seats watch every card and claim; a challenge, if any, ends the round. */
  private async aiChallenge(events: GameEvent[]): Promise<void> {
    if (!events.some((e) => e.type === 'cardPlayed' || e.type === 'jodhiClaimed')) return
    for (let seat = 0; seat < this.saved.game.playerCount; seat++) {
      const game = this.saved.game
      if (game.phase.kind !== 'playing' && game.phase.kind !== 'trickPause') return
      if (!isAiControlled(game, seat)) continue
      const challenge = chooseChallenge(viewFor(game, seat, 'full'), mindFor(game, seat))
      if (challenge && (await this.act(seat, challenge))) return
    }
  }
```

In `AGENTS.md` Architecture, after the "Paced playback" rule, add:

```markdown
- **Computer personas.** Each computer seat has a persona (`src/ai/mind.ts`) that decides whether it cheats and how well it watches. Every AI chance is `roll(aiSalt, seat, id)`, a pure hash, so a decision never changes on re-evaluation and nothing about it is held in server memory. A stand-in for a human always plays as Straight.
```

- [ ] **Step 4: Run all tests and the type check**

Run: `./node_modules/.bin/vitest run && ./node_modules/.bin/tsc --noEmit`
Expected: PASS, including the existing "one human and three AIs" game (its AIs are Straight).

- [ ] **Step 5: Commit**

```bash
git add party AGENTS.md
git commit -m "Have computer seats challenge on the server and load saves from before personas"
```

---

### Task 9: Persona picker and labels

**Files:**
- Create: `src/ui/personas.ts`
- Modify: `src/ui/Lobby.tsx` (picker sheet, seat line)
- Modify: `src/ui/Table.tsx:288-307` (`SeatBadge` label)
- Modify: `scripts/e2e.ts:36`, `scripts/e2e-controls.ts:28`, `scripts/perf-drag.ts:21`

**Interfaces:**
- Consumes: `Persona`, `ViewSeat`, the `addAi` action's `persona` field (Task 1).
- Produces: `PERSONA_NAMES`, `PERSONA_CHOICES`, `personaLabel(seat: ViewSeat): string | null`.

- [ ] **Step 1: Implement**

Create `src/ui/personas.ts`:

```ts
import type { Persona, ViewSeat } from '../engine'

export const PERSONA_NAMES: Record<Persona, string> = { straight: 'Straight', sharp: 'Sharp', sly: 'Sly', wild: 'Wild' }

export const PERSONA_CHOICES: { value: Persona | 'surprise'; label: string; text: string }[] = [
  { value: 'straight', label: 'Straight', text: 'Plays fair. Catches about half of careless cheating.' },
  { value: 'sharp', label: 'Sharp', text: 'Plays fair and rarely misses a careless cheat. Patient cheating can still slip past.' },
  { value: 'sly', label: 'Sly', text: 'Cheats when it thinks it can get away with it.' },
  { value: 'wild', label: 'Wild', text: 'Cheats when tempted and accuses on a hunch.' },
  { value: 'surprise', label: 'Surprise me', text: 'One of the four, kept secret until the game ends.' },
]

/** A computer seat's persona as shown at the table: "?" while it is a secret. */
export function personaLabel(seat: ViewSeat): string | null {
  if (seat.kind !== 'ai') return null
  return seat.persona === null ? '?' : PERSONA_NAMES[seat.persona]
}
```

In `src/ui/Lobby.tsx`:

1. `import { PERSONA_CHOICES, PERSONA_NAMES } from './personas'`.
2. Add state: `const [picking, setPicking] = useState<number | null>(null)`.
3. Seat line: replace `{seat.kind === 'ai' && ', computer'}` with
   `{seat.kind === 'ai' && `, computer: ${seat.persona === null ? 'secret' : PERSONA_NAMES[seat.persona]}`}`.
4. The "Add computer" button: `onClick={() => setPicking(i)}`.
5. After the edit-rules sheet:

```tsx
      {picking !== null && (
        <Sheet title="Choose a computer player" onClose={() => setPicking(null)}>
          <ul className="grid gap-2">
            {PERSONA_CHOICES.map((choice) => (
              <li key={choice.value}>
                <button
                  className="btn w-full text-left grid gap-0.5"
                  onClick={() => {
                    send({ type: 'addAi', seat: picking, persona: choice.value })
                    setPicking(null)
                  }}
                >
                  <span className="font-semibold">{choice.label}</span>
                  <span className="text-sm text-on-surface-muted">{choice.text}</span>
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
```

In `src/ui/Table.tsx` `SeatBadge`: import `personaLabel` from `./personas`; after `const away = ...` add `const persona = personaLabel(info)`; directly after the name `<p>`, add:

```tsx
      {persona && <p className="text-xs text-muted">{persona}</p>}
```

In each of `scripts/e2e.ts`, `scripts/e2e-controls.ts` and `scripts/perf-drag.ts`, change the add-computer loop to:

```ts
for (let i = 0; i < 3; i++) {
  await page.getByRole('button', { name: 'Add computer' }).first().click()
  await page.getByRole('button', { name: /^Straight/ }).click()
}
```

- [ ] **Step 2: Check types and build**

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vite build`
Expected: no errors.

- [ ] **Step 3: Check it in the browser**

With `pnpm dev` and `pnpm party` running, open the app at 390x844, create a game, sit, and add one computer of each persona plus one "Surprise me". Check that:
- the sheet fits the screen and every option is readable;
- the lobby lines read "computer: Sly" and "computer: secret";
- at the table, each computer shows its persona under its name, and the surprise seat shows "?" until game end.

Then run `pnpm e2e` if Chromium is available. If it isn't, say so.

- [ ] **Step 4: Commit**

```bash
git add src/ui scripts
git commit -m "Let the host pick each computer's persona and show it at the table"
```

---

### Task 10: Final verification

- [ ] **Step 1:** Run `./node_modules/.bin/vitest run`, `./node_modules/.bin/tsc --noEmit` and `SIM_GAMES=400 ./node_modules/.bin/vitest run src/ai` (the soak). All must pass. Note the persona tally the soak logs.
- [ ] **Step 2:** Re-read the spec's "Tests" section and confirm each item has a passing test.
- [ ] **Step 3:** Report the soak tally and anything that felt off in the browser check. Tuning numbers is a separate decision for the user.
