import { useState } from 'react'
import { diff } from '../kit/rules'
import { type RuleInfo, type RulesOf, defaultsName, differenceCount, isDefault, sameOverrides, typedNumber, valueLabel, withRule } from '../presets/book'
import { shareUrl } from '../presets/share'
import { type Preset, listPresets, savePreset } from '../presets/storage'
import { Sheet } from './Sheet'
import { copyText } from './text'

/** One line saying which rules are in force. */
export function rulesSummary<R extends object>(game: RulesOf<R>, rules: R): string {
  const preset = listPresets(game).find((p) => sameOverrides(game.rules, p.overrides, diff(game.rules.defaults, rules)))
  if (preset) return preset.name
  const n = differenceCount(game.rules, rules)
  return `${defaultsName(game.rules)} with ${n} house rule${n === 1 ? '' : 's'}`
}

/** Read-only list of every rule, with house rules marked. */
export function RulesList<R extends object>({ game, rules }: { game: RulesOf<R>; rules: R }) {
  const book = game.rules
  return (
    <dl className="grid gap-2">
      {book.info.map((info) => {
        const house = !isDefault(book, info.key, rules)
        return (
          <div key={String(info.key)} className="grid grid-cols-[1fr_auto] gap-x-3 items-baseline border-b border-line/40 pb-2">
            <dt>{info.label}</dt>
            <dd className="text-right font-semibold">{valueLabel(info, rules[info.key])}</dd>
            {house && (
              <p className="col-span-2 text-sm text-on-surface-muted">
                House rule. {defaultsName(book)}: {valueLabel(info, book.defaults[info.key])}
              </p>
            )}
          </div>
        )
      })}
    </dl>
  )
}

/** The rules in force at a table, for its menu. */
export function RulesSheet<R extends object>({ game, rules, onClose }: { game: RulesOf<R>; rules: R; onClose: () => void }) {
  return (
    <Sheet title="Rules in this game" onClose={onClose}>
      <p className="mb-3">{rulesSummary(game, rules)}</p>
      <RulesList game={game} rules={rules} />
    </Sheet>
  )
}

function RuleControl<R extends object>({ info, rules, onChange }: { info: RuleInfo<R>; rules: R; onChange: (patch: Partial<R>) => void }) {
  const value = rules[info.key]
  if (info.choices) {
    return (
      <div className="flex flex-wrap gap-2">
        {info.choices.map((choice) => (
          <button
            key={String(choice.value)}
            className="btn btn-small"
            aria-pressed={choice.value === value}
            onClick={() => onChange({ [info.key]: choice.value } as Partial<R>)}
          >
            {choice.label}
          </button>
        ))}
      </div>
    )
  }
  const range = info.range!
  const { min, max, unit, step = 1 } = range
  const set = (n: number) => onChange({ [info.key]: Math.min(max, Math.max(min, n)) } as Partial<R>)
  // Any whole number in the range can be typed; − and + move by the rule's step.
  const commit = (input: HTMLInputElement) => {
    const n = typedNumber(range, input.value)
    if (n !== null && n !== value) set(n)
    else input.value = String(value)
  }
  return (
    <div className="flex items-center gap-2">
      <button className="btn btn-small" onClick={() => set((value as number) - step)} aria-label={`Less ${info.label}`}>
        −
      </button>
      <span className="w-24 shrink-0">
        <input
          key={value as number}
          className="field text-center"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          defaultValue={value as number}
          aria-label={info.label}
          onBlur={(e) => commit(e.currentTarget)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </span>
      <span>{unit}</span>
      <button className="btn btn-small" onClick={() => set((value as number) + step)} aria-label={`More ${info.label}`}>
        +
      </button>
    </div>
  )
}

/** Preset picker plus per-rule controls. Calls `onChange` with the overrides to apply. */
export function RulesEditor<R extends object>({ game, rules, onChange }: { game: RulesOf<R>; rules: R; onChange: (overrides: Partial<R>) => void }) {
  const book = game.rules
  const [presets, setPresets] = useState<Preset<R>[]>(() => listPresets(game))
  const [name, setName] = useState('')
  const [copied, setCopied] = useState(false)
  const overrides = diff(book.defaults, rules)
  const active = presets.find((p) => sameOverrides(book, p.overrides, overrides))

  const save = () => {
    if (savePreset(game, name, overrides)) {
      setPresets(listPresets(game))
      setName('')
    }
  }
  const share = async () => {
    if (await copyText(shareUrl(game, active?.name ?? (name || 'House rules'), overrides))) {
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
        {book.info.map((info) => (
          <div key={String(info.key)} className="grid gap-1 border-b border-line/40 pb-3">
            <p>
              {info.label}
              {!isDefault(book, info.key, rules) && <span className="text-on-surface-muted"> (house rule)</span>}
            </p>
            <RuleControl info={info} rules={rules} onChange={(patch) => onChange(withRule(book, rules, patch))} />
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
