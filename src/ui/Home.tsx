import { useState } from 'react'
import { resolve } from '../kit/rules'
import { SHARE_PARAM, decodeShare } from '../presets/share'
import { listPresets, savePreset } from '../presets/storage'
import { GameStrip } from './GameStrip'
import { RulesList, RulesSheet } from './Rules'
import { CODE_LENGTH, cleanCode, practicePath, roomPath } from './routes'
import { countWord, playersLabel, teamsAt } from './seats'
import { navigate, useGameClient } from './session'
import { playSound } from './sound'
import { TopBar, TricksLink } from './TopBar'

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
        <h2 className="display text-xl">Learn to play</h2>
        <p>Practice games against the computer, with a coach, are coming to {game.name}.</p>
      </section>
    )
  }
  return (
    <section className="panel p-4 w-full max-w-sm grid gap-3">
      <h2 className="display text-xl">Learn to play</h2>
      <p>Against the computer, with a coach who explains every move.</p>
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

/** `/<game>`: a game's home. Practice, create, join, presets, and the way to Tricks and its other games. */
export function Home() {
  const game = useGameClient()
  const [playerCount, setPlayerCount] = useState(() => bySize(game.seatCounts)[0])
  const [presets, setPresets] = useState(() => listPresets(game))
  const [presetId, setPresetId] = useState(presets[0].id)
  const [joinCode, setJoinCode] = useState('')
  const [rules, setRules] = useState(false)
  const shared = new URLSearchParams(location.search).get(SHARE_PARAM)
  const overrides = presets.find((p) => p.id === presetId)?.overrides ?? {}

  const create = () => {
    playSound('tap')
    const code = newGameCode()
    sessionStorage.setItem(setupKey(game.id, code), JSON.stringify({ playerCount, overrides } satisfies GameSetup))
    navigate(roomPath(game.id, code))
  }

  return (
    <main className="min-h-full flex flex-col items-center gap-3 p-4">
      <TopBar
        left={<TricksLink />}
        right={
          <button className="btn btn-quiet btn-small" onClick={() => setRules(true)}>
            House rules
          </button>
        }
      />
      {rules && <RulesSheet game={game} rules={resolve(game.rules.defaults, overrides)} title="House rules" onClose={() => setRules(false)} />}
      <header className="text-center">
        <h1 className="wordmark text-[4.2rem]">{game.name}</h1>
        <p className="font-semibold mt-1">{game.tagline}</p>
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

      <section className="panel p-4 w-full max-w-sm grid gap-3">
        <h2 className="display text-xl">Play with friends</h2>
        {game.seatCounts.length > 1 && (
          <div className="grid gap-1">
            <span>Players</span>
            <div className="flex gap-2">
              {bySize(game.seatCounts).map((n) => (
                <button key={n} className="btn btn-small flex-1" aria-pressed={playerCount === n} onClick={() => setPlayerCount(n)}>
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
        </div>
        <button className="btn btn-primary" onClick={create}>
          Create game
        </button>
        <form
          className="grid gap-1 border-t-2 border-dashed border-line/40 pt-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (joinCode.length === CODE_LENGTH) navigate(roomPath(game.id, joinCode))
          }}
        >
          <label htmlFor="join-code">Or join with a code</label>
          <div className="flex gap-2">
            <input
              id="join-code"
              className="field text-center tracking-[0.3em]"
              value={joinCode}
              onChange={(e) => setJoinCode(cleanCode(e.target.value))}
              placeholder="ABCDEF"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              aria-describedby="code-help"
            />
            <button className="btn" disabled={joinCode.length !== CODE_LENGTH}>
              Join
            </button>
          </div>
          <span id="code-help" className="sr-only">
            Six letters from whoever created the game.
          </span>
        </form>
      </section>

      <GameStrip current={game.id} />
    </main>
  )
}
