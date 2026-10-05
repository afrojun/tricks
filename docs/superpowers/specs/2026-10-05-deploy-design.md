# Deploy configuration — Design

Date: 2026-10-05
Status: deferred to the end (sub-project G in `2026-10-05-tricks-overview-design.md`)
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
