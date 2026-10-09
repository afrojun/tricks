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

/** The saved presets, each with an id no built-in and no earlier saved one has; anything malformed or colliding is dropped. */
function readSaved<R extends object>(game: RulesOf<R>, store: Store): Preset<R>[] {
  try {
    const raw: unknown = JSON.parse(store.getItem(presetsKey(game.id)) ?? '[]')
    if (!Array.isArray(raw)) return []
    const taken = new Set(game.rules.presets.map((p) => p.id))
    return raw.flatMap((item) => {
      const overrides = game.rules.schema.safeParse(item?.overrides)
      const name = typeof item?.name === 'string' ? cleanPresetName(item.name) : null
      if (!overrides.success || name === null || typeof item.id !== 'string' || taken.has(item.id)) return []
      taken.add(item.id)
      return [{ id: item.id, name, overrides: overrides.data, builtIn: false }]
    })
  } catch {
    return []
  }
}

/** False when storage is full or unavailable. */
function write<R extends object>(game: RulesOf<R>, store: Store, presets: Preset<R>[]): boolean {
  try {
    store.setItem(presetsKey(game.id), JSON.stringify(presets.map(({ id, name, overrides }) => ({ id, name, overrides }))))
    return true
  } catch {
    return false
  }
}

/** The game's built-ins first, then the presets saved for it on this device. */
export function listPresets<R extends object>(game: RulesOf<R>, store: Store = localStorage): Preset<R>[] {
  return [...game.rules.presets.map((p) => ({ ...p, builtIn: true })), ...readSaved(game, store)]
}

/** The saved preset, or null if it is unknown or a write fails. */
export function savePreset<R extends object>(game: RulesOf<R>, name: string, overrides: Partial<R>, store: Store = localStorage): Preset<R> | null {
  const clean = cleanPresetName(name)
  if (clean === null) return null
  const preset: Preset<R> = { id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, name: clean, overrides, builtIn: false }
  return write(game, store, [...readSaved(game, store), preset]) ? preset : null
}

/** Changes one saved preset in place. False for built-ins, unknown ids and a failed write. */
function change<R extends object>(game: RulesOf<R>, id: string, store: Store, edit: (preset: Preset<R>) => void): boolean {
  const saved = readSaved(game, store)
  const target = saved.find((p) => p.id === id)
  if (!target) return false
  edit(target)
  return write(game, store, saved)
}

/** Returns false for built-ins, unknown ids, empty names and a failed write. */
export function renamePreset<R extends object>(game: RulesOf<R>, id: string, name: string, store: Store = localStorage): boolean {
  const clean = cleanPresetName(name)
  if (clean === null) return false
  return change(game, id, store, (p) => (p.name = clean))
}

/** A saved preset's rules: `overrides` replaces what it held. False for built-ins, unknown ids and a failed write. */
export function updatePreset<R extends object>(game: RulesOf<R>, id: string, overrides: Partial<R>, store: Store = localStorage): boolean {
  return change(game, id, store, (p) => (p.overrides = overrides))
}

/** Returns false for built-ins, unknown ids and a failed write. */
export function deletePreset<R extends object>(game: RulesOf<R>, id: string, store: Store = localStorage): boolean {
  const saved = readSaved(game, store)
  if (!saved.some((p) => p.id === id)) return false
  return write(game, store, saved.filter((p) => p.id !== id))
}

/** Where this device keeps the id of the preset last chosen for a game, on its home or its rules screen. */
export function presetChoiceKey(game: string): string {
  return `tricks-${game}-preset`
}

/** The id of the preset last chosen, if it still exists; otherwise the first's. */
export function readChoice<R extends object>(game: RulesOf<R>, store: Store = localStorage): string {
  const presets = listPresets(game, store)
  let id: string | null = null
  try {
    id = store.getItem(presetChoiceKey(game.id))
  } catch {
    // Storage is off: the first preset.
  }
  return presets.find((p) => p.id === id)?.id ?? presets[0].id
}

/** Remembers the chosen preset. False if storage is full or off; the choice then lasts only as long as the page. */
export function writeChoice(game: string, id: string, store: Store = localStorage): boolean {
  try {
    store.setItem(presetChoiceKey(game), id)
    return true
  } catch {
    return false
  }
}
