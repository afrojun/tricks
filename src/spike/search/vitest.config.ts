import { defineConfig } from 'vitest/config'

/** The spike's own tests: `./node_modules/.bin/vitest run --config src/spike/search/vitest.config.ts` */
export default defineConfig({
  test: { include: ['src/spike/search/**/*.test.ts'], testTimeout: 600_000 },
})
