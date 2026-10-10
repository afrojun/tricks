/** The Worker's bindings, as declared in `wrangler.jsonc`. */
declare namespace Cloudflare {
  interface Env {
    Room: DurableObjectNamespace<import('./room').Room>
    /** Sockets opened per address, before any room wakes (`ratelimits` in `wrangler.jsonc`). */
    CONNECTS: RateLimit
  }
}

interface Env extends Cloudflare.Env {}

/** What Vite tells the Worker's code of how it was built: `DEV` under `pnpm dev`, false in a build. */
interface ImportMeta {
  readonly env: { readonly DEV: boolean }
}
