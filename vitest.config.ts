import { defineConfig } from 'vitest/config'
import { BaseSequencer, type TestSpecification } from 'vitest/node'
import { globSync, readFileSync } from 'node:fs'
import { getPriority, setPriority } from 'node:os'
import path from 'node:path'
import { SLOTS, slottedForks } from './scripts/test-slots.ts'

const TESTS = [
  'src/client/**/*.test.ts',
  'src/presets/**/*.test.ts',
  'src/practice/**/*.test.ts',
  'src/room/**/*.test.ts',
  'src/ui/**/*.test.ts',
  'src/kit/**/*.test.ts',
  'src/games/**/*.test.ts',
]
// A file that replaces a module with vi.mock needs every module afresh. The others share their worker's,
// which spares each file importing the games again: a sixth of the suite's work.
const MOCKING = globSync(TESTS, { cwd: import.meta.dirname }).filter((file) =>
  readFileSync(path.join(import.meta.dirname, file), 'utf8').includes('vi.mock('),
)
// The search player's own whole games, adapter and gate: a quarter of the suite's work for a player no game
// plays yet. `pnpm test` leaves them out, and `pnpm test:search` runs them.
const SEARCH = [
  'src/games/hearts/ai/search-games.test.ts',
  'src/games/hearts/ai/search.test.ts',
  'src/games/hearts/ai/gate/gate.test.ts',
]
// The files that take longest, longest first. Unless every file of a run has timings from an earlier run (a
// new worktree or CI has none), Vitest would start the largest files first and leave some of these to run
// alone at the end; they start first instead. `pnpm test:quick` leaves them out.
const SLOW = [
  'src/games/hearts/ai/search-games.test.ts',
  'src/games/hearts/simulation.test.ts',
  'src/games/spades/simulation.test.ts',
  'src/games/spades/ai/strength.test.ts',
  'src/games/thunee/ai/simulation.test.ts',
  'src/games/hearts/ai/simulation.test.ts',
  'src/kit/search/step.test.ts',
  'src/games/hearts/ai/search.test.ts',
  'src/games/hearts/ai/gate/gate.test.ts',
  'src/games/thunee/ai/personas.test.ts',
  'src/games/thunee/engine/step.test.ts',
  'src/games/hearts/ai/personas.test.ts',
]

class SlowFirst extends BaseSequencer {
  async sort(files: TestSpecification[]) {
    const sorted = await super.sort(files)
    const name = (spec: TestSpecification) => path.relative(this.ctx.config.root, spec.moduleId)
    if (sorted.every((spec) => this.ctx.cache.getFileTestResults(`${spec.project.name}:${name(spec)}`))) return sorted
    const rank = (spec: TestSpecification) => {
      const i = SLOW.indexOf(name(spec))
      return i === -1 ? SLOW.length : i
    }
    return sorted.sort((a, b) => rank(a) - rank(b))
  }
}

// Several worktrees often run the suite at once, and a worker per core each starved the machine. Off CI the
// runs share one budget of test slots, a file running only while it holds one (scripts/test-slots.ts), at a
// lower priority; a run alone takes every slot. A run that cannot use the slots, as in a sandbox, has three
// workers at that priority. CI has its machine to itself, and three workers. VITEST_MAX_WORKERS sets the
// workers either way.
const slots = process.env.CI ? null : slottedForks()
if (!process.env.CI) setPriority(Math.max(getPriority(), 10))

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  plugins: [
    {
      // Vitest passes no project the command line's --execArgv, with which a worker is profiled, nor its
      // --exclude: pass them on. Which files mock is read once, as the config loads, so a file that starts to
      // mock while Vitest watches would share its modules: watch mode isolates every file.
      name: 'command-line-to-projects',
      configureVitest({ vitest, project }) {
        project.config.execArgv = vitest.config.execArgv
        project.config.exclude = [...new Set([...project.config.exclude, ...(vitest.config.cliExclude ?? [])])]
        if (vitest.config.watch) project.config.isolate = true
      },
    },
  ],
  test: {
    // The simulations play whole games, and a machine busy with builds can take minutes over what
    // takes seconds on a quiet one: a failure should mean wrong, not slow.
    testTimeout: 300_000,
    hookTimeout: 300_000,
    pool: slots ?? 'forks',
    maxWorkers: slots ? SLOTS : 3,
    sequence: { sequencer: SlowFirst },
    // Keep transformed modules between runs, in node_modules/.vitest-cache: a fifth of a one-file run's work.
    fsModuleCache: true,
    // Each project lists its files: an include set here would be added to theirs.
    projects: [
      {
        extends: true,
        test: { name: 'shared', include: TESTS, exclude: [...MOCKING, ...(process.env.TEST_QUICK ? SLOW : []), ...(process.env.TEST_SEARCH ? [] : SEARCH)], isolate: false },
      },
      { extends: true, test: { name: 'isolated', include: MOCKING } },
    ],
  },
})
