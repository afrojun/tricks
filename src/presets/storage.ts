import type { RulesOf } from './book'

export interface Preset<R> {
  id: string
  name: string
  /** Only the settings that differ from the game's defaults. */
  overrides: Partial<R>
  builtIn: boolean
}

/** Where this device keeps a game's own presets. */
export function presetsKey(game: string): string {
  return `tricks-${game}-presets`
}

export const MAX_PRESET_NAME = 30

type Store = Pick<Storage, 'getItem' | 'setItem'>

export function cleanPresetName(raw: string): string | null {
  const name = [...raw.replace(/\s+/g, ' ').trim()].slice(0, MAX_PRESET_NAME).join('').trim()
  return name.length > 0 ? name : null
}

function readSaved<R extends object>(game: RulesOf<R>, store: Store): Preset<R>[] {
  try {
    const raw: unknown = JSON.parse(store.getItem(presetsKey(game.id)) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw.flatMap((item) => {
      const overrides = game.rules.schema.safeParse(item?.overrides)
      const name = typeof item?.name === 'string' ? cleanPresetName(item.name) : null
      if (!overrides.success || name === null || typeof item.id !== 'string') return []
      return [{ id: item.id, name, overrides: overrides.data, builtIn: false }]
    })
  } catch {
    return []
  }
}

function write<R extends object>(game: RulesOf<R>, store: Store, presets: Preset<R>[]): void {
  store.setItem(presetsKey(game.id), JSON.stringify(presets.map(({ id, name, overrides }) => ({ id, name, overrides }))))
}

/** The game's built-ins first, then the presets saved for it on this device. */
export function listPresets<R extends object>(game: RulesOf<R>, store: Store = localStorage): Preset<R>[] {
  return [...game.rules.presets.map((p) => ({ ...p, builtIn: true })), ...readSaved(game, store)]
}

export function savePreset<R extends object>(game: RulesOf<R>, name: string, overrides: Partial<R>, store: Store = localStorage): Preset<R> | null {
  const clean = cleanPresetName(name)
  if (clean === null) return null
  const preset: Preset<R> = { id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, name: clean, overrides, builtIn: false }
  try {
    write(game, store, [...readSaved(game, store), preset])
  } catch {
    return null // storage is full or unavailable
  }
  return preset
}

/** Returns false for built-ins, unknown ids and empty names. */
export function renamePreset<R extends object>(game: RulesOf<R>, id: string, name: string, store: Store = localStorage): boolean {
  const clean = cleanPresetName(name)
  const saved = readSaved(game, store)
  const target = saved.find((p) => p.id === id)
  if (!target || clean === null) return false
  target.name = clean
  write(game, store, saved)
  return true
}

export function deletePreset<R extends object>(game: RulesOf<R>, id: string, store: Store = localStorage): boolean {
  const saved = readSaved(game, store)
  if (!saved.some((p) => p.id === id)) return false
  write(game, store, saved.filter((p) => p.id !== id))
  return true
}
