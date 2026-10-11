import { useLayoutEffect, useState } from 'react'
import type { TableSettings } from '../kit/table'
import { SHARE_PARAM } from '../presets/share'
import { listPresets, readChoice } from '../presets/storage'
import { GameStrip } from './GameStrip'
import { readSettings } from './tableSettings'
import { Link } from './Link'
import { CODE_LENGTH, cleanCode, drillPath, drillsQuery, gamePath, practicePath, roomPath, rulesPath } from './routes'
import { countWord } from './seats'
import { navigate, replaceAddress, useGameClient } from './session'
import { Sheet } from './Sheet'
import { playSound } from './sound'
import { TopBar, TricksLink } from './TopBar'
import { YourGames } from './YourGames'

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // no I or O

export function newGameCode(): string {
  const values = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return [...values].map((v) => CODE_LETTERS[v % CODE_LETTERS.length]).join('')
}

/** The creator's choices from a game's home, which its lobby applies. */
export interface GameSetup {
  playerCount: number
  overrides: object
  settings: TableSettings
}

export function setupKey(game: string, code: string): string {
  return `tricks-${game}-setup-${code}`
}

/** The table size a host last chose in a lobby, which the next room they create starts with. */
export function playersKey(game: string): string {
  return `tricks-${game}-players`
}

function readPlayers(game: string, counts: readonly number[]): number {
  try {
    const n = Number(localStorage.getItem(playersKey(game)))
    if (counts.includes(n)) return n
  } catch {
    // Storage is off: the largest table.
  }
  return bySize(counts)[0]
}

/**
 * A practice button's label. One table size: "Practice", or "Start over" beside "Continue practice".
 * Several: the size alone, since the panel already says what it is, so the buttons share a row
 * at phone width without wrapping.
 */
export function practiceLabel(players: number, several: boolean, saved: boolean): string {
  const size = countWord(players).toLowerCase()
  if (!several) return saved ? 'Start over' : 'Practice'
  return saved ? `Start ${size}` : `${countWord(players)} players`
}

/** Larger tables first. */
const bySize = (counts: readonly number[]) => [...counts].sort((a, b) => b - a)

function LearnToPlay() {
  const game = useGameClient()
  const practice = game.practice
  const [saved] = useState(() => practice?.saved() ?? false)
  // `/<game>?drills`, where a drill's "All drills" leads, opens the list.
  const [drillsOpen, setDrillsOpen] = useState(() => drillsQuery(location.search))
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
      {/* "Drills…" on the heading's line, as "Edit…" is on the rules', so the page keeps to one screen. */}
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="display text-xl">Learn to play</h2>
        {practice.drills.length > 0 && (
          <button className="font-semibold underline underline-offset-2" onClick={() => setDrillsOpen(true)}>
            Drills…
          </button>
        )}
      </div>
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
      {drillsOpen && (
        <DrillsSheet
          onClose={() => {
            setDrillsOpen(false)
            if (drillsQuery(location.search)) history.replaceState(null, '', gamePath(game.id))
          }}
        />
      )}
    </section>
  )
}

/** Every drill of the game, ticked once passed on this device. */
function DrillsSheet({ onClose }: { onClose: () => void }) {
  const game = useGameClient()
  const practice = game.practice!
  const [passed] = useState(() => practice.passed())
  return (
    <Sheet title="Drills" onClose={onClose}>
      <div className="grid gap-3">
        <p>One moment of the game, set up for you to practise one rule, with the coach beside you.</p>
        <ul className="grid gap-2">
          {practice.drills.map((d) => (
            <li key={d.id}>
              <button
                className="btn w-full text-left"
                onClick={() => {
                  playSound('tap')
                  navigate(drillPath(game.id, d.id))
                }}
              >
                {/* The text takes the row, so every title starts at the same edge: `.btn` centres what it holds. */}
                <span className="grid flex-1">
                  <span>{d.title}</span>
                  <span className="text-sm font-normal text-on-surface-muted">{d.summary}</span>
                </span>
                {passed.has(d.id) && <span aria-label="Passed">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  )
}

/**
 * `/<game>`: a game's home. Practice, create and join, and the way to Tricks, the house rules and the other games.
 * A new room starts on the table size and rules its creator last chose in a lobby, where they are chosen.
 */
export function Home() {
  const game = useGameClient()
  const [joinCode, setJoinCode] = useState('')

  // A share link (`/<game>?rules=<code>`) is the rules screen's to show.
  useLayoutEffect(() => {
    const shared = new URLSearchParams(location.search).get(SHARE_PARAM)
    if (shared !== null) replaceAddress(rulesPath(game.id, { shared }))
  }, [game])

  const create = () => {
    playSound('tap')
    // The preset and size as saved now, which the lobby applies once, for its creator.
    const presets = listPresets(game)
    const choice = readChoice(game)
    const overrides = (presets.find((p) => p.id === choice) ?? presets[0]).overrides
    const playerCount = readPlayers(game.id, game.seatCounts)
    const settings = readSettings(game.id, game.timers)
    const code = newGameCode()
    sessionStorage.setItem(setupKey(game.id, code), JSON.stringify({ playerCount, overrides, settings } satisfies GameSetup))
    navigate(roomPath(game.id, code))
  }

  return (
    <main className="home min-h-full flex flex-col items-center gap-3 p-4">
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

      {/* Only the games of this one that need the player now: the Tricks home lists the rest. */}
      <YourGames game={game.id} onlyYours />

      {/* One column on a phone, Play above Learn; from md, Play and Learn side by side, the rest across both. */}
      <div className="home-width grid gap-3 md:grid-cols-2 md:gap-4 md:items-start">
      <section className="panel p-4 grid gap-3">
        <h2 className="display text-xl">Play with friends</h2>
        <p>Create a game, then invite friends or add computers. Choose the table size, the rules and the pace in the lobby.</p>
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

      <LearnToPlay />

      <GameStrip current={game.id} />
      </div>
    </main>
  )
}
