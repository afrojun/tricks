import { globSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The copy style's typography (docs/superpowers/specs/2026-10-10-copy-style-design.md, rule 10), held where
 * the words are written: the shell, practice, presets, and each game's screens, coach, drills and client.
 */
const ROOT = path.resolve(import.meta.dirname, '../..')
const COPY = [
  'src/App.tsx',
  'src/ui/**/*.{ts,tsx}',
  'src/practice/**/*.{ts,tsx}',
  'src/presets/**/*.{ts,tsx}',
  'src/games/*/ui/**/*.{ts,tsx}',
  'src/games/*/coach/**/*.{ts,tsx}',
  'src/games/*/{drills,client,practice}.ts',
]
const files = globSync(COPY, { cwd: ROOT }).filter((file) => !/\.test\.tsx?$/.test(file))

/** A file's lines without their comments: blocks (JSX's too) kept as blank lines, so line numbers hold. */
function codeLines(text: string): string[] {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ''))
    .split('\n')
    .map((line) => (line.trim().startsWith('//') ? '' : line.replace(/\s\/\/\s.*$/, '')))
}

/** A straight apostrophe between letters, or after a name built into a template ("${name}'s"). */
const STRAIGHT = /[A-Za-z}](?:\\)?'[a-z]/

describe('copy', () => {
  it('reads copy from its files', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('uses curly apostrophes', () => {
    const straight = files.flatMap((file) =>
      codeLines(readFileSync(path.join(ROOT, file), 'utf8')).flatMap((line, i) => (STRAIGHT.test(line) ? [`${file}:${i + 1}: ${line.trim()}`] : [])),
    )
    expect(straight).toEqual([])
  })
})
