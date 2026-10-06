import { useState } from 'react'
import { type RuleOverrides, type RuleSet, TRADITIONAL, diffRules, resolveRules } from '../games/thunee/engine'
import { RULE_INFO, type RuleInfo, differenceCount, isTraditional, sameOverrides, valueLabel } from '../presets/describe'
import { shareUrl } from '../presets/share'
import { type Preset, listPresets, savePreset } from '../presets/storage'
import { copyText } from './text'

/** One line saying which rules are in force. */
export function rulesSummary(rules: RuleSet): string {
  const preset = listPresets().find((p) => sameOverrides(p.overrides, diffRules(rules)))
  if (preset) return preset.name
  const n = differenceCount(rules)
  return `Traditional with ${n} house rule${n === 1 ? '' : 's'}`
}

/** Read-only list of every rule, with house rules marked. */
export function RulesList({ rules }: { rules: RuleSet }) {
  return (
    <dl className="grid gap-2">
      {RULE_INFO.map((info) => {
        const house = !isTraditional(info.key, rules)
        return (
          <div key={info.key} className="grid grid-cols-[1fr_auto] gap-x-3 items-baseline border-b border-line/40 pb-2">
            <dt>{info.label}</dt>
            <dd className="text-right font-semibold">{valueLabel(info, rules[info.key])}</dd>
            {house && (
              <p className="col-span-2 text-sm text-on-surface-muted">
                House rule. Traditional: {valueLabel(info, TRADITIONAL[info.key])}
              </p>
            )}
          </div>
        )
      })}
    </dl>
  )
}

function RuleControl({ info, rules, onChange }: { info: RuleInfo; rules: RuleSet; onChange: (patch: RuleOverrides) => void }) {
  const value = rules[info.key]
  if (info.choices) {
    return (
      <div className="flex flex-wrap gap-2">
        {info.choices.map((choice) => (
          <button
            key={String(choice.value)}
            className="btn btn-small"
            aria-pressed={choice.value === value}
            onClick={() => onChange({ [info.key]: choice.value })}
          >
            {choice.label}
          </button>
        ))}
      </div>
    )
  }
  const { min, max, unit } = info.range!
  const set = (n: number) => onChange({ [info.key]: Math.min(max, Math.max(min, n)) })
  return (
    <div className="flex items-center gap-2">
      <button className="btn btn-small" onClick={() => set((value as number) - 1)} aria-label={`Less ${info.label}`}>
        −
      </button>
      <span className="min-w-20 text-center font-semibold">
        {value as number} {unit}
      </span>
      <button className="btn btn-small" onClick={() => set((value as number) + 1)} aria-label={`More ${info.label}`}>
        +
      </button>
    </div>
  )
}

/** Preset picker plus per-rule controls. Calls `onChange` with the overrides to apply. */
export function RulesEditor({ rules, onChange }: { rules: RuleSet; onChange: (overrides: RuleOverrides) => void }) {
  const [presets, setPresets] = useState<Preset[]>(listPresets)
  const [name, setName] = useState('')
  const [copied, setCopied] = useState(false)
  const overrides = diffRules(rules)
  const active = presets.find((p) => sameOverrides(p.overrides, overrides))

  const save = () => {
    if (savePreset(name, overrides)) {
      setPresets(listPresets())
      setName('')
    }
  }
  const share = async () => {
    if (await copyText(shareUrl(active?.name ?? (name || 'House rules'), overrides))) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="grid gap-4">
      <div>
        <p className="mb-2 font-semibold">Start from a preset</p>
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <button key={preset.id} className="btn btn-small" aria-pressed={preset.id === active?.id} onClick={() => onChange(preset.overrides)}>
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3">
        {RULE_INFO.map((info) => (
          <div key={info.key} className="grid gap-1 border-b border-line/40 pb-3">
            <p>
              {info.label}
              {!isTraditional(info.key, rules) && <span className="text-on-surface-muted"> (house rule)</span>}
            </p>
            <RuleControl info={info} rules={rules} onChange={(patch) => onChange(diffRules(resolveRules({ ...overrides, ...patch })))} />
          </div>
        ))}
      </div>

      <div className="grid gap-2">
        {!active && (
          <div className="flex gap-2">
            <input className="field" placeholder="Name these rules" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
            <button className="btn btn-primary" onClick={save} disabled={name.trim() === ''}>
              Save preset
            </button>
          </div>
        )}
        <button className="btn" onClick={share}>
          {copied ? 'Link copied' : 'Copy link to these rules'}
        </button>
      </div>
    </div>
  )
}
