/**
 * How much code each piece took: lines that are not blank and not comments, per top-level declaration.
 *   ./node_modules/.bin/tsx src/spike/search/count-lines.ts
 */
import { readFileSync } from 'node:fs'

const isCode = (line: string) => !/^\s*($|\/\/|\/\*\*|\*)/.test(line)

function declarations(file: string): { name: string; lines: number }[] {
  const text = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8').split('\n')
  const out: { name: string; lines: number }[] = []
  let current: { name: string; lines: number } | null = null
  for (const line of text) {
    const start = line.match(/^(?:export )?(?:async )?(?:function|interface|type|const|let) (\w+)/)
    if (start || /^import /.test(line)) {
      current = { name: start ? start[1] : 'imports', lines: 0 }
      const last = out.at(-1)
      if (current.name === 'imports' && last?.name === 'imports') current = last
      else out.push(current)
    }
    if (current && isCode(line)) current.lines++
  }
  return out
}

for (const file of ['rebuild.ts', 'sample.ts', 'early.ts', 'search.ts', 'applyInPlace.ts']) {
  const parts = declarations(file)
  const total = parts.reduce((a, p) => a + p.lines, 0)
  console.log(`${file}: ${total} code lines (${parts.map((p) => `${p.name} ${p.lines}`).join(', ')})`)
}
