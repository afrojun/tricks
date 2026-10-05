import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    include: [
      'src/engine/**/*.test.ts',
      'src/ai/**/*.test.ts',
      'src/client/**/*.test.ts',
      'src/presets/**/*.test.ts',
      'src/practice/**/*.test.ts',
      'src/coach/**/*.test.ts',
      'src/kit/**/*.test.ts',
      'src/games/**/*.test.ts',
      'party/server.test.ts',
    ],
  },
})
