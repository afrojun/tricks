import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

/**
 * In development the page and the game server share one origin: Vite proxies
 * /parties (including WebSockets) to PartyKit. That keeps a single URL working
 * over localhost, a LAN address, or an HTTPS tunnel such as Tailscale Serve.
 */
const server = {
  host: '127.0.0.1', // where Tailscale Serve and the e2e scripts look
  allowedHosts: ['.ts.net'],
  proxy: { '/parties': { target: 'http://127.0.0.1:1999', ws: true } },
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  server,
  preview: server,
})
