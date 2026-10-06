import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
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
