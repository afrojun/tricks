import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    // The simulations play whole games, and a machine busy with builds can take minutes over what
    // takes seconds on a quiet one: a failure should mean wrong, not slow.
    testTimeout: 300_000,
    hookTimeout: 300_000,
    include: [
      'src/client/**/*.test.ts',
      'src/presets/**/*.test.ts',
      'src/practice/**/*.test.ts',
      'src/room/**/*.test.ts',
      'src/ui/**/*.test.ts',
      'src/kit/**/*.test.ts',
      'src/games/**/*.test.ts',
    ],
  },
})
