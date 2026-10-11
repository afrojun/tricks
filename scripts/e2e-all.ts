/**
 * Runs the browser scripts `E2E_JOBS` at a time, three by default: each makes rooms of its own and keeps its own
 * storage, so they never meet. A script's output is printed whole when it ends, with how long it took, and the
 * run fails if any script does. A script still running after `E2E_TIMEOUT` seconds (300 by default) is stopped,
 * its browser with it, and fails; stopping the runner stops every script it started. Needs `pnpm dev`.
 * Usage: pnpm e2e [script ...] (names without `.ts`: all of them by default)
 */
import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import path from 'node:path'

/** Longest first, so the long ones do not start last and run alone. */
const ALL = ['e2e-spades', 'e2e', 'e2e-hearts', 'e2e-drills', 'e2e-practice', 'e2e-two', 'e2e-controls']
const names = process.argv.slice(2)
const unknown = names.filter((name) => !ALL.includes(name))
const queue = names.length > 0 ? [...names] : [...ALL]
const jobs = Math.max(1, Number(process.env.E2E_JOBS ?? 3) || 1)
const timeoutMs = Math.max(1, Number(process.env.E2E_TIMEOUT ?? 300) || 300) * 1000
const running = new Set<ChildProcess>()
const failed: string[] = []
let stopping = false

/**
 * Stops a script and everything it started. Its browser runs in a process group of its own, so the script's
 * group is not enough: every process descended from it goes too.
 */
function stop(child: ChildProcess) {
  if (child.pid === undefined) return
  const parents = new Map<number, number[]>()
  for (const line of execFileSync('ps', ['-A', '-o', 'pid=,ppid=']).toString().trim().split('\n')) {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number)
    parents.set(ppid, [...(parents.get(ppid) ?? []), pid])
  }
  const doomed = [child.pid]
  for (let i = 0; i < doomed.length; i++) doomed.push(...(parents.get(doomed[i]) ?? []))
  for (const pid of doomed) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // Already gone.
    }
  }
}

function run(name: string): Promise<void> {
  const began = Date.now()
  return new Promise((resolve) => {
    const file = path.join(import.meta.dirname, `${name}.ts`)
    const child = spawn(process.execPath, ['--import', 'tsx', file], { stdio: ['ignore', 'pipe', 'pipe'] })
    running.add(child)
    const output: Buffer[] = []
    child.stdout?.on('data', (chunk: Buffer) => output.push(chunk))
    child.stderr?.on('data', (chunk: Buffer) => output.push(chunk))
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      stop(child)
    }, timeoutMs)
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      running.delete(child)
      const seconds = Math.round((Date.now() - began) / 1000)
      const passed = code === 0 && !timedOut
      if (!passed) failed.push(name)
      const how = passed ? 'passed' : timedOut ? `stopped after ${timeoutMs / 1000}s` : `failed (${signal ?? `exit ${code}`})`
      console.log(`\n── ${name}: ${how} in ${seconds}s ──`)
      // Chromium's own complaints (GPU stalls and the like) are left out: they say nothing of the app.
      const lines = Buffer.concat(output).toString().split('\n')
      console.log(lines.filter((line) => !/^\[pid=\d+\]/.test(line)).join('\n').trimEnd())
      resolve()
    })
  })
}

async function worker(): Promise<void> {
  for (let name = queue.shift(); name !== undefined && !stopping; name = queue.shift()) await run(name)
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => {
    stopping = true
    for (const child of running) stop(child)
    process.exitCode = 1
  })
}

if (unknown.length > 0) {
  console.error(`No browser script named ${unknown.join(', ')}. They are: ${ALL.join(', ')}.`)
  process.exitCode = 2
} else {
  const started = Date.now()
  await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, worker))
  const total = Math.round((Date.now() - started) / 1000)
  console.log(`\n${failed.length === 0 ? 'Every script passed' : `Failed: ${failed.join(', ')}`}, in ${total}s.`)
  process.exitCode = failed.length === 0 ? 0 : 1
}
