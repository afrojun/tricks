/**
 * Test slots: one budget, for the whole machine, of test files running at once. Several worktrees often
 * run the suite together, and a worker per core each starved the machine.
 *
 * A slot is a file in $XDG_RUNTIME_DIR/test-slots, held with a lock that the kernel lets go of when its
 * process ends, however it ends: finished, failed, interrupted or killed. Vitest's workers here start a
 * test file only once they hold a slot, wait for one otherwise, and give it back when the file is done or
 * the worker dies, so the files of every run share the slots as they come. A slot is held for a file, not
 * for a run, so that a run of one file waits for a file of another run rather than all of it, and watch
 * mode holds none while it watches. TEST_SLOTS sets the budget, half the hardware threads by default;
 * every run on the machine must use the same number for it to hold.
 *
 * Runs take turns. A run that waits holds the gate, one more lock, and a free slot goes to the gate's
 * holder, or to anyone while nobody holds it; whoever takes a slot lets go of the gate. So a run that has
 * just finished a file cannot take its slot straight back from a run that waits for one. A run that has
 * waited a while takes a free slot without the gate, so a stopped process holding it slows the others
 * rather than stopping them. Vitest sends a run's only worker all its files at once, so a run of one worker
 * holds its slot for them all.
 *
 * Node has no flock. SQLite locks a database with the same kind of lock (fcntl), so each slot is an empty
 * database held in an exclusive transaction. A database that cannot be written, as in a sandbox, opens
 * read-only and takes locks that hold nothing: then, as without node:sqlite, the run goes without slots.
 *
 * Usage: pnpm test:slots, to see who holds the slots.
 */
import { EventEmitter } from 'node:events'
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { availableParallelism, tmpdir } from 'node:os'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { ForksPoolWorker, type PoolOptions, type PoolRunnerInitializer, type PoolWorker, type WorkerRequest } from 'vitest/node'

export const SLOTS = Number(process.env.TEST_SLOTS) || Math.max(1, Math.floor(availableParallelism() / 2))
const DIR = path.join(process.env.XDG_RUNTIME_DIR ?? tmpdir(), 'test-slots')
/** How often a waiting run tries the slots again. */
const POLL_MS = 10
/** How long a run waits on the gate's holder before it takes a free slot without the gate. */
const PATIENCE_MS = 100
const SQLITE_BUSY = 5

interface Lock {
  db: DatabaseSync
  /** Whether this process holds it. */
  held: boolean
}

interface Slot extends Lock {
  owner: string
}

interface Budget {
  slots: Slot[]
  gate: Lock
}

const waiting: { since: number; take: (slot: Slot) => void }[] = []
let poll: NodeJS.Timeout | undefined

/** The machine's slots and gate; throws if they cannot be written. */
function open(): Budget {
  const sqlite = process.getBuiltinModule('node:sqlite')
  if (!sqlite) throw new Error('this Node has no node:sqlite')
  mkdirSync(DIR, { recursive: true })
  const writable = (file: string) => {
    closeSync(openSync(file, 'a'))
    return file
  }
  const database = (file: string): Lock => ({ db: new sqlite.DatabaseSync(writable(file)), held: false })
  const budget = {
    slots: Array.from({ length: SLOTS }, (_, i) => ({ ...database(path.join(DIR, `${i}.db`)), owner: writable(path.join(DIR, `${i}.owner`)) })),
    gate: database(path.join(DIR, 'gate.db')),
  }
  // A lock also writes a journal beside its database, so the directory must be writable too. Tried by
  // making a file, since another run may hold every lock there is to try.
  const probe = path.join(DIR, `${process.pid}.probe`)
  closeSync(openSync(probe, 'w'))
  unlinkSync(probe)
  return budget
}

/** Whether this process got the lock; false if another process holds it. */
function lock({ db }: Lock): boolean {
  try {
    db.exec('BEGIN EXCLUSIVE')
    return true
  } catch (error) {
    if ((error as { errcode?: number }).errcode === SQLITE_BUSY) return false
    throw error
  }
}

/** Gives a lock back to every process on the machine, this one included. */
function unlock(lock: Lock) {
  lock.db.exec('ROLLBACK')
  lock.held = false
}

/**
 * A free slot, now held by this process, or null. Takes the gate first if it can, and keeps it while no
 * slot is free; a run that has `waited` long enough goes without it.
 */
function tryTake({ slots, gate }: Budget, waited: boolean): Slot | null {
  if (!gate.held) gate.held = lock(gate)
  if (!gate.held && !waited) return null
  for (const slot of slots) {
    if (slot.held || !lock(slot)) continue
    writeFileSync(slot.owner, process.cwd())
    slot.held = true
    if (gate.held) unlock(gate)
    return slot
  }
  return null
}

/** A slot, when this run's turn comes; its own waiters are served in order. Calls `wait` if it must wait. */
function take(budget: Budget, wait: () => void): Promise<Slot> {
  const slot = waiting.length === 0 ? tryTake(budget, false) : null
  if (slot) return Promise.resolve(slot)
  wait()
  return new Promise((resolve) => {
    waiting.push({ since: Date.now(), take: resolve })
    // One slot a try, so that the gate can pass to another run in between.
    poll ??= setInterval(() => {
      const slot = tryTake(budget, Date.now() - waiting[0].since >= PATIENCE_MS)
      if (slot) waiting.shift()!.take(slot)
      if (waiting.length > 0) return
      clearInterval(poll)
      poll = undefined
    }, POLL_MS).unref()
  })
}

/** The other processes' slots: for each worktree holding any, how many. */
function holders(slots: Slot[]): Map<string, number> {
  const held = new Map<string, number>()
  for (const slot of slots) {
    if (slot.held) continue
    if (lock(slot)) {
      unlock(slot)
      continue
    }
    const dir = readFileSync(slot.owner, 'utf8') || 'unknown'
    held.set(dir, (held.get(dir) ?? 0) + 1)
  }
  return held
}

/**
 * Vitest's forks pool, each test file holding a slot while it runs; null if the slots cannot be used.
 * A worker starts at once and waits for a slot before it is sent its file, so the wait counts against no
 * timeout and no file's duration.
 */
export function slottedForks(): PoolRunnerInitializer | null {
  let budget: Budget
  try {
    budget = open()
  } catch (error) {
    console.warn(`Running without test slots: ${(error as Error).message}`)
    return null
  }
  return { name: 'slots', createPoolWorker: (options) => new SlotWorker(budget, options) }
}

let told = false

class SlotWorker implements PoolWorker {
  readonly name = 'slots'
  private readonly worker: ForksPoolWorker
  /** The worker's messages pass through here, so that a cancelled wait can say its file is done. */
  private readonly messages = new EventEmitter()
  private slot: Slot | null = null
  /** The file this worker waits to run. */
  private next: Extract<WorkerRequest, { type: 'run' | 'collect' }> | null = null
  private readonly offCancel: () => void

  constructor(
    private readonly budget: Budget,
    private readonly options: PoolOptions,
  ) {
    this.worker = new ForksPoolWorker(options)
    // A cancelled run skips the file it waits to run, as Vitest's pool skips those it has not sent.
    this.offCancel = options.project.vitest.onCancel(() => {
      if (this.next === null) return
      options.project.vitest.state.cancelFiles(this.next.context.files, options.project)
      this.next = null
      this.messages.emit('message', { __vitest_worker_response__: true, type: 'testfileFinished' })
    })
  }

  get cacheFs() {
    return this.worker.cacheFs
  }

  on(event: string, callback: (...args: any[]) => void) {
    if (event === 'message') this.messages.on(event, callback)
    else this.worker.on(event, callback)
  }

  off(event: string, callback: (...args: any[]) => void) {
    if (event === 'message') this.messages.off(event, callback)
    else this.worker.off(event, callback)
  }

  send(message: WorkerRequest) {
    if (message.type !== 'run' && message.type !== 'collect') return this.worker.send(message)
    this.next = message
    take(this.budget, () => this.waiting()).then((slot) => {
      if (this.next !== message) return unlock(slot)
      this.next = null
      this.slot = slot
      this.worker.send(message)
    })
  }

  async start() {
    await this.worker.start()
    this.worker.on('message', this.relay)
    // Vitest never stops a worker that has died, so its slot is given back here.
    this.worker.on('exit', this.done)
  }

  async stop() {
    this.done()
    this.offCancel()
    await this.worker.stop()
  }

  deserialize(data: unknown) {
    return this.worker.deserialize(data)
  }

  private relay = (message: { __vitest_worker_response__?: true; type?: string }) => {
    if (message?.__vitest_worker_response__ && message.type === 'testfileFinished') this.free()
    this.messages.emit('message', message)
  }

  /** Gives back the slot, and any the worker waits for. */
  private done = () => {
    this.next = null
    this.free()
  }

  private free() {
    if (this.slot === null) return
    unlock(this.slot)
    this.slot = null
  }

  /** Says, once, that the run waits on others' slots before it can start a file, and whose they are. */
  private waiting() {
    if (told || this.budget.slots.some((slot) => slot.held)) return
    const held = holders(this.budget.slots)
    if (held.size === 0) return
    told = true
    const names = [...held].map(([dir, n]) => `${path.basename(dir)} ${n}`).join(', ')
    this.options.project.vitest.logger.log(`Waiting for one of the ${SLOTS} test slots, held by: ${names}. TEST_SLOTS sets how many.`)
  }
}

if (import.meta.main) {
  const held = holders(open().slots)
  console.log(`${[...held.values()].reduce((a, b) => a + b, 0)} of ${SLOTS} test slots held, in ${DIR}`)
  for (const [dir, n] of held) console.log(`  ${n}  ${dir}`)
}
