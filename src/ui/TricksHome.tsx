import type { MouseEvent } from 'react'
import { GAMES, type GameId } from './games'
import { ThemePicker } from './ThemePicker'
import { gamePath, opensInPlace } from './routes'
import { tableSizes } from './seats'
import { navigate } from './session'

/** `/`: the games, and the look that every game shares. Loads no game. */
export function TricksHome() {
  // A modified or middle click keeps the link's own behaviour, such as opening a new tab.
  const open = (game: GameId) => (e: MouseEvent) => {
    if (!opensInPlace(e)) return
    e.preventDefault()
    navigate(gamePath(game))
  }
  return (
    <main className="min-h-full flex flex-col items-center gap-5 p-4 pb-10">
      <header className="text-center mt-6">
        <h1 className="display text-7xl text-accent">Tricks</h1>
        <p className="text-muted mt-2">Trick-taking card games to play with friends or the computer.</p>
      </header>

      <section className="w-full max-w-sm grid gap-3" aria-label="Games">
        {GAMES.map((game) => (
          <a key={game.id} href={gamePath(game.id)} onClick={open(game.id)} className="panel p-4 grid gap-1">
            <h2 className="display text-xl">{game.name}</h2>
            <p>
              {game.tagline} {tableSizes(game.seatCounts)}
            </p>
          </a>
        ))}
      </section>

      <section className="panel p-4 w-full max-w-sm grid gap-3">
        <h2 className="display text-lg">Look</h2>
        <ThemePicker />
      </section>
    </main>
  )
}
