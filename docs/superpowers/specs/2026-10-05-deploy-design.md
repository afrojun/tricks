# Deploy configuration — Design

Date: 2026-10-05
Status: built, not yet deployed (sub-project G in `2026-10-05-tricks-overview-design.md`). Section 7 says what is done and what the owner does next.
Depends on: everything else being merged into `tricks`

## 1. Purpose

Put Tricks at `tricks.afrojun.dev`, deployed by one push to `main`, and retire the Vercel and PartyKit deployments.

### Decisions

| Question | Decision |
|---|---|
| Where | One Cloudflare Worker named `tricks`, on the account that already holds `afrojun.dev`. |
| Address | `tricks.afrojun.dev` as a custom domain. No `workers.dev` address and no preview addresses. |
| How | A GitHub Action on pushes to `main`: check, test, build, `wrangler deploy`. |
| Old deployments | Removed by hand once the new address works. |

## 2. Configuration

Added to `wrangler.jsonc`, following `words-into-worlds`:

- `routes: [{ "pattern": "tricks.afrojun.dev", "custom_domain": true }]`. Cloudflare creates the DNS record.
- `workers_dev: false`, `preview_urls: false`.
- `observability` enabled, with logs.

The Durable Object migration from sub-project A is the first one applied in production. Each later change to the room class list needs a new migration tag.

## 3. The workflow

`.github/workflows/deploy.yml`, on pushes to `main`:

1. Install with pnpm, as the old PartyKit workflow did.
2. `pnpm check` and `pnpm test`.
3. `pnpm build`.
4. `wrangler deploy`, with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from the repository's secrets.

One deploy carries the app and the rooms together, so a change to the messages between them can no longer reach one before the other. Tabs already open still run the old app until reloaded.

A deploy restarts every room. Games in progress survive, because everything a room knows is saved. A change to a game's saved shape raises that game's format version and resets that game's rooms, as today.

## 4. What needs Arjun

- A Cloudflare API token with permission to deploy Workers on the account, saved as `CLOUDFLARE_API_TOKEN`, and the account id as `CLOUDFLARE_ACCOUNT_ID`, in the GitHub repository's secrets.
- Afterwards: delete the Vercel project, delete the PartyKit deployment (`tuscan-thunee`), and remove the `PARTYKIT_LOGIN` and `PARTYKIT_TOKEN` secrets.
- Optional: rename the GitHub repository.

## 5. Checks before the first push to `main`

- `wrangler deploy --dry-run` succeeds.
- A full game of each kind played against the local build over the Tailscale address.
- `AGENTS.md` and `README.md` describe the new deployment and no longer mention Vercel or PartyKit.

## 6. After the first deploy

- Create a game at `https://tricks.afrojun.dev/thunee`, join from a second device, and finish a round.
- Leave a table idle for several minutes, then play a card: the room must wake with everyone still seated and connected.
- Confirm the Worker's logs show no errors.

## 7. Status

Updated 2026-10-06, at the end of sub-project G (branch `tricks-deploy`, plan `docs/superpowers/plans/2026-10-06-deploy.md`). Nothing has been deployed or pushed.

### Done

- **`wrangler.jsonc`** has the custom domain (`routes`), `workers_dev: false`, `preview_urls: false`, and `observability` with logs (every request sampled, invocation logs on) and `redact_query_string: true`. A socket's URL carries the player's device token in its query string, and the token owns a seat, so no log or trace may record it. Everything local development uses is unchanged: the assets settings, the `Room` binding, and the one migration, `v1` (`new_sqlite_classes: ["Room"]`). Being the only migration, `v1` is the first applied in production, provided no Worker named `tricks` exists on the account yet (step 3 below).
- **`.github/workflows/deploy.yml`** runs on every push to `main`: checkout, pnpm (the version in `packageManager`), Node 24 with the pnpm cache, `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test`, `pnpm build`, then `pnpm exec wrangler deploy` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from the repository's secrets. A failing install, check, test or build stops the run before the deploy step. One deploy runs at a time and is never cancelled; a push made meanwhile waits, and a newer push replaces the waiting one, which loses nothing, since each run deploys all of `main`.
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

  A dry run does not contact Cloudflare, so the token, the account and the custom domain are first checked by the real deploy.
- **The production build played locally.** Served by `pnpm preview` (the built Worker in `workerd`, on this machine, not over Tailscale), it passed every browser script (`e2e.ts`, `e2e-two.ts`, `e2e-controls.ts`, `e2e-practice.ts`, `e2e-hearts.ts`) and `e2e:sockets`.
- **The documents.** `AGENTS.md` and `README.md` describe this deployment. Vercel and PartyKit appear once, in a line of history.

### What the owner does

Steps 1 to 6 come before the first push; the commands run from the repository's folder.

1. **The account id.** The account that holds `afrojun.dev`: Cloudflare dashboard, Workers & Pages, "Account details"; or `pnpm exec wrangler whoami` when logged in.
2. **An API token.** Dashboard, My Profile, API Tokens, Create Token, the "Edit Cloudflare Workers" template. Account Resources: that account. Zone Resources: the zone `afrojun.dev`. It needs at least Account · Workers Scripts · Edit and Zone · Workers Routes · Edit on `afrojun.dev`; the custom domain needs the second.
3. **Two checks in the dashboard.**
   - `tricks.afrojun.dev` is free: no DNS record for it (`afrojun.dev`, DNS, Records), and it is not a custom domain of another Worker. Run from CI, wrangler does not ask: it replaces an existing record and moves the hostname from another Worker. This check is what stops the first deploy from overwriting something already there.
   - No Worker named `tricks` exists (Workers & Pages). If one does, its own migrations decide whether `v1` applies, so delete it or rename this one first.
4. **The secrets.** Replace `REPLACE_WITH_ACCOUNT_ID` with the id from step 1, keeping the quotes.

   ```bash
   gh secret set CLOUDFLARE_API_TOKEN                                  # paste the token when asked
   gh secret set CLOUDFLARE_ACCOUNT_ID --body 'REPLACE_WITH_ACCOUNT_ID'
   gh secret list                                                      # both are listed
   ```

5. **The last check of section 5:** a full game of Thunee and one of Hearts against the local production build over the Tailscale address. In a terminal of its own, on `tricks`:

   ```bash
   pnpm build && pnpm preview     # the built Worker at 127.0.0.1:4173; stop it with Ctrl+C afterwards
   ```

   This machine's Tailscale Serve already maps `https://omarchy.taild12565.ts.net:8443` to port 4173, beside the default address for `pnpm dev` on 5173, so nothing needs changing: open `https://omarchy.taild12565.ts.net:8443/thunee` and `/hearts` on two devices. On another machine, `tailscale serve status` shows which address, if any, reaches 4173.
6. **Disconnect Vercel from `main`.** Vercel's GitHub integration builds every push to `main`, and such a build no longer makes a working app (`vercel.json` and the PartyKit address are gone, and the pages are now built to `dist/client`). Disconnect it before pushing: Vercel, the project, Settings, Git, Disconnect. The old address then keeps serving its last deployment until step 9 removes it.
7. **The first deploy.** `main` is an ancestor of `tricks`, so this is a fast-forward once `tricks` holds this branch:

   ```bash
   git checkout main
   git merge --ff-only tricks
   git push origin main
   gh run watch                   # the "Deploy" run: check, test, build, deploy
   ```

   **If the run fails,** where it failed decides what is live; the job's red cross alone does not say.
   - **Install, check, test or build:** nothing reached Cloudflare. Fix it and push again.
   - **The deploy step:** read its output first. Wrangler uploads the Worker first (the pages, the code and the `v1` migration, which creates the `Room` class), and only then attaches the custom domain. A token that may edit Workers but not the zone's routes therefore leaves the Worker `tricks` uploaded, with `v1` applied, while the step fails. See what is there in the dashboard: Workers & Pages, `tricks`, its Deployments and its Domains & Routes. Keep that Worker and its migration: do not delete the Worker, and never edit `v1`. Fix the token or the secret, then rerun the failed job (`gh run rerun <run id> --failed`). A rerun deploys the Worker again in full; only a migration that has already been applied is skipped.

   The first deploy creates the DNS record and a certificate, which can take a few minutes to answer.
8. **After the first deploy** (section 6):

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' https://tricks.afrojun.dev/thunee                     # 200
   curl -s -o /dev/null -w '%{http_code}\n' https://tricks.afrojun.dev/parties/room/nope-ABCDEF   # 404
   APP_URL=https://tricks.afrojun.dev pnpm e2e:sockets    # a whole Thunee game and a Hearts lobby over real sockets
   pnpm exec wrangler tail tricks --status error           # when logged in; or the Worker's Logs tab in the dashboard
   ```

   Then by hand: create a game at `https://tricks.afrojun.dev/thunee`, join from a second device and finish a round, and the same at `/hearts`; leave a table idle for several minutes, then play a card, and everyone must still be seated and connected; and the logs show no errors. The Worker's "Domains & Routes" settings should list `tricks.afrojun.dev` only.

   A bad deploy is undone by reverting its commit on `main`, which deploys again.
9. **Afterwards** (section 4), once the checks in step 8 pass:
   - Delete the Vercel project, disconnected in step 6: Vercel, the project, Settings, Advanced, Delete Project.
   - Delete the PartyKit deployment `tuscan-thunee`: `pnpm dlx partykit login`, then `pnpm dlx partykit delete --name tuscan-thunee` (or from PartyKit's dashboard).
   - Remove the old secrets: `gh secret delete PARTYKIT_LOGIN` and `gh secret delete PARTYKIT_TOKEN`.
   - Optional: rename the repository, `gh repo rename tricks`. Nothing in the deploy depends on its name.
