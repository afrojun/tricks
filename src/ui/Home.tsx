import { useState } from 'react'
import { type RuleOverrides, resolveRules } from '../engine'
import { SHARE_PARAM, decodeShare } from '../presets/share'
import { type Preset, listPresets, savePreset } from '../presets/storage'
import { RulesList } from './Rules'
import { ThemePicker } from './ThemePicker'
import { navigate } from './session'

const CODE_LENGTH = 6
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // no I or O

export function newGameCode(): string {
  const values = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return [...values].map((v) => CODE_LETTERS[v % CODE_LETTERS.length]).join('')
}

/** Room codes are letters only, upper-cased, whatever was typed or pasted. */
export function cleanCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, CODE_LENGTH)
}

export interface GameSetup {
  playerCount: 2 | 4
  overrides: RuleOverrides
}

export function setupKey(code: string): string {
  return `thunee-setup-${code}`
}

function SharedRules({ code, onSaved }: { code: string; onSaved: () => void }) {
  const decoded = decodeShare(code)
  const [saved, setSaved] = useState(false)
  if (!decoded.ok) {
    return (
      <section className="panel p-4" role="alert">
        <h2 className="display text-lg mb-1">Rules link</h2>
        <p>{decoded.error}</p>
      </section>
    )
  }
  return (
    <section className="panel p-4 grid gap-3">
      <h2 className="display text-lg">Shared rules: {decoded.name}</h2>
      <details>
        <summary className="cursor-pointer">See every rule</summary>
        <div className="mt-3">
          <RulesList rules={resolveRules(decoded.overrides)} />
        </div>
      </details>
      <button
        className="btn btn-primary"
        disabled={saved}
        onClick={() => {
          if (savePreset(decoded.name, decoded.overrides)) {
            setSaved(true)
            onSaved()
          }
        }}
      >
        {saved ? 'Saved to your presets' : 'Save as a preset'}
      </button>
    </section>
  )
}

export function Home() {
  const [playerCount, setPlayerCount] = useState<2 | 4>(4)
  const [presets, setPresets] = useState<Preset[]>(listPresets)
  const [presetId, setPresetId] = useState(presets[0].id)
  const [joinCode, setJoinCode] = useState('')
  const shared = new URLSearchParams(location.search).get(SHARE_PARAM)

  const create = () => {
    const code = newGameCode()
    const overrides = presets.find((p) => p.id === presetId)?.overrides ?? {}
    sessionStorage.setItem(setupKey(code), JSON.stringify({ playerCount, overrides } satisfies GameSetup))
    navigate(`/game/${code}`)
  }

  return (
    <main className="min-h-full flex flex-col items-center gap-5 p-4 pb-10">
      <header className="text-center mt-6">
        <h1 className="display text-7xl text-accent">Thunee</h1>
        <p className="text-muted mt-2">Jack high, twelve balls to win.</p>
      </header>

      {shared !== null && (
        <div className="w-full max-w-sm">
          <SharedRules
            code={shared}
            onSaved={() => {
              const next = listPresets()
              setPresets(next)
              setPresetId(next[next.length - 1].id)
            }}
          />
        </div>
      )}

      <section className="panel p-4 w-full max-w-sm grid gap-4">
        <h2 className="display text-lg">New game</h2>
        <div className="grid gap-1">
          <span>Players</span>
          <div className="flex gap-2">
            {([4, 2] as const).map((n) => (
              <button key={n} className="btn flex-1" aria-pressed={playerCount === n} onClick={() => setPlayerCount(n)}>
                {n === 4 ? 'Four, in pairs' : 'Two'}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-1">
          <span>Rules</span>
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <button key={preset.id} className="btn btn-small" aria-pressed={preset.id === presetId} onClick={() => setPresetId(preset.id)}>
                {preset.name}
              </button>
            ))}
          </div>
          <p className="text-sm text-on-surface-muted">You can change individual rules in the lobby.</p>
        </div>
        <button className="btn btn-primary" onClick={create}>
          Create game
        </button>
      </section>

      <form
        className="panel p-4 w-full max-w-sm grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (joinCode.length === CODE_LENGTH) navigate(`/game/${joinCode}`)
        }}
      >
        <h2 className="display text-lg">Join a game</h2>
        <label className="grid gap-1">
          <span>Game code</span>
          <input
            className="field text-center tracking-[0.3em]"
            value={joinCode}
            onChange={(e) => setJoinCode(cleanCode(e.target.value))}
            placeholder="ABCDEF"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            aria-describedby="code-help"
          />
          <span id="code-help" className="text-sm text-on-surface-muted">
            Six letters from whoever created the game.
          </span>
        </label>
        <button className="btn btn-primary" disabled={joinCode.length !== CODE_LENGTH}>
          Join game
        </button>
      </form>

      <section className="panel p-4 w-full max-w-sm grid gap-3">
        <h2 className="display text-lg">Look</h2>
        <ThemePicker />
      </section>
    </main>
  )
}
