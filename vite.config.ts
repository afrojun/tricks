import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

/**
 * The Cloudflare plugin runs the Worker (rooms included) inside Vite, so the page and the rooms
 * share one origin: a single URL works over localhost, a LAN address, or an HTTPS tunnel such as
 * Tailscale Serve. Vitest has its own config and never loads this plugin.
 */
const server = {
  host: '127.0.0.1', // where Tailscale Serve and the e2e scripts look
  allowedHosts: ['.ts.net'],
}

/** Each game's screens load on demand as a chunk of their own, named by the game: `assets/thunee-<hash>.js`. */
function chunkFileNames(chunk: { facadeModuleId: string | null }): string {
  const game = chunk.facadeModuleId?.match(/[/\\]src[/\\]games[/\\]([a-z]+)[/\\]client\.ts$/)?.[1]
  return `assets/${game ?? '[name]'}-[hash].js`
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  build: { rolldownOptions: { output: { chunkFileNames } } },
  server,
  preview: server,
})
