/** Runs one script as several child processes over disjoint seeds and gathers what each prints on its last line. */
import { spawn } from 'node:child_process'

export function inChild(): { shard: number; of: number } | null {
  const i = process.argv.indexOf('--shard')
  if (i === -1) return null
  return { shard: Number(process.argv[i + 1]), of: Number(process.argv[i + 2]) }
}

export async function runShards<T>(script: string, argv: string[], shards: number): Promise<T[]> {
  const runs = Array.from({ length: shards }, (_, shard) =>
    new Promise<T>((resolve, reject) => {
      const child = spawn(process.execPath, [...process.execArgv, script, ...argv, '--shard', String(shard), String(shards)], {
        stdio: ['ignore', 'pipe', 'inherit'],
      })
      let out = ''
      child.stdout.on('data', (d) => (out += d))
      child.on('exit', (code) => {
        if (code !== 0) return reject(new Error(`shard ${shard} exited ${code}`))
        const last = out.trim().split('\n').at(-1)!
        resolve(JSON.parse(last) as T)
      })
    }),
  )
  return Promise.all(runs)
}
