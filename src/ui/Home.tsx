import { useEffect, useLayoutEffect, useState } from 'react'
import { SHARE_PARAM } from '../presets/share'
import { listPresets, presetsKey, readChoice, writeChoice } from '../presets/storage'
import { GameStrip } from './GameStrip'
import { Link } from './Link'
import { CODE_LENGTH, cleanCode, practicePath, roomPath, rulesPath } from './routes'
import { countWord, playersLabel, teamsAt } from './seats'
import { navigate, replaceAddress, useGameClient } from './session'
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

/**
 * A practice button's label. One table size: "Practice", or "Start over" beside "Continue practice".
 * Several: the size alone, since the panel already says what it is, so the buttons share a row
 * at phone width without wrapping.
 */
export function practiceLabel(players: number, several: boolean, saved: boolean): string {
  const size = countWord(players).toLowerCase()
  if (!several) return saved ? 'Start over' : 'Practice'
  return saved ? `New: ${size}` : `${countWord(players)} players`
}

/** Larger tables first. */
const bySize = (counts: readonly number[]) => [...counts].sort((a, b) => b - a)

function LearnToPlay() {
  const game = useGameClient()
  const practice = game.practice
  const [saved] = useState(() => practice?.saved() ?? false)
  if (!practice) {
    return (
      <section className="panel p-4 grid gap-3">
        <h2 className="display text-xl">Learn to play</h2>
        <p>Practice games against the computer, with a coach, are coming to {game.name}.</p>
      </section>
    )
  }
  return (
    <section className="panel p-4 grid gap-3">
      <h2 className="display text-xl">Learn to play</h2>
      {/* A returning learner knows what practice is; the line it saves keeps the page on one screen. */}
      {!saved && <p>Against the computer, with a coach who explains every move.</p>}
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
            {practiceLabel(n, game.seatCounts.length > 1, saved)}
          </button>
        ))}
      </div>
    </section>
  )
}

/** `/<game>`: a game's home. Practice, create, join, a preset to create with, and the way to Tricks, the house rules and the other games. */
export function Home() {
  const game = useGameClient()
  const [playerCount, setPlayerCount] = useState(() => bySize(game.seatCounts)[0])
  const [presets, setPresets] = useState(() => listPresets(game))
  const [presetId, setPresetId] = useState(() => readChoice(game))
  const [joinCode, setJoinCode] = useState('')
  // A preset that is gone, here or in another tab, falls back to the first.
  const preset = presets.find((p) => p.id === presetId) ?? presets[0]

  // A share link (`/<game>?rules=<code>`) is the rules screen's to show.
  useLayoutEffect(() => {
    const shared = new URLSearchParams(location.search).get(SHARE_PARAM)
    if (shared !== null) replaceAddress(rulesPath(game.id, { shared }))
  }, [game])
  // Another tab may change the presets.
  useEffect(() => {
    const reread = (e: StorageEvent) => e.key === presetsKey(game.id) && setPresets(listPresets(game))
    addEventListener('storage', reread)
    return () => removeEventListener('storage', reread)
  }, [game])

  const choose = (id: string) => {
    setPresetId(id)
    writeChoice(game.id, id)
  }
  const create = () => {
    playSound('tap')
    // The preset as saved now, which the lobby applies once, for its creator.
    const now = listPresets(game)
    const overrides = (now.find((p) => p.id === presetId) ?? now[0]).overrides
    const code = newGameCode()
    sessionStorage.setItem(setupKey(game.id, code), JSON.stringify({ playerCount, overrides } satisfies GameSetup))
    navigate(roomPath(game.id, code))
  }

  return (
    <main className="min-h-full flex flex-col items-center gap-3 p-4">
      <TopBar
        left={<TricksLink />}
        right={
          <Link href={rulesPath(game.id)} className="btn btn-quiet btn-small">
            House rules
          </Link>
        }
      />
      <header className="text-center">
        <h1 className="wordmark text-[4.2rem] md:text-[6rem]">{game.name}</h1>
        <p className="font-semibold mt-1">{game.tagline}</p>
      </header>

      {/* One column on a phone; from md, Learn and Play side by side, the rest across both. */}
      <div className="home-width grid gap-3 md:grid-cols-2 md:gap-4 md:items-start">
      <LearnToPlay />

      <section className="panel p-4 grid gap-3">
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
            {presets.map((p) => (
              <button key={p.id} className="btn btn-small" aria-pressed={p.id === preset.id} onClick={() => choose(p.id)}>
                {p.name}
              </button>
            ))}
            <Link href={rulesPath(game.id, { preset: preset.id })} className="btn btn-small btn-quiet">
              Edit…
            </Link>
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
      </div>
    </main>
  )
}
