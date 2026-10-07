import { useState } from 'react'
import { resolve } from '../kit/rules'
import { SHARE_PARAM, decodeShare } from '../presets/share'
import { listPresets, savePreset } from '../presets/storage'
import { RulesList } from './Rules'
import { ThemePicker } from './ThemePicker'
import { CODE_LENGTH, cleanCode, practicePath, roomPath } from './routes'
import { countWord, playersLabel, teamsAt } from './seats'
import { navigate, useGameClient } from './session'
import { playSound } from './sound'

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // no I or O

export function newGameCode(): string {
  const values = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return [...values].map((v) => CODE_LETTERS[v % CODE_LETTERS.length]).join('')
}

/** The creator's choices from a game's home, which its lobby applies. */
export interface GameSetup {
  playerCount: number
  overrides: object
}

export function setupKey(game: string, code: string): string {
  return `tricks-${game}-setup-${code}`
}

function SharedRules({ code, onSaved }: { code: string; onSaved: () => void }) {
  const game = useGameClient()
  const decoded = decodeShare(game, code)
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
          <RulesList game={game} rules={resolve(game.rules.defaults, decoded.overrides)} />
        </div>
      </details>
      <button
        className="btn btn-primary"
        disabled={saved}
        onClick={() => {
          if (savePreset(game, decoded.name, decoded.overrides)) {
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

/** Larger tables first. */
const bySize = (counts: readonly number[]) => [...counts].sort((a, b) => b - a)

function LearnToPlay() {
  const game = useGameClient()
  const practice = game.practice
  const [saved] = useState(() => practice?.saved() ?? false)
  if (!practice) {
    return (
      <section className="panel p-4 w-full max-w-sm grid gap-3">
        <h2 className="display text-2xl">Learn to play</h2>
        <p>Practice games against the computer, with a coach, are coming to {game.name}.</p>
      </section>
    )
  }
  return (
    <section className="panel p-4 w-full max-w-sm grid gap-3">
      <h2 className="display text-2xl">Learn to play</h2>
      <p>Play against the computer with a coach who explains every move, gives hints, and warns you before a mistake.</p>
      {saved && (
        <button
          className="btn btn-primary"
          onClick={() => {
            playSound('tap')
            navigate(practicePath(game.id))
          }}
        >
          Continue practice
        </button>
      )}
      <div className="flex gap-2">
        {bySize(game.seatCounts).map((n, i) => (
          <button
            key={n}
            className={`btn flex-1 ${saved || i > 0 ? '' : 'btn-primary'}`}
            onClick={() => {
              playSound('tap')
              navigate(practicePath(game.id, n))
            }}
          >
            {saved ? `New: ${countWord(n).toLowerCase()} players` : `Practice with ${countWord(n).toLowerCase()}`}
          </button>
        ))}
      </div>
    </section>
  )
}

/** `/<game>`: a game's home. Create, join, presets, practice. */
export function Home() {
  const game = useGameClient()
  const [playerCount, setPlayerCount] = useState(() => bySize(game.seatCounts)[0])
  const [presets, setPresets] = useState(() => listPresets(game))
  const [presetId, setPresetId] = useState(presets[0].id)
  const [joinCode, setJoinCode] = useState('')
  const shared = new URLSearchParams(location.search).get(SHARE_PARAM)

  const create = () => {
    playSound('tap')
    const code = newGameCode()
    const overrides = presets.find((p) => p.id === presetId)?.overrides ?? {}
    sessionStorage.setItem(setupKey(game.id, code), JSON.stringify({ playerCount, overrides } satisfies GameSetup))
    navigate(roomPath(game.id, code))
  }

  return (
    <main className="min-h-full flex flex-col items-center gap-5 p-4 pb-10">
      <header className="text-center mt-8 mb-2">
        <h1 className="wordmark text-[4.6rem]">{game.name}</h1>
        <p className="font-semibold mt-3">{game.tagline}</p>
      </header>

      {shared !== null && (
        <div className="w-full max-w-sm">
          <SharedRules
            code={shared}
            onSaved={() => {
              const next = listPresets(game)
              setPresets(next)
              setPresetId(next[next.length - 1].id)
            }}
          />
        </div>
      )}

      <LearnToPlay />

      <section className="panel p-4 w-full max-w-sm grid gap-4">
        <h2 className="display text-2xl">New game</h2>
        {game.seatCounts.length > 1 && (
          <div className="grid gap-1">
            <span>Players</span>
            <div className="flex gap-2">
              {bySize(game.seatCounts).map((n) => (
                <button key={n} className="btn flex-1" aria-pressed={playerCount === n} onClick={() => setPlayerCount(n)}>
                  {playersLabel(teamsAt((seat, count) => game.lobbyTeams(seat, count), n))}
                </button>
              ))}
            </div>
          </div>
        )}
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
          if (joinCode.length === CODE_LENGTH) navigate(roomPath(game.id, joinCode))
        }}
      >
        <h2 className="display text-2xl">Join a game</h2>
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

      <section className="panel panel-info p-4 w-full max-w-sm grid gap-3">
        <h2 className="display text-2xl">Look</h2>
        <ThemePicker />
      </section>
    </main>
  )
}
