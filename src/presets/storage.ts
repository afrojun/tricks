import { type RuleOverrides, CLASSIC_APP_OVERRIDES, ruleOverridesSchema } from '../engine'

export interface Preset {
  id: string
  name: string
  /** Only the settings that differ from Traditional. */
  overrides: RuleOverrides
  builtIn: boolean
}

export const BUILT_IN_PRESETS: Preset[] = [
  { id: 'traditional', name: 'Traditional', overrides: {}, builtIn: true },
  { id: 'classic-app', name: 'Classic app', overrides: CLASSIC_APP_OVERRIDES, builtIn: true },
]

const KEY = 'thunee-presets'
export const MAX_PRESET_NAME = 30

type Store = Pick<Storage, 'getItem' | 'setItem'>

export function cleanPresetName(raw: string): string | null {
  const name = [...raw.replace(/\s+/g, ' ').trim()].slice(0, MAX_PRESET_NAME).join('').trim()
  return name.length > 0 ? name : null
}

function readSaved(store: Store): Preset[] {
  try {
    const raw: unknown = JSON.parse(store.getItem(KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw.flatMap((item) => {
      const overrides = ruleOverridesSchema.safeParse(item?.overrides)
      const name = typeof item?.name === 'string' ? cleanPresetName(item.name) : null
      if (!overrides.success || name === null || typeof item.id !== 'string') return []
      return [{ id: item.id, name, overrides: overrides.data, builtIn: false }]
    })
  } catch {
    return []
  }
}

function write(store: Store, presets: Preset[]): void {
  store.setItem(KEY, JSON.stringify(presets.map(({ id, name, overrides }) => ({ id, name, overrides }))))
}

/** Built-ins first, then the presets saved on this device. */
export function listPresets(store: Store = localStorage): Preset[] {
  return [...BUILT_IN_PRESETS, ...readSaved(store)]
}

export function savePreset(name: string, overrides: RuleOverrides, store: Store = localStorage): Preset | null {
  const clean = cleanPresetName(name)
  if (clean === null) return null
  const preset: Preset = { id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, name: clean, overrides, builtIn: false }
  try {
    write(store, [...readSaved(store), preset])
  } catch {
    return null // storage is full or unavailable
  }
  return preset
}

/** Returns false for built-ins, unknown ids and empty names. */
export function renamePreset(id: string, name: string, store: Store = localStorage): boolean {
  const clean = cleanPresetName(name)
  const saved = readSaved(store)
  const target = saved.find((p) => p.id === id)
  if (!target || clean === null) return false
  target.name = clean
  write(store, saved)
  return true
}

export function deletePreset(id: string, store: Store = localStorage): boolean {
  const saved = readSaved(store)
  if (!saved.some((p) => p.id === id)) return false
  write(store, saved.filter((p) => p.id !== id))
  return true
}
