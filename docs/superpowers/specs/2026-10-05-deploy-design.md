# Deploy configuration — Design

Date: 2026-10-05
Status: deployed 2026-10-06 (sub-project G in `2026-10-05-tricks-overview-design.md`). Section 7 records how, and what is left.
Depends on: everything else being merged into `tricks`

## 1. Purpose

Put Tricks at `tricks.afrojun.dev`, deployed by one push to `main`, and retire the Vercel and PartyKit deployments.

### Decisions

| Question | Decision |
|---|---|
| Where | One Cloudflare Worker named `tricks`, on the account that already holds `afrojun.dev`. |
| Address | `tricks.afrojun.dev` as a custom domain. No `workers.dev` address and no preview addresses. |
| How | Cloudflare Workers Builds, watching `main`: install, check, test, build, `wrangler deploy`. (First planned as a GitHub Action; changed on 2026-10-06 so the deploy needs no API token or repository secrets.) |
| Old deployments | Removed by hand once the new address works. |

## 2. Configuration

Added to `wrangler.jsonc`, following `words-into-worlds`:

- `routes: [{ "pattern": "tricks.afrojun.dev", "custom_domain": true }]`. Cloudflare creates the DNS record.
- `workers_dev: false`, `preview_urls: false`.
- `observability` enabled, with logs.

The Durable Object migration from sub-project A is the first one applied in production. Each later change to the room class list needs a new migration tag.

## 3. The build

Cloudflare Workers Builds, connected to the GitHub repository through Cloudflare's GitHub app, builds and deploys the Worker `tricks` on every push to `main`:

1. Install: the build image detects pnpm from the lockfile and uses the version in `packageManager`; Node is the major version in `.node-version` (24).
2. Build command: `pnpm check && pnpm test && pnpm build`. A failure stops the build before anything is deployed.
3. Deploy command: `pnpm exec wrangler deploy`, which follows the config the build wrote. Workers Builds supplies the credentials through a build token on the account, so the repository holds no secrets.

Each build deploys all of `main` as it was at its commit. Unlike the removed workflow, nothing in the repository makes deploys run one at a time: Cloudflare limits concurrent builds per account (one on the free plan, more on paid), but does not promise that two builds of this Worker finish in push order. Leave a build to finish before pushing again when order matters. Their logs are in the dashboard (Workers & Pages, `tricks`, Deployments, View build) or `cf builds list` and `cf builds logs`.

One deploy carries the app and the rooms together, so a change to the messages between them can no longer reach one before the other. Tabs already open still run the old app until reloaded.

A deploy restarts every room. Games in progress survive, because everything a room knows is saved. A change to a game's saved shape raises that game's format version and resets that game's rooms, as today.

## 4. What needs Arjun

- Afterwards: delete the Vercel project, delete the PartyKit deployment (`tuscan-thunee`), and remove the `PARTYKIT_LOGIN` and `PARTYKIT_TOKEN` secrets.
- Optional: rename the GitHub repository. If renamed, check the build trigger still points at it.

## 5. Checks before the first push to `main`

- `wrangler deploy --dry-run` succeeds.
- A full game of each kind played against the local build over the Tailscale address.
- `AGENTS.md` and `README.md` describe the new deployment and no longer mention Vercel or PartyKit.

## 6. After the first deploy

- Create a game at `https://tricks.afrojun.dev/thunee`, join from a second device, and finish a round.
- Leave a table idle for several minutes, then play a card: the room must wake with everyone still seated and connected.
- Confirm the Worker's logs show no errors.

## 7. Status

Updated 2026-10-06, at the end of sub-project G (branch `tricks-deploy`, plan `docs/superpowers/plans/2026-10-06-deploy.md`), and again the same day when the deploy moved from a GitHub Action to Cloudflare Workers Builds. Deployed on 2026-10-06:

- The first deploy ran from this machine (`wrangler deploy`), creating the Worker `tricks` (tag `e7057f1ddf744788b9365a227bb20f19`), applying migration `v1` and attaching `tricks.afrojun.dev`.
- The build trigger was then created with the `cf` CLI: repository connection `92b8cc42-de90-443f-ada5-28e93480e7f3` (`afrojun/tricks`), trigger `03dd1b7f-c5b8-47cd-9d7a-541189452da3` on `main`, build command `pnpm check && pnpm test && pnpm build`, deploy command `pnpm exec wrangler deploy`, build caching on, and the account's existing `afrojun-dev build token`, which proved to carry the routes permission.
- `main` was fast-forwarded to `tricks` and pushed. The first Cloudflare build (`3298a7ed-a95d-44f7-93ee-dbb87c0153a2`) used Node 24.21.0 and pnpm 12.9.1, installed with `--frozen-lockfile`, passed 863 tests, and deployed.
- After it: every address answered 200, unknown and plain room requests 404, and `APP_URL=https://tricks.afrojun.dev pnpm e2e:sockets` played a whole Thunee game and opened a Hearts lobby.

Steps 2 and part of 3 below are therefore done; the by-hand checks of step 3 (two devices, an idle table waking) and step 4 remain.

### Done

- **`wrangler.jsonc`** has the custom domain (`routes`), `workers_dev: false`, `preview_urls: false`, and `observability` with logs (every request sampled, invocation logs on) and `redact_query_string: true`. A socket's URL carries the player's device token in its query string, and the token owns a seat, so no log or trace may record it. Everything local development uses is unchanged: the assets settings, the `Room` binding, and the one migration, `v1` (`new_sqlite_classes: ["Room"]`). Being the only migration, `v1` is the first applied in production, provided no Worker named `tricks` exists on the account yet (checked below).
- **The build is Cloudflare's** (section 3). The GitHub workflow first written for it was removed on 2026-10-06, so a push to `main` deploys only through Workers Builds. `.node-version` pins Node 24 for the build image.
- **The dry run** (section 5) succeeds with no login and no account id:

  ```
  $ pnpm build && pnpm exec wrangler deploy --dry-run --outdir /tmp/tricks-dry-run
   ⛅️ wrangler 4.147.0
  Using redirected Wrangler configuration.
   - Configuration being used: "dist/tricks/wrangler.json"
   - Original user's configuration: "wrangler.jsonc"
   - Deploy configuration file: ".wrangler/deploy/config.json"
  ✨ Read 9 files from the assets directory .../dist/client
  Total Upload: 339.21 KiB / gzip: 85.47 KiB
  Your Worker has access to the following bindings:
  Binding              Resource
  env.Room (Room)      Durable Object
  --dry-run: exiting now.
  ```

  A dry run does not contact Cloudflare, so the account and the custom domain are first checked by the real deploy.
- **The production build played locally.** Served by `pnpm preview` (the built Worker in `workerd`, on this machine, not over Tailscale), it passed every browser script (`e2e.ts`, `e2e-two.ts`, `e2e-controls.ts`, `e2e-practice.ts`, `e2e-hearts.ts`) and `e2e:sockets`.
- **Checked on the account, 2026-10-06:** `tricks.afrojun.dev` has no DNS record, no Worker named `tricks` exists, and Cloudflare's GitHub app can read the repository (Workers Builds detects pnpm in it).
- **The documents.** `AGENTS.md` and `README.md` describe this deployment. Vercel and PartyKit appear once, in a line of history.

### What the owner does

The account checks above and disconnecting Vercel from `main` were done on 2026-10-06. What remains:

0. **The last check of section 5,** before pushing: a full game of Thunee and one of Hearts against the local production build, on two devices. In a terminal of its own, on `tricks`, run `pnpm build && pnpm preview` (the built Worker on port 4173), then open `https://omarchy.taild12565.ts.net:8443/thunee` and `/hearts`; this machine's Tailscale Serve already maps that address to 4173.

1. **Bring `main` up to date.** Nothing deploys from GitHub any more, so this push alone deploys nothing:

   ```bash
   git checkout main && git merge --ff-only tricks && git push origin main
   ```

2. **Create the Worker from the repository.** Cloudflare dashboard, Workers & Pages, Create, Import a repository, `afrojun/tricks`:
   - Project name: `tricks` (it must match `name` in `wrangler.jsonc`).
   - Production branch: `main`. Root directory: `/`.
   - Build command: `pnpm check && pnpm test && pnpm build`.
   - Deploy command: `pnpm exec wrangler deploy`.
   - Build token: let Cloudflare create one (it already includes the routes permission), or pick a user API token scoped to this account with Workers Scripts Edit and, on the `afrojun.dev` zone, Workers Routes Edit; the custom domain needs the second. Account-owned API tokens are not supported for builds.

   The first build then installs, checks, tests, builds and deploys. It creates the Worker, applies migration `v1` (the `Room` class) and attaches `tricks.afrojun.dev`, whose DNS record and certificate can take a few minutes to answer.

   **If the build fails,** where it failed decides what is live.
   - **Install, check, test or build:** nothing reached Cloudflare. Fix it on `main` and push, or use Retry build.
   - **The deploy command:** read its log first. Wrangler uploads the Worker (the pages, the code and the `v1` migration) and only then attaches the custom domain, so a build token without the zone's Workers Routes permission leaves the Worker uploaded with `v1` applied while the build fails. Keep that Worker and its migration: do not delete the Worker, and never edit `v1`. Fix the token, then retry; a retry deploys the Worker again in full, and an applied migration is skipped.

3. **After the first deploy** (section 6):

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' https://tricks.afrojun.dev/thunee                     # 200
   curl -s -o /dev/null -w '%{http_code}\n' https://tricks.afrojun.dev/parties/room/nope-ABCDEF   # 404
   APP_URL=https://tricks.afrojun.dev pnpm e2e:sockets    # a whole Thunee game and a Hearts lobby over real sockets
   pnpm exec wrangler tail tricks --status error           # when logged in; or the Worker's Logs tab in the dashboard
   ```

   Then by hand: create a game at `https://tricks.afrojun.dev/thunee`, join from a second device and finish a round, and the same at `/hearts`; leave a table idle for several minutes, then play a card, and everyone must still be seated and connected; and the logs show no errors. The Worker's "Domains & Routes" settings should list `tricks.afrojun.dev` only.

   A bad deploy is undone by reverting its commit on `main`, which builds and deploys again. The dashboard's Rollback (the Worker's Deployments) is quicker but only reaches versions with the same Durable Object migrations, so it cannot go back across a new migration; then deploy a fix forward instead. Neither brings back rooms already reset by a format-version change.
4. **Afterwards** (section 4), once the checks in step 3 pass:
   - Delete the Vercel project, already disconnected: Vercel, the project, Settings, Advanced, Delete Project.
   - Delete the PartyKit deployment `tuscan-thunee`: `pnpm dlx partykit login`, then `pnpm dlx partykit delete --name tuscan-thunee` (or from PartyKit's dashboard).
   - Remove the old secrets: `gh secret delete PARTYKIT_LOGIN` and `gh secret delete PARTYKIT_TOKEN`.
   - Optional: rename the repository, `gh repo rename tricks`. The build is connected by the repository's id, so a rename keeps it; check the Worker's Builds settings afterwards.
