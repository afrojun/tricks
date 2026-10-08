import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

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

/**
 * Installable: a manifest and a service worker (Workbox). The pages, icons and sounds are precached,
 * the fonts cached as they arrive, and any address that is not a file is the app. Room sockets at
 * /parties/* are never cached. The worker waits for the player to accept an update (`Update` in
 * src/ui), so an open table is never reloaded under them; `pnpm dev` runs without it.
 */
const pwa = VitePWA({
  registerType: 'prompt',
  includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
  manifest: {
    name: 'Tricks',
    short_name: 'Tricks',
    description: 'Trick-taking card games with friends: Thunee and Hearts.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0b6d58',
    theme_color: '#0b6d58',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    cacheId: 'tricks',
    globPatterns: ['**/*.{js,css,html,svg,png,mp3}'],
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/parties\//],
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
        handler: 'StaleWhileRevalidate',
        options: { cacheName: 'tricks-fonts-styles' },
      },
      {
        urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
        handler: 'CacheFirst',
        options: {
          cacheName: 'tricks-fonts-files',
          expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
    ],
  },
})

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare(), pwa],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  build: { rolldownOptions: { output: { chunkFileNames } } },
  server,
  preview: server,
})
