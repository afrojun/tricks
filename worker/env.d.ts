/** The Worker's bindings, as declared in `wrangler.jsonc`. */
declare namespace Cloudflare {
  interface Env {
    Room: DurableObjectNamespace<import('./room').Room>
  }
}

interface Env extends Cloudflare.Env {}
