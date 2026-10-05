# Cloudflare hosting and the rename to Tricks — Design

Date: 2026-10-05
Status: ready to build (sub-project A in `2026-10-05-tricks-overview-design.md`)
Depends on: nothing

## 1. Purpose

Move the app from Vercel plus PartyKit to a single Cloudflare Worker, rename it Tricks, and put Thunee at `/thunee`. Thunee itself does not change: same rules, same screens, same messages.

Success: `pnpm dev` alone runs the whole app; a game of Thunee can be created, joined from a second device, played with computers and finished; a room survives hibernation with nobody marked as having left; every existing test passes.

### Decisions

| Question | Decision |
|---|---|
| Runtime | One Worker. Static assets for the app, one Durable Object class for rooms. |
| Room library | `partyserver` (Cloudflare's successor to PartyKit: the same hooks on a Durable Object). The client keeps `partysocket`. |
| Hibernation | On. An idle table must cost nothing. |
| Room logic | A plain class over a small host interface, tested under plain Vitest. The Cloudflare class is a thin adapter. |
| Old data | Dropped. New storage keys, no copying; old paths are not redirected. |
| Deploy | Not in this sub-project. See `2026-10-05-deploy-design.md`. |

### Out of scope

The game-module seam, Hearts, the custom domain, the deploy workflow, renaming the repository. No change to `src/engine`, `src/ai` or `src/coach` beyond imports.

## 2. Architecture

```
worker/index.ts    The Worker: routes /parties/* to the room, exports the Durable Object class.
worker/room.ts     Room: a partyserver Server. Adapts Cloudflare to TableRoom. No game logic.
src/room/room.ts   TableRoom: today's ThuneeRoom, unchanged in behaviour, over a RoomHost.
src/room/room.test.ts   Today's party/server.test.ts.
```

`party/`, `partykit.json`, `vercel.json` and `.github/workflows/deploy-partykit.yml` are deleted. Dependency direction adds `worker -> room -> engine, ai, protocol`.

### 2.1 The host interface

`TableRoom` needs exactly what `party/server.test.ts` already fakes:

```ts
export interface RoomConnection {
  readonly id: string
  state: { token: string } | null
  setState(state: { token: string }): void
  send(text: string): void
}

export interface RoomHost {
  /** The room's name, `<game>-<CODE>`. Available on every wake, including an alarm. */
  readonly name: string
  storage: {
    get<T>(key: string): Promise<T | undefined>
    put(key: string, value: unknown): Promise<void>
    setAlarm(at: number): Promise<void>
    deleteAlarm(): Promise<void>
  }
  connections(): Iterable<RoomConnection>
}

export class TableRoom {
  constructor(host: RoomHost, deps?: Deps)
  onStart(): Promise<void>
  onConnect(conn: RoomConnection, url: string): Promise<void>
  onClose(conn: RoomConnection): Promise<void>
  onMessage(message: string | ArrayBuffer | ArrayBufferView, sender: RoomConnection): Promise<void> | void
  onAlarm(): Promise<void>
}
```

The serialising queue, `act`, `drive`, `reset`, `armAlarm`, the token map and the abandoned-room clock move over as they are.

### 2.2 The adapter

`worker/room.ts` holds a `TableRoom` and forwards each `partyserver` hook to it. Note that `partyserver` passes `onMessage(connection, message)`, the reverse of PartyKit's order. `static options = { hibernate: true }`.

`worker/index.ts`:

```ts
export { Room } from './room'
export default {
  async fetch(request, env) {
    return (await routePartykitRequest(request, env)) ?? new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
```

### 2.3 Configuration

`wrangler.jsonc`, with only what local development needs:

- `name: "tricks"`, `main: "worker/index.ts"`, a current `compatibility_date`.
- `assets` with `not_found_handling: "single-page-application"`, and the Worker run first for `/parties/*` only. Check the exact form against `node_modules/wrangler/config-schema.json`.
- One Durable Object binding named `Room` for class `Room`, and a migration with `new_sqlite_classes: ["Room"]`. `routePartykitRequest` derives the URL segment from the binding name, so the socket path is `/parties/room/<name>`.

Vite gains `@cloudflare/vite-plugin` and loses the `/parties` proxy. `host` and `allowedHosts` stay, so the Tailscale address keeps working. Vitest must not load the Cloudflare plugin: give it its own config.

Packages: add `partyserver`, `wrangler`, `@cloudflare/vite-plugin`, and Worker types; remove `partykit`. Scripts: `dev` runs everything; `party` and `party:deploy` go. `pnpm check` must type-check `worker/` as well as `src/` (Worker and DOM types conflict, so this probably needs a second tsconfig).

## 3. Hibernation

Cloudflare may unload a room between messages while its sockets stay open, then construct it again on the next message or alarm. `partyserver` calls `onStart` on every such wake. Three things follow.

1. **Who is connected.** Today `onStart` marks every human seat disconnected, which is only true after a restart. Instead: a human seat is connected exactly when some live connection's token maps to it. After a deploy there are no live connections, so the result is the same as today; after a wake, nobody is wrongly marked as gone. Write to storage only if something changed.
2. **The heartbeat.** Clients send `ping` every 5 seconds, and each one would wake the room. The adapter registers Cloudflare's automatic response (`ctx.setWebSocketAutoResponse` with a `ping`/`pong` pair) so they are answered at the edge. `TableRoom` keeps its own `ping` reply, so behaviour is the same on any host and in tests.
3. **Connection state.** The token lives in the connection's state, which `partyserver` keeps across hibernation (2KB limit; a token is at most 64 characters).

Nothing else may be assumed to survive in memory. `saved` is reloaded in `onStart`; the queue starts empty.

## 4. The client

- `openSession(game, code)` connects with `new PartySocket({ host: location.host, party: 'room', room: `${game}-${code}`, query })`. `VITE_PARTYKIT_HOST` is removed: the app and the rooms always share an origin.
- `TableRoom` checks `host.name` on connect. A name that is not a known game id (only `thunee` for now), then `-`, then six capital letters is refused with a close code. The game is always read from the name and never saved.

## 5. The rename

### 5.1 Addresses

| Path | Shows |
|---|---|
| `/` | Tricks home: a heading and the list of games, which is one card for Thunee linking to `/thunee`. Theme picker lives here too. |
| `/thunee` | Today's home screen, unchanged: create, join, presets, learn to play. |
| `/thunee/<CODE>` | The room (today `/game/<CODE>`). |
| `/thunee/practice` | Practice (today `/practice`), keeping `?players=`. |

Match `practice` before a room code. The invite link copied from the lobby and the preset share link use the new paths. `/game/...` and `/practice` are not redirected. "Leave game" and similar return to `/thunee`.

### 5.2 Names

- `index.html` title: `Tricks`. `package.json` name: `tricks`.
- Thunee's own heading and copy stay on `/thunee`.
- `AGENTS.md` and `README.md`: commands, architecture, and the environment section updated to match. The deployment section says deployment is pending and points at the deploy spec.

### 5.3 Storage keys

Old keys are ignored, not read and not deleted.

| Today | Becomes | Scope |
|---|---|---|
| `thunee-device-token` | `tricks-device-token` | all games |
| `thunee-name` | `tricks-name` | all games |
| `thunee-theme`, `thunee-card-back-*` | `tricks-theme`, `tricks-card-back-*` | all games |
| `thunee-muted` | `tricks-muted` | all games |
| `thunee-presets` | `tricks-thunee-presets` | Thunee |
| `thunee-practice` | `tricks-thunee-practice` | Thunee |
| `thunee-coach-seen` | `tricks-thunee-coach-seen` | Thunee |
| `thunee-setup-<code>` (session) | `tricks-thunee-setup-<code>` | Thunee |

## 6. Testing

- `src/room/room.test.ts` is `party/server.test.ts` with the fake renamed to a `RoomHost`. Every case still passes.
- New cases: a second `TableRoom` constructed over the same host with its connections still present leaves those seats connected; with no connections, every human seat is disconnected; `onStart` does not write when nothing changed.
- Routing: `/`, `/thunee`, `/thunee/ABCDEF`, `/thunee/practice`, and an old `/game/ABCDEF` (which shows the Tricks home).
- `scripts/play.ts` (`e2e:sockets`) and the browser scripts are updated for the new paths and the single origin, and run against the Vite dev server. The dev servers already running on ports 5173 and 1999 belong to the main checkout: use another port.
- A manual check that pongs still arrive with the automatic response registered: the client must not start reconnecting after ten seconds of idling at a table.

## 7. Build order

1. `TableRoom` over `RoomHost` in `src/room/`, tests moved and passing, with `party/server.ts` reduced to an adapter so the app still runs.
2. The hibernation rule for `connected`, with its tests.
3. The Worker, `wrangler.jsonc` and the Vite plugin; client connects on the same origin; PartyKit removed.
4. Paths, the Tricks home, storage keys.
5. Scripts and documents.
